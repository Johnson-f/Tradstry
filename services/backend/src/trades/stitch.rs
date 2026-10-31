//! Walks one instrument's events in one workspace and builds flat-to-flat
//! trades over FIFO lots.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;

use super::model::{
    Closure, ClosureKind, Direction, Event, EventKind, FillRole, Intent, Issue, Lot, OptionRight,
    Severity, Side, Trade, TradeFill, TradeKind, TradeStatus, WorkspaceInfo,
};
use super::normalize::{OpeningPosition, opening_key};

/// Below this many shares a position counts as flat; brokers leave dust
/// after fractional sells.
pub fn dust() -> Decimal {
    Decimal::new(1, 4)
}

/// An assignment or exercise that moves stock, worked out from the option.
#[derive(Clone, Debug, PartialEq)]
pub struct StockLeg {
    pub source_key: String,
    pub option_first_fill: String,
    pub workspace_id: uuid::Uuid,
    pub underlying: String,
    pub side: Side,
    pub quantity: Decimal,
    pub strike: Decimal,
    pub at: DateTime<Utc>,
    /// Per share; added to cost or proceeds for tax.
    pub tax_adjustment: Decimal,
}

#[derive(Default)]
pub struct Stitched {
    pub trades: Vec<Trade>,
    pub issues: Vec<Issue>,
    pub legs: Vec<StockLeg>,
}

fn rank(kind: &EventKind) -> u8 {
    match kind {
        EventKind::Split { .. } => 0,
        EventKind::TransferIn { .. } | EventKind::StockDividend { .. } => 1,
        EventKind::Fill { .. } => 2,
        EventKind::TransferOut { .. } => 3,
        EventKind::Expire { .. } | EventKind::Assign { .. } | EventKind::Exercise { .. } => 4,
        EventKind::Dividend { .. } => 5,
    }
}

pub fn sort_events(events: &mut [Event]) {
    events.sort_by(|a, b| (a.at, rank(&a.kind), &a.key).cmp(&(b.at, rank(&b.kind), &b.key)));
}

/// Which of several fills at the same instant comes first. A position never
/// opens in a direction the account cannot hold, reducing beats adding, and
/// an option's close intent beats its open intent.
fn pick(group: &[Event], current: Option<Direction>, can_short: bool) -> usize {
    let score = |event: &Event| {
        let EventKind::Fill { side, intent, .. } = &event.kind else {
            return (9, 9, 9);
        };
        let intent_order = match intent {
            Some(Intent::Close) => 0,
            None => 1,
            Some(Intent::Open) => 2,
        };
        match current {
            Some(direction) => (u8::from(!direction.reduced_by(*side)), intent_order, 0),
            None => {
                let allowed = *side == Side::Buy || can_short;
                (
                    u8::from(!allowed),
                    2 - intent_order.min(2),
                    u8::from(*side == Side::Sell),
                )
            }
        }
    };
    (0..group.len())
        .min_by(|&a, &b| (score(&group[a]), &group[a].key).cmp(&(score(&group[b]), &group[b].key)))
        .expect("group is not empty")
}

struct Stitcher<'a> {
    workspace: &'a WorkspaceInfo,
    tax_adjustments: &'a HashMap<String, Decimal>,
    current: Option<Trade>,
    out: Stitched,
}

impl<'a> Stitcher<'a> {
    fn open_quantity(&self) -> Decimal {
        self.current
            .as_ref()
            .map(|trade| trade.lots.iter().map(|lot| lot.quantity).sum())
            .unwrap_or_default()
    }

    fn direction(&self) -> Option<Direction> {
        self.current.as_ref().and_then(|trade| trade.direction)
    }

    fn new_trade(event: &Event, direction: Option<Direction>, status: TradeStatus) -> Trade {
        Trade {
            id: String::new(),
            kind: TradeKind::Single,
            workspace_id: event.workspace_id,
            instrument_key: event.instrument_key.clone(),
            instrument: event.instrument.clone(),
            direction,
            status,
            opened_at: event.at,
            closed_at: None,
            fills: Vec::new(),
            lots: Vec::new(),
            income: Decimal::ZERO,
            parent_id: None,
            children: Vec::new(),
            related: Vec::new(),
            decision_id: None,
            strategy_label: None,
            issues: Vec::new(),
        }
    }

    fn issue(&mut self, code: &str, severity: Severity, message: String, event: &Event) {
        self.out.issues.push(
            Issue::new(code, severity, message)
                .workspace(event.workspace_id)
                .instrument(&event.instrument_key)
                .fill(&event.key),
        );
    }

