//! The trade engine: fills in, trades out. `compute` is a pure function of
//! its input, rebuilt from scratch whenever any input changes, so fixing a
//! rule fixes all of history.

pub mod behavior;
pub mod decisions;
pub mod ids;
pub mod instrument;
pub mod labels;
pub mod measure;
pub mod model;
pub mod normalize;
pub mod notes;
pub mod plans;
pub mod positions;
pub mod read;
pub mod rebuild;
pub mod service;
pub mod stitch;
pub mod store;
pub mod suggest;
pub mod wash;

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use uuid::Uuid;

use decisions::{Decision, DecisionOutcome};
use instrument::Alias;
use model::{
    AssetClass, Event, EventKind, Instrument, Issue, Severity, Trade, TradeKind, WorkspaceInfo,
};
use normalize::{ActivityRow, ManualFill, OpeningPosition};
use stitch::{StockLeg, dust};
use suggest::{AliasSuggestion, StrategySuggestion};

/// Bump whenever a rule changes; every user is rebuilt on the next start.
pub const ENGINE_VERSION: i32 = 1;

#[derive(Clone, Debug, Default)]
pub struct EngineInput {
    pub workspaces: Vec<WorkspaceInfo>,
    pub activities: Vec<ActivityRow>,
    pub manual_fills: Vec<ManualFill>,
    pub openings: Vec<OpeningPosition>,
    pub aliases: Vec<Alias>,
    pub rejected_aliases: Vec<(String, String)>,
    pub decisions: Vec<Decision>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct UnattributedIncome {
    pub workspace_id: Uuid,
    pub instrument_key: String,
    pub at: DateTime<Utc>,
    pub amount: Decimal,
}

#[derive(Clone, Debug, Default)]
pub struct EngineOutput {
    pub trades: Vec<Trade>,
    /// Problems not tied to a single trade.
    pub issues: Vec<Issue>,
    pub decision_outcomes: Vec<DecisionOutcome>,
    pub alias_suggestions: Vec<AliasSuggestion>,
    pub strategy_suggestions: Vec<StrategySuggestion>,
    pub unattributed_income: Vec<UnattributedIncome>,
}

type GroupKey = (Uuid, String);

fn link_legs(
    legs: &[StockLeg],
    groups: &mut BTreeMap<GroupKey, Vec<Event>>,
    aliases: &[Alias],
    tax_adjustments: &mut HashMap<String, Decimal>,
    issues: &mut Vec<Issue>,
) -> Vec<(String, String)> {
    let mut links = Vec::new();
    let mut used: HashSet<String> = HashSet::new();
    for leg in legs {
        let instrument = Instrument::stock(&leg.underlying);
        let key = instrument::resolve(&instrument.key(), leg.at, aliases);
        let events = groups.entry((leg.workspace_id, key.clone())).or_default();
        let matching = events
            .iter()
            .filter(|e| !used.contains(&e.key))
            .filter(|e| e.at >= leg.at - Duration::days(1) && e.at <= leg.at + Duration::days(5))
            .filter(|e| match &e.kind {
                EventKind::Fill {
                    side,
                    quantity,
                    price,
                    ..
                } => {
                    *side == leg.side
                        && (*quantity - leg.quantity).abs() <= dust()
                        && (*price - leg.strike).abs() <= Decimal::new(1, 2)
                }
                _ => false,
            })
            .min_by_key(|e| (e.at - leg.at).num_seconds().abs())
            .map(|e| e.key.clone());
        let stock_key = match matching {
            Some(found) => found,
            None => {
                let derived = format!("derived:{}:stock", leg.source_key);
                events.push(Event {
                    key: derived.clone(),
                    workspace_id: leg.workspace_id,
                    instrument,
                    instrument_key: key.clone(),
                    at: leg.at,
                    kind: EventKind::Fill {
                        side: leg.side,
                        quantity: leg.quantity,
                        price: leg.strike,
                        fee: Decimal::ZERO,
                        intent: None,
                    },
                    derived: true,
                });
                issues.push(
                    Issue::new(
                        "assignment_stock_leg_derived",
                        Severity::Info,
                        format!(
                            "The brokerage reported no stock fill for this {} assignment or exercise; Tradstry added one at the strike",
                            leg.underlying
                        ),
                    )
                    .workspace(leg.workspace_id)
                    .instrument(&key)
                    .fill(&derived),
                );
                derived
            }
        };
        used.insert(stock_key.clone());
        tax_adjustments.insert(stock_key.clone(), leg.tax_adjustment);
        links.push((leg.source_key.clone(), stock_key));
    }
    links
}

fn attribute_dividends(trades: &mut [Trade], dividends: &[Event]) -> Vec<UnattributedIncome> {
    let mut unattributed = Vec::new();
    for dividend in dividends {
        let EventKind::Dividend { amount } = dividend.kind else {
            continue;
        };
        let candidates = || {
            trades.iter().enumerate().filter(|(_, t)| {
                t.kind == TradeKind::Single
                    && t.workspace_id == dividend.workspace_id
                    && t.instrument_key == dividend.instrument_key
            })
        };
        let open = candidates()
            .find(|(_, t)| {
                t.opened_at <= dividend.at && t.closed_at.is_none_or(|closed| closed >= dividend.at)
            })
            .map(|(i, _)| i);
        let recent = || {
            candidates()
                .filter(|(_, t)| {
                    t.closed_at.is_some_and(|closed| {
                        closed <= dividend.at && closed >= dividend.at - Duration::days(60)
                    })
                })
                .max_by_key(|(_, t)| t.closed_at)
                .map(|(i, _)| i)
        };
        match open.or_else(recent) {
            Some(index) => trades[index].income += amount,
            None => unattributed.push(UnattributedIncome {
                workspace_id: dividend.workspace_id,
                instrument_key: dividend.instrument_key.clone(),
                at: dividend.at,
                amount,
            }),
        }
    }
    unattributed
}

pub fn compute(input: &EngineInput) -> EngineOutput {
    let workspaces: HashMap<Uuid, WorkspaceInfo> =
        input.workspaces.iter().map(|w| (w.id, w.clone())).collect();
    let fallback = |id: Uuid| WorkspaceInfo {
        id,
        can_short: true,
        tax: model::TaxStatus::Taxable,
        is_ira: false,
    };
    let mut issues = Vec::new();
    let mut groups: BTreeMap<GroupKey, Vec<Event>> = BTreeMap::new();
    let mut dividends = Vec::new();
    for row in &input.activities {
        let (event, found) = normalize::activity(row, &input.aliases);
        issues.extend(found);
        if let Some(event) = event {
            if matches!(event.kind, EventKind::Dividend { .. }) {
                dividends.push(event);
            } else {
                groups
                    .entry((event.workspace_id, event.instrument_key.clone()))
                    .or_default()
                    .push(event);
            }
        }
    }
    for fill in &input.manual_fills {
        let event = normalize::manual(fill, &input.aliases);
        groups
            .entry((event.workspace_id, event.instrument_key.clone()))
            .or_default()
            .push(event);
    }
    let mut openings: HashMap<GroupKey, &OpeningPosition> = HashMap::new();
    for opening in &input.openings {
        let key = instrument::resolve(&opening.instrument.key(), opening.as_of, &input.aliases);
        groups
            .entry((opening.workspace_id, key.clone()))
            .or_default();
        openings.insert((opening.workspace_id, key), opening);
    }

    let mut trades = Vec::new();
    let mut tax_adjustments: HashMap<String, Decimal> = HashMap::new();
    let mut legs = Vec::new();
    let option_keys: Vec<GroupKey> = groups
        .iter()
        .filter(|(_, events)| {
            events
                .first()
                .is_some_and(|e| e.instrument.asset_class == AssetClass::Option)
        })
        .map(|(key, _)| key.clone())
        .collect();
    for key in &option_keys {
        let events = groups.remove(key).unwrap_or_default();
        let workspace = workspaces
            .get(&key.0)
            .cloned()
            .unwrap_or_else(|| fallback(key.0));
        let out = stitch::stitch(
            events,
            &workspace,
            openings.get(key).copied(),
            &tax_adjustments,
        );
        trades.extend(out.trades);
        issues.extend(out.issues);
        legs.extend(out.legs);
    }
    let links = link_legs(
        &legs,
        &mut groups,
        &input.aliases,
        &mut tax_adjustments,
        &mut issues,
    );
    for (key, events) in groups {
        let workspace = workspaces
            .get(&key.0)
            .cloned()
            .unwrap_or_else(|| fallback(key.0));
        let out = stitch::stitch(
            events,
            &workspace,
            openings.get(&key).copied(),
            &tax_adjustments,
        );
        trades.extend(out.trades);
        issues.extend(out.issues);
    }

    let mut used_ids = HashSet::new();
    for trade in &mut trades {
        let first = trade.fills.first().map_or("", |f| f.key.as_str());
        let mut id = ids::single(trade.workspace_id, &trade.instrument_key, first);
        let mut n = 1;
        while !used_ids.insert(id.clone()) {
            id = ids::single(
                trade.workspace_id,
                &trade.instrument_key,
                &format!("{first}#{n}"),
            );
            n += 1;
        }
        trade.id = id;
        for issue in &mut trade.issues {
            issue.trade_id = Some(trade.id.clone());
        }
    }
    let owner = |trades: &[Trade], fill: &str| {
        trades
            .iter()
            .find(|t| t.fills.iter().any(|f| f.key == fill))
            .map(|t| t.id.clone())
    };
    for (option_fill, stock_fill) in &links {
        if let (Some(a), Some(b)) = (owner(&trades, option_fill), owner(&trades, stock_fill)) {
            for trade in trades.iter_mut() {
                if trade.id == a && !trade.related.contains(&b) {
                    trade.related.push(b.clone());
                } else if trade.id == b && !trade.related.contains(&a) {
                    trade.related.push(a.clone());
                }
            }
        }
    }
    let unattributed_income = attribute_dividends(&mut trades, &dividends);
    let decision_outcomes = decisions::apply(&mut trades, &input.decisions);
    issues.extend(wash::apply(&mut trades, &workspaces));
    trades.sort_by(|a, b| (a.opened_at, &a.id).cmp(&(b.opened_at, &b.id)));

    let alias_suggestions = suggest::aliases(&trades, &input.aliases, &input.rejected_aliases);
    let strategy_suggestions = suggest::strategies(&trades);
    let mut seen = BTreeSet::new();
    issues.retain(|issue| {
        seen.insert((
            issue.code.clone(),
            issue.workspace_id,
            issue.instrument_key.clone(),
            issue.fill_key.clone(),
        ))
    });
    EngineOutput {
        trades,
        issues,
        decision_outcomes,
        alias_suggestions,
        strategy_suggestions,
        unattributed_income,
    }
}