    #[allow(clippy::too_many_arguments)]
    fn add_lot(
        &mut self,
        event: &Event,
        role: FillRole,
        quantity: Decimal,
        price: Decimal,
        fee: Decimal,
        cost_known: bool,
        holding_from: Option<DateTime<Utc>>,
    ) {
        let tax_cost_adjustment = self
            .tax_adjustments
            .get(&event.key)
            .copied()
            .unwrap_or_default();
        let trade = self.current.as_mut().expect("a trade is open");
        let direction = trade.direction.expect("open trades have a direction");
        let id = format!("{}#{}", event.key, trade.lots.len());
        trade.lots.push(Lot {
            id,
            opened_by: event.key.clone(),
            acquired_at: event.at,
            holding_from: holding_from.unwrap_or(event.at),
            direction,
            original_quantity: quantity,
            quantity,
            cost_per_unit: price,
            fee_per_unit: if quantity.is_zero() {
                Decimal::ZERO
            } else {
                fee / quantity
            },
            cost_known,
            purchase: matches!(role, FillRole::Open | FillRole::Add | FillRole::FlipOpen),
            tax_cost_adjustment,
            wash_adjustments: Vec::new(),
            closures: Vec::new(),
        });
        trade.fills.push(TradeFill {
            key: event.key.clone(),
            role,
            at: event.at,
            quantity,
            price,
            fee,
            derived: event.derived,
        });
    }

    fn start(&mut self, event: &Event, direction: Direction) {
        self.current = Some(Self::new_trade(event, Some(direction), TradeStatus::Open));
    }

    /// Closes up to `quantity` FIFO and returns what was not covered.
    #[allow(clippy::too_many_arguments)]
    fn reduce(
        &mut self,
        event: &Event,
        role: FillRole,
        quantity: Decimal,
        price: Decimal,
        fee: Decimal,
        kind: ClosureKind,
        non_economic: bool,
    ) -> Decimal {
        let proceeds_adjustment = self
            .tax_adjustments
            .get(&event.key)
            .copied()
            .unwrap_or_default();
        let folded = matches!(kind, ClosureKind::Assign | ClosureKind::Exercise);
        let total = quantity;
        let mut remaining = quantity;
        let trade = self.current.as_mut().expect("a trade is open");
        let multiplier = trade.instrument.multiplier;
        let mut covered = Decimal::ZERO;
        for lot in trade
            .lots
            .iter_mut()
            .filter(|lot| lot.quantity > Decimal::ZERO)
        {
            if remaining.is_zero() {
                break;
            }
            let take = remaining.min(lot.quantity);
            lot.quantity -= take;
            remaining -= take;
            covered += take;
            lot.closures.push(Closure {
                closed_by: event.key.clone(),
                closed_at: event.at,
                quantity: take,
                exit_price: price,
                fee: fee * take / total,
                gross: (price - lot.cost_per_unit) * take * multiplier * lot.direction.sign(),
                kind,
                non_economic,
                tax_proceeds_adjustment: proceeds_adjustment,
                tax_folded: folded,
                tax: None,
            });
        }
        if !covered.is_zero() {
            trade.fills.push(TradeFill {
                key: event.key.clone(),
                role,
                at: event.at,
                quantity: covered,
                price,
                fee: fee * covered / total,
                derived: event.derived,
            });
        }
        remaining
    }

    /// Closes the trade if it is flat, sweeping dust into a final closure.
    fn settle(&mut self, event: &Event, price: Decimal) {
        let open = self.open_quantity();
        if open.is_zero() {
            self.finish(event.at);
        } else if open < dust() {
            let trade = self.current.as_mut().expect("a trade is open");
            let multiplier = trade.instrument.multiplier;
            for lot in trade
                .lots
                .iter_mut()
                .filter(|lot| lot.quantity > Decimal::ZERO)
            {
                let take = lot.quantity;
                lot.quantity = Decimal::ZERO;
                lot.closures.push(Closure {
                    closed_by: event.key.clone(),
                    closed_at: event.at,
                    quantity: take,
                    exit_price: price,
                    fee: Decimal::ZERO,
                    gross: (price - lot.cost_per_unit) * take * multiplier * lot.direction.sign(),
                    kind: ClosureKind::Dust,
                    non_economic: false,
                    tax_proceeds_adjustment: Decimal::ZERO,
                    tax_folded: false,
                    tax: None,
                });
            }
            self.issue(
                "dust_residual",
                Severity::Info,
                format!("Closed a leftover {open} after this fill"),
                event,
            );
            self.finish(event.at);
        }
    }

    fn finish(&mut self, at: DateTime<Utc>) {
        if let Some(mut trade) = self.current.take() {
            if trade.status == TradeStatus::Open {
                trade.status = if trade.lots.iter().all(|lot| lot.cost_known) {
                    TradeStatus::Closed
                } else {
                    TradeStatus::Incomplete
                };
            }
            trade.closed_at = Some(at);
            self.out.trades.push(trade);
        }
    }

    fn orphan(
        &mut self,
        event: &Event,
        side: Side,
        quantity: Decimal,
        price: Decimal,
        fee: Decimal,
    ) {
        let closing = match side {
            Side::Sell => Direction::Long,
            Side::Buy => Direction::Short,
        };
        let mut trade = Self::new_trade(event, Some(closing), TradeStatus::Incomplete);
        trade.fills.push(TradeFill {
            key: event.key.clone(),
            role: FillRole::Orphan,
            at: event.at,
            quantity,
            price,
            fee,
            derived: event.derived,
        });
        trade.closed_at = Some(event.at);
        trade.issues.push(
            Issue::new(
                "missing_opening_history",
                Severity::Warning,
                format!(
                    "{} {quantity} {} with nothing open; its opening is not in the imported history",
                    match side {
                        Side::Buy => "Bought",
                        Side::Sell => "Sold",
                    },
                    event.instrument.symbol
                ),
            )
            .workspace(event.workspace_id)
            .instrument(&event.instrument_key)
            .fill(&event.key),
        );
        self.out.trades.push(trade);
    }

    fn fill(&mut self, event: &Event) {
        let EventKind::Fill {
            side,
            quantity,
            price,
            fee,
            intent,
        } = event.kind.clone()
        else {
            unreachable!("only fills reach here");
        };
        let can_open = |side: Side| {
            (side == Side::Buy || self.workspace.can_short) && intent != Some(Intent::Close)
        };
        match self.direction() {
            None => {
                if can_open(side) {
                    self.start(event, Direction::opened_by(side));
                    self.add_lot(event, FillRole::Open, quantity, price, fee, true, None);
                } else {
                    self.orphan(event, side, quantity, price, fee);
                }
            }
            Some(direction) if !direction.reduced_by(side) => {
                self.add_lot(event, FillRole::Add, quantity, price, fee, true, None);
            }
            Some(_) => {
                let open = self.open_quantity();
                let flips = quantity > open + dust();
                let role = if flips {
                    FillRole::FlipClose
                } else if quantity + dust() >= open {
                    FillRole::Close
                } else {
                    FillRole::Reduce
                };
                let closing = quantity.min(open);
                let closing_fee = fee * closing / quantity;
                self.reduce(
                    event,
                    role,
                    closing,
                    price,
                    closing_fee,
                    ClosureKind::Trade,
                    false,
                );
                if flips {
                    self.finish(event.at);
                    let rest = quantity - closing;
                    let rest_fee = fee - closing_fee;
                    if can_open(side) {
                        self.start(event, Direction::opened_by(side));
                        self.add_lot(event, FillRole::FlipOpen, rest, price, rest_fee, true, None);
                    } else {
                        self.orphan(event, side, rest, price, rest_fee);
                    }
                } else {
                    self.settle(event, price);
                }
            }
        }
    }

    fn split(&mut self, event: &Event, ratio: Option<Decimal>, delta: Option<Decimal>) {
        let open = self.open_quantity();
        if self.current.is_none() || open.is_zero() {
            self.issue(
                "split_without_position",
                Severity::Info,
                "A split arrived with nothing open".into(),
                event,
            );
            return;
        }
        let ratio = ratio.or_else(|| {
            let delta = delta?;
            [(open + delta) / open, (open - delta) / open]
                .into_iter()
                .find(|ratio| *ratio > Decimal::ZERO && *ratio != Decimal::ONE)
        });
        let Some(ratio) = ratio else {
            self.issue(
                "split_ratio_unknown",
                Severity::Warning,
                "Could not tell this split's ratio".into(),
                event,
            );
            return;
        };
        let trade = self.current.as_mut().expect("a trade is open");
        for lot in trade.lots.iter_mut() {
            lot.quantity *= ratio;
            lot.original_quantity *= ratio;
            lot.cost_per_unit /= ratio;
            lot.fee_per_unit /= ratio;
            lot.tax_cost_adjustment /= ratio;
        }
        trade.fills.push(TradeFill {
            key: event.key.clone(),
            role: FillRole::Split,
            at: event.at,
            quantity: (open * ratio - open).abs(),
            price: Decimal::ZERO,
            fee: Decimal::ZERO,
            derived: event.derived,
        });
    }

    fn option_end(&mut self, event: &Event, quantity: Option<Decimal>) {
        let (role, kind) = match event.kind {
            EventKind::Expire { .. } => (FillRole::Expire, ClosureKind::Expire),
            EventKind::Assign { .. } => (FillRole::Assign, ClosureKind::Assign),
            _ => (FillRole::Exercise, ClosureKind::Exercise),
        };
        let open = self.open_quantity();
        let Some(direction) = self.direction().filter(|_| !open.is_zero()) else {
            self.issue(
                "option_event_without_position",
                Severity::Warning,
                format!("{role} with no open contracts"),
                event,
            );
            return;
        };
        let contracts = quantity.unwrap_or(open).min(open);
        let premium = {
            let trade = self.current.as_ref().expect("a trade is open");
            let mut left = contracts;
            let mut cost = Decimal::ZERO;
            for lot in trade.lots.iter().filter(|lot| lot.quantity > Decimal::ZERO) {
                let take = left.min(lot.quantity);
                cost += take * lot.cost_per_unit;
                left -= take;
            }
            cost / contracts
        };
        let first_fill = self
            .current
            .as_ref()
            .and_then(|t| t.fills.first())
            .map(|f| f.key.clone());
        self.reduce(
            event,
            role,
            contracts,
            Decimal::ZERO,
            Decimal::ZERO,
            kind,
            false,
        );
        if kind != ClosureKind::Expire
            && let Some(option) = event.instrument.option.as_ref()
        {
            let side = match (direction, option.right) {
                (Direction::Long, OptionRight::Call) | (Direction::Short, OptionRight::Put) => {
                    Side::Buy
                }
                _ => Side::Sell,
            };
            let tax_adjustment = match (direction, side) {
                (Direction::Long, Side::Buy) | (Direction::Short, Side::Sell) => premium,
                _ => -premium,
            };
            self.out.legs.push(StockLeg {
                source_key: event.key.clone(),
                option_first_fill: first_fill.unwrap_or_default(),
                workspace_id: event.workspace_id,
                underlying: option.underlying.clone(),
                side,
                quantity: contracts * event.instrument.multiplier,
                strike: option.strike,
                at: event.at,
                tax_adjustment,
            });
        }
        self.settle(event, Decimal::ZERO);
    }

    fn event(&mut self, event: &Event) {
        match &event.kind {
            EventKind::Fill { .. } => self.fill(event),
            EventKind::Split { ratio, delta } => self.split(event, *ratio, *delta),
            EventKind::StockDividend { quantity } => match self.direction() {
                Some(Direction::Long) => {
                    let holding_from = self
                        .current
                        .as_ref()
                        .and_then(|t| t.lots.iter().find(|l| l.quantity > Decimal::ZERO))
                        .map(|lot| lot.holding_from);
                    self.add_lot(
                        event,
                        FillRole::StockDividend,
                        *quantity,
                        Decimal::ZERO,
                        Decimal::ZERO,
                        true,
                        holding_from,
                    );
                }
                _ => self.issue(
                    "stock_dividend_without_position",
                    Severity::Info,
                    "A stock dividend arrived with no long position".into(),
                    event,
                ),
            },
            EventKind::TransferIn {
                quantity,
                cost_per_unit,
            } => {
                if self.direction() == Some(Direction::Short) {
                    self.issue(
                        "transfer_into_short",
                        Severity::Warning,
                        "Shares transferred into a short position".into(),
                        event,
                    );
                    return;
                }
                if self.current.is_none() {
                    self.start(event, Direction::Long);
                }
                if cost_per_unit.is_none() {
                    self.issue(
                        "transfer_in_without_cost",
                        Severity::Warning,
                        "Shares transferred in without a cost; add an opening position for them"
                            .into(),
                        event,
                    );
                }
                self.add_lot(
                    event,
                    FillRole::TransferIn,
                    *quantity,
                    cost_per_unit.unwrap_or_default(),
                    Decimal::ZERO,
                    cost_per_unit.is_some(),
                    None,
                );
            }
            EventKind::TransferOut {
                quantity,
                value_per_unit,
            } => {
                if self.direction() != Some(Direction::Long) {
                    self.issue(
                        "transfer_out_without_position",
                        Severity::Warning,
                        "Shares transferred out with no long position".into(),
                        event,
                    );
                    return;
                }
                let at_cost = value_per_unit.is_none();
                let price = value_per_unit.unwrap_or_else(|| {
                    self.current
                        .as_ref()
                        .and_then(|t| t.lots.iter().find(|l| l.quantity > Decimal::ZERO))
                        .map(|lot| lot.cost_per_unit)
                        .unwrap_or_default()
                });
                let left = self.reduce(
                    event,
                    FillRole::TransferOut,
                    *quantity,
                    price,
                    Decimal::ZERO,
                    ClosureKind::TransferOut,
                    true,
                );
                if at_cost {
                    self.issue(
                        "transfer_out_at_cost",
                        Severity::Info,
                        "Transferred out at cost; no value was reported".into(),
                        event,
                    );
                }
                if !left.is_zero() {
                    self.issue(
                        "transfer_out_exceeds_position",
                        Severity::Warning,
                        format!("{left} more transferred out than held"),
                        event,
                    );
                }
                self.settle(event, price);
            }
            EventKind::Expire { quantity }
            | EventKind::Assign { quantity }
            | EventKind::Exercise { quantity } => self.option_end(event, *quantity),
            EventKind::Dividend { .. } => {}
        }
    }
}

/// Stitches one instrument's events in one workspace. `events` must share a
/// workspace and instrument key; they are sorted here.
pub fn stitch(
    mut events: Vec<Event>,
    workspace: &WorkspaceInfo,
    opening: Option<&OpeningPosition>,
    tax_adjustments: &HashMap<String, Decimal>,
) -> Stitched {
    sort_events(&mut events);
    let mut stitcher = Stitcher {
        workspace,
        tax_adjustments,
        current: None,
        out: Stitched::default(),
    };
    if let Some(opening) = opening {
        let before = events.iter().filter(|e| e.at < opening.as_of).count();
        if before > 0
            && let Some(first) = events.first()
        {
            stitcher.issue(
                "fills_before_opening_ignored",
                Severity::Info,
                format!("{before} events before the opening position were left out"),
                first,
            );
        }
        events.retain(|e| e.at >= opening.as_of);
        let seed = Event {
            key: opening_key(opening.id),
            workspace_id: opening.workspace_id,
            instrument_key: events
                .first()
                .map(|e| e.instrument_key.clone())
                .unwrap_or_else(|| opening.instrument.key()),
            instrument: opening.instrument.clone(),
            at: opening.as_of,
            kind: EventKind::TransferIn {
                quantity: opening.quantity.abs(),
                cost_per_unit: Some(opening.cost_per_unit),
            },
            derived: false,
        };
        if !opening.quantity.is_zero() {
            let direction = if opening.quantity < Decimal::ZERO {
                Direction::Short
            } else {
                Direction::Long
            };
            stitcher.start(&seed, direction);
            stitcher.add_lot(
                &seed,
                FillRole::Open,
                opening.quantity.abs(),
                opening.cost_per_unit,
                Decimal::ZERO,
                true,
                Some(opening.acquired_at),
            );
            if let Some(trade) = stitcher.current.as_mut() {
                trade.opened_at = opening.acquired_at.min(opening.as_of);
                for lot in trade.lots.iter_mut() {
                    lot.acquired_at = opening.acquired_at;
                }
            }
        }
    }
    let mut index = 0;
    while index < events.len() {
        let is_fill = matches!(events[index].kind, EventKind::Fill { .. });
        let mut end = index + 1;
        if is_fill {
            while end < events.len()
                && events[end].at == events[index].at
                && matches!(events[end].kind, EventKind::Fill { .. })
            {
                end += 1;
            }
        }
        let mut group: Vec<Event> = events[index..end].to_vec();
        while !group.is_empty() {
            let chosen = if group.len() == 1 {
                0
            } else {
                pick(&group, stitcher.direction(), workspace.can_short)
            };
            let event = group.remove(chosen);
            stitcher.event(&event);
        }
        index = end;
    }
    if let Some(trade) = stitcher.current.take() {
        stitcher.out.trades.push(trade);
    }
    stitcher.out
}
