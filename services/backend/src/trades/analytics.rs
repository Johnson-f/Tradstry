//! Statistics over trades. Every closed trade counts, journaled or not;
//! strategies count once (their legs do not), and transfers and trades with
//! missing history are left out.

use std::collections::{BTreeMap, HashMap};

use async_graphql::ID;
use chrono::{DateTime, Datelike, NaiveDate, Timelike, Utc};
use chrono_tz::America::New_York;
use rust_decimal::Decimal;
use serde::Serialize;

use super::labels::LabelRef;

#[derive(Clone, Debug)]
pub struct StatTrade {
    pub symbol: String,
    pub direction: Option<String>,
    pub opened_at: DateTime<Utc>,
    pub closed_at: DateTime<Utc>,
    pub net: Decimal,
    /// Net over what the entries cost, in percent; None without a known cost.
    pub return_pct: Option<Decimal>,
    pub holding_seconds: i64,
    pub r: Option<Decimal>,
    pub edges: Vec<LabelRef>,
    pub entry_tactics: Vec<LabelRef>,
    pub tags: Vec<LabelRef>,
    pub mistakes: Vec<LabelRef>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, async_graphql::SimpleObject)]
pub struct Bucket {
    pub key: String,
    /// Set for label breakdowns; null for their "None" bucket and for the rest.
    pub label_id: Option<ID>,
    pub color: Option<String>,
    pub trades: usize,
    pub wins: usize,
    pub losses: usize,
    pub net: Decimal,
    pub win_rate: Option<Decimal>,
    pub expectancy: Option<Decimal>,
    pub expectancy_r: Option<Decimal>,
}

/// Results for one edge and entry tactic pair; null means "None". A trade
/// counts in every pair its edges and tactics make.
#[derive(Clone, Debug, PartialEq, Serialize, async_graphql::SimpleObject)]
pub struct EdgeTacticCell {
    pub edge: Option<LabelRef>,
    pub entry_tactic: Option<LabelRef>,
    pub trades: usize,
    pub wins: usize,
    pub losses: usize,
    pub net: Decimal,
    pub win_rate: Option<Decimal>,
    pub expectancy: Option<Decimal>,
}

/// What a mistake costs: results of trades with it, against every other
/// trade in the same filter.
#[derive(Clone, Debug, PartialEq, Serialize, async_graphql::SimpleObject)]
pub struct MistakeCost {
    pub mistake: LabelRef,
    pub trades: usize,
    pub net: Decimal,
    pub expectancy_with: Option<Decimal>,
    pub expectancy_without: Option<Decimal>,
}

#[derive(Clone, Debug, PartialEq, Serialize, async_graphql::SimpleObject)]
pub struct EquityPoint {
    pub day: NaiveDate,
    pub net: Decimal,
    pub cumulative: Decimal,
    /// Trades closed that day.
    pub trades: usize,
    pub wins: usize,
    pub losses: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, async_graphql::SimpleObject)]
pub struct Stats {
    pub trades: usize,
    pub wins: usize,
    pub losses: usize,
    pub breakeven: usize,
    /// Wins over wins plus losses; breakeven trades are left out.
    pub win_rate: Option<Decimal>,
    pub net: Decimal,
    pub gross_profit: Decimal,
    pub gross_loss: Decimal,
    pub average_win: Option<Decimal>,
    pub average_loss: Option<Decimal>,
    /// Mean return of winning trades, in percent; each trade counts equally.
    pub average_win_pct: Option<Decimal>,
    /// Mean return of losing trades, in percent (negative).
    pub average_loss_pct: Option<Decimal>,
    pub largest_win: Option<Decimal>,
    pub largest_loss: Option<Decimal>,
    pub profit_factor: Option<Decimal>,
    pub expectancy: Option<Decimal>,
    pub expectancy_r: Option<Decimal>,
    pub r_trades: usize,
    pub average_hold_seconds: Option<i64>,
    pub max_drawdown: Decimal,
    pub current_drawdown: Decimal,
    pub longest_win_streak: usize,
    pub longest_loss_streak: usize,
    /// Positive for wins in a row, negative for losses.
    pub current_streak: i64,
    pub equity: Vec<EquityPoint>,
    pub by_symbol: Vec<Bucket>,
    pub by_direction: Vec<Bucket>,
    pub by_weekday: Vec<Bucket>,
    pub by_hour: Vec<Bucket>,
    pub by_hold: Vec<Bucket>,
    pub by_edge: Vec<Bucket>,
    pub by_entry_tactic: Vec<Bucket>,
    pub by_tag: Vec<Bucket>,
    pub by_mistake: Vec<Bucket>,
    pub edge_tactic: Vec<EdgeTacticCell>,
    pub mistake_costs: Vec<MistakeCost>,
    /// Closed trades with no edge.
    pub untagged: usize,
}

/// Exactly two decimals, so totals read the same everywhere.
pub fn money(value: Decimal) -> Decimal {
    let mut value = value.round_dp(2);
    value.rescale(2);
    value
}

fn ratio(numerator: Decimal, denominator: Decimal) -> Option<Decimal> {
    (!denominator.is_zero()).then(|| (numerator / denominator).round_dp(4))
}

fn expectancy(trades: &[&StatTrade]) -> Option<Decimal> {
    ratio(
        trades.iter().map(|t| t.net).sum(),
        Decimal::from(trades.len()),
    )
    .map(money)
}

fn expectancy_r(trades: &[&StatTrade]) -> Option<Decimal> {
    let r: Vec<Decimal> = trades.iter().filter_map(|t| t.r).collect();
    ratio(r.iter().copied().sum(), Decimal::from(r.len()))
}

fn bucket(key: String, trades: &[&StatTrade]) -> Bucket {
    let wins = trades.iter().filter(|t| t.net > Decimal::ZERO).count();
    let losses = trades.iter().filter(|t| t.net < Decimal::ZERO).count();
    Bucket {
        key,
        label_id: None,
        color: None,
        trades: trades.len(),
        wins,
        losses,
        net: money(trades.iter().map(|t| t.net).sum()),
        win_rate: ratio(Decimal::from(wins), Decimal::from(wins + losses)),
        expectancy: expectancy(trades),
        expectancy_r: expectancy_r(trades),
    }
}

const NONE: &str = "None";

/// Buckets by label; a trade counts under each of its labels. With `with_none`
/// (edges, tactics), trades without any go in a "None" bucket.
fn by_label<F>(trades: &[StatTrade], with_none: bool, labels: F) -> Vec<Bucket>
where
    F: Fn(&StatTrade) -> Vec<LabelRef>,
{
    let mut groups: HashMap<Option<ID>, (Option<LabelRef>, Vec<&StatTrade>)> = HashMap::new();
    for trade in trades {
        let found = labels(trade);
        if found.is_empty() && with_none {
            groups.entry(None).or_default().1.push(trade);
        }
        for label in found {
            groups
                .entry(Some(label.id.clone()))
                .or_insert_with(|| (Some(label.clone()), Vec::new()))
                .1
                .push(trade);
        }
    }
    let mut buckets: Vec<Bucket> = groups
        .into_values()
        .map(|(label, members)| {
            let mut bucket = bucket(
                label.as_ref().map_or(NONE.to_owned(), |l| l.name.clone()),
                &members,
            );
            bucket.label_id = label.as_ref().map(|l| l.id.clone());
            bucket.color = label.and_then(|l| l.color);
            bucket
        })
        .collect();
    buckets.sort_by(|a, b| {
        (a.label_id.is_none(), std::cmp::Reverse(a.trades), &a.key).cmp(&(
            b.label_id.is_none(),
            std::cmp::Reverse(b.trades),
            &b.key,
        ))
    });
    buckets
}

fn edge_tactic(trades: &[StatTrade]) -> Vec<EdgeTacticCell> {
    type Cell<'a> = ((Option<LabelRef>, Option<LabelRef>), Vec<&'a StatTrade>);
    let or_none = |labels: &[LabelRef]| -> Vec<Option<LabelRef>> {
        if labels.is_empty() {
            vec![None]
        } else {
            labels.iter().cloned().map(Some).collect()
        }
    };
    let mut cells: HashMap<(Option<ID>, Option<ID>), Cell> = HashMap::new();
    for trade in trades {
        for edge in or_none(&trade.edges) {
            for tactic in or_none(&trade.entry_tactics) {
                let key = (
                    edge.as_ref().map(|l| l.id.clone()),
                    tactic.as_ref().map(|l| l.id.clone()),
                );
                cells
                    .entry(key)
                    .or_insert_with(|| ((edge.clone(), tactic), Vec::new()))
                    .1
                    .push(trade);
            }
        }
    }
    let mut cells: Vec<EdgeTacticCell> = cells
        .into_values()
        .map(|((edge, entry_tactic), members)| {
            let b = bucket(String::new(), &members);
            EdgeTacticCell {
                edge,
                entry_tactic,
                trades: b.trades,
                wins: b.wins,
                losses: b.losses,
                net: b.net,
                win_rate: b.win_rate,
                expectancy: b.expectancy,
            }
        })
        .collect();
    let name = |label: &Option<LabelRef>| {
        label
            .as_ref()
            .map_or(String::new(), |l| l.name.to_lowercase())
    };
    cells.sort_by(|a, b| {
        (
            a.edge.is_none(),
            name(&a.edge),
            a.entry_tactic.is_none(),
            name(&a.entry_tactic),
        )
            .cmp(&(
                b.edge.is_none(),
                name(&b.edge),
                b.entry_tactic.is_none(),
                name(&b.entry_tactic),
            ))
    });
    cells
}

fn mistake_costs(trades: &[StatTrade]) -> Vec<MistakeCost> {
    let mut labels: HashMap<ID, LabelRef> = HashMap::new();
    for label in trades.iter().flat_map(|t| &t.mistakes) {
        labels
            .entry(label.id.clone())
            .or_insert_with(|| label.clone());
    }
    let mut costs: Vec<MistakeCost> = labels
        .into_values()
        .map(|mistake| {
            let (with, without): (Vec<&StatTrade>, Vec<&StatTrade>) = trades
                .iter()
                .partition(|t| t.mistakes.iter().any(|m| m.id == mistake.id));
            MistakeCost {
                trades: with.len(),
                net: money(with.iter().map(|t| t.net).sum()),
                expectancy_with: expectancy(&with),
                expectancy_without: expectancy(&without),
                mistake,
            }
        })
        .collect();
    costs.sort_by(|a, b| {
        a.net
            .cmp(&b.net)
            .then_with(|| a.mistake.name.cmp(&b.mistake.name))
    });
    costs
}

fn group<F>(trades: &[StatTrade], mut keys: F) -> Vec<Bucket>
where
    F: FnMut(&StatTrade) -> Vec<String>,
{
    let mut groups: BTreeMap<String, Vec<&StatTrade>> = BTreeMap::new();
    for trade in trades {
        for key in keys(trade) {
            groups.entry(key).or_default().push(trade);
        }
    }
    let mut buckets: Vec<Bucket> = groups.into_iter().map(|(k, ts)| bucket(k, &ts)).collect();
    buckets.sort_by(|a, b| b.trades.cmp(&a.trades).then(a.key.cmp(&b.key)));
    buckets
}

/// Mean `return_pct` of the trades that have one, always to two decimals.
fn average_return(trades: &[&StatTrade]) -> Option<Decimal> {
    let returns: Vec<Decimal> = trades.iter().filter_map(|t| t.return_pct).collect();
    ratio(returns.iter().copied().sum(), Decimal::from(returns.len())).map(money)
}

fn hold_bucket(seconds: i64) -> &'static str {
    match seconds {
        s if s < 3_600 => "under 1 hour",
        s if s < 86_400 => "1 hour to 1 day",
        s if s < 7 * 86_400 => "1 to 7 days",
        s if s < 30 * 86_400 => "1 to 4 weeks",
        _ => "over 4 weeks",
    }
}

pub fn compute(mut trades: Vec<StatTrade>) -> Stats {
    trades.sort_by_key(|t| t.closed_at);
    let wins: Vec<&StatTrade> = trades.iter().filter(|t| t.net > Decimal::ZERO).collect();
    let losses: Vec<&StatTrade> = trades.iter().filter(|t| t.net < Decimal::ZERO).collect();
    let gross_profit: Decimal = wins.iter().map(|t| t.net).sum();
    let gross_loss: Decimal = losses.iter().map(|t| t.net).sum();
    let net: Decimal = trades.iter().map(|t| t.net).sum();
    let r: Vec<Decimal> = trades.iter().filter_map(|t| t.r).collect();

    let mut daily: BTreeMap<NaiveDate, Vec<&StatTrade>> = BTreeMap::new();
    for trade in &trades {
        daily
            .entry(trade.closed_at.with_timezone(&New_York).date_naive())
            .or_default()
            .push(trade);
    }
    let mut cumulative = Decimal::ZERO;
    let mut peak = Decimal::ZERO;
    let mut max_drawdown = Decimal::ZERO;
    let equity: Vec<EquityPoint> = daily
        .into_iter()
        .map(|(day, closed)| {
            let value: Decimal = closed.iter().map(|t| t.net).sum();
            cumulative += value;
            peak = peak.max(cumulative);
            max_drawdown = max_drawdown.max(peak - cumulative);
            EquityPoint {
                day,
                net: money(value),
                cumulative: money(cumulative),
                trades: closed.len(),
                wins: closed.iter().filter(|t| t.net > Decimal::ZERO).count(),
                losses: closed.iter().filter(|t| t.net < Decimal::ZERO).count(),
            }
        })
        .collect();

    let (mut longest_win, mut longest_loss, mut streak) = (0usize, 0usize, 0i64);
    for trade in &trades {
        if trade.net > Decimal::ZERO {
            streak = if streak > 0 { streak + 1 } else { 1 };
        } else if trade.net < Decimal::ZERO {
            streak = if streak < 0 { streak - 1 } else { -1 };
        }
        if streak > 0 {
            longest_win = longest_win.max(streak as usize);
        } else {
            longest_loss = longest_loss.max(streak.unsigned_abs() as usize);
        }
    }

    let weekday = |t: &StatTrade| vec![t.opened_at.with_timezone(&New_York).weekday().to_string()];
    let hour = |t: &StatTrade| {
        vec![format!(
            "{:02}:00",
            t.opened_at.with_timezone(&New_York).hour()
        )]
    };
    Stats {
        trades: trades.len(),
        wins: wins.len(),
        losses: losses.len(),
        breakeven: trades.len() - wins.len() - losses.len(),
        win_rate: ratio(
            Decimal::from(wins.len()),
            Decimal::from(wins.len() + losses.len()),
        ),
        net: money(net),
        gross_profit: money(gross_profit),
        gross_loss: money(gross_loss),
        average_win: ratio(gross_profit, Decimal::from(wins.len())).map(money),
        average_loss: ratio(gross_loss, Decimal::from(losses.len())).map(money),
        average_win_pct: average_return(&wins),
        average_loss_pct: average_return(&losses),
        largest_win: wins.iter().map(|t| t.net).max().map(money),
        largest_loss: losses.iter().map(|t| t.net).min().map(money),
        profit_factor: ratio(gross_profit, gross_loss.abs()),
        expectancy: ratio(net, Decimal::from(trades.len())).map(money),
        expectancy_r: ratio(r.iter().copied().sum(), Decimal::from(r.len())),
        r_trades: r.len(),
        average_hold_seconds: (!trades.is_empty())
            .then(|| trades.iter().map(|t| t.holding_seconds).sum::<i64>() / trades.len() as i64),
        max_drawdown: money(max_drawdown),
        current_drawdown: money(peak - cumulative),
        longest_win_streak: longest_win,
        longest_loss_streak: longest_loss,
        current_streak: streak,
        equity,
        by_symbol: group(&trades, |t| vec![t.symbol.clone()]),
        by_direction: group(&trades, |t| {
            vec![t.direction.clone().unwrap_or_else(|| "strategy".into())]
        }),
        by_weekday: group(&trades, weekday),
        by_hour: group(&trades, hour),
        by_hold: group(&trades, |t| vec![hold_bucket(t.holding_seconds).to_owned()]),
        by_edge: by_label(&trades, true, |t| t.edges.clone()),
        by_entry_tactic: by_label(&trades, true, |t| t.entry_tactics.clone()),
        by_tag: by_label(&trades, false, |t| t.tags.clone()),
        by_mistake: by_label(&trades, false, |t| t.mistakes.clone()),
        edge_tactic: edge_tactic(&trades),
        mistake_costs: mistake_costs(&trades),
        untagged: trades.iter().filter(|t| t.edges.is_empty()).count(),
    }
}

/// Dollars an initial stop put at risk: |entry − stop| × size × multiplier.
pub fn stop_risk(
    avg_entry: Decimal,
    stop: Decimal,
    quantity: Decimal,
    multiplier: Decimal,
) -> Decimal {
    (avg_entry - stop).abs() * quantity * multiplier
}

/// R-multiple: net P&L over the dollars at risk; none without a risk.
pub fn r_multiple(net: Decimal, risk: Decimal) -> Option<Decimal> {
    ratio(net, risk)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::trades::labels::LabelKind;
    use rust_decimal_macros::dec;

    fn label(kind: LabelKind, name: &str) -> LabelRef {
        LabelRef {
            id: ID(format!("{}-{name}", kind.as_str())),
            kind,
            name: name.into(),
            color: None,
            archived: false,
        }
    }

    fn trade(
        net: Decimal,
        closed: &str,
        hold: i64,
        r: Option<Decimal>,
        tags: &[&str],
    ) -> StatTrade {
        let closed_at = DateTime::parse_from_rfc3339(closed)
            .unwrap()
            .with_timezone(&Utc);
        StatTrade {
            symbol: "X".into(),
            direction: Some("long".into()),
            opened_at: closed_at - chrono::Duration::seconds(hold),
            closed_at,
            net,
            return_pct: None,
            holding_seconds: hold,
            r,
            edges: Vec::new(),
            entry_tactics: Vec::new(),
            tags: tags.iter().map(|t| label(LabelKind::Tag, t)).collect(),
            mistakes: Vec::new(),
        }
    }

    #[test]
    fn totals_ratios_and_streaks() {
        let stats = compute(vec![
            trade(
                dec!(100),
                "2026-01-05T15:00:00Z",
                600,
                Some(dec!(2)),
                &["breakout"],
            ),
            trade(dec!(-50), "2026-01-06T15:00:00Z", 600, Some(dec!(-1)), &[]),
            trade(dec!(0), "2026-01-07T15:00:00Z", 600, None, &[]),
            trade(dec!(-30), "2026-01-08T15:00:00Z", 7200, None, &[]),
            trade(dec!(60), "2026-01-09T15:00:00Z", 7200, None, &["breakout"]),
        ]);
        assert_eq!(
            (stats.trades, stats.wins, stats.losses, stats.breakeven),
            (5, 2, 2, 1)
        );
        assert_eq!(stats.win_rate, Some(dec!(0.5)));
        assert_eq!(stats.net, dec!(80));
        assert_eq!(stats.profit_factor, Some(dec!(2)));
        assert_eq!(stats.expectancy, Some(dec!(16)));
        assert_eq!(stats.expectancy_r, Some(dec!(0.5)));
        assert_eq!(stats.max_drawdown, dec!(80), "from +100 down to +20");
        assert_eq!(stats.current_drawdown, dec!(20));
        assert_eq!(
            (
                stats.longest_win_streak,
                stats.longest_loss_streak,
                stats.current_streak
            ),
            (1, 2, 1)
        );
        let breakout = stats.by_tag.iter().find(|b| b.key == "breakout").unwrap();
        assert_eq!((breakout.trades, breakout.net), (2, dec!(160)));
        assert_eq!(stats.equity.last().unwrap().cumulative, dec!(80));
        assert_eq!(
            stats
                .equity
                .iter()
                .map(|d| (d.trades, d.wins, d.losses))
                .collect::<Vec<_>>(),
            [(1, 1, 0), (1, 0, 1), (1, 0, 0), (1, 0, 1), (1, 1, 0)],
            "each day counts the trades it closed and how they ended"
        );
        assert_eq!(stats.by_hold[0].key, "under 1 hour");
    }

    #[test]
    fn average_win_and_loss_in_percent_weigh_trades_equally() {
        let with = |net: Decimal, pct: Option<Decimal>| StatTrade {
            return_pct: pct,
            ..trade(net, "2026-01-05T15:00:00Z", 600, None, &[])
        };
        let stats = compute(vec![
            with(dec!(500), Some(dec!(5))),
            with(dec!(10), Some(dec!(2))),
            with(dec!(40), None),
            with(dec!(-30), Some(dec!(-3))),
            with(dec!(-90), Some(dec!(-1.5))),
            with(dec!(0), Some(dec!(0))),
        ]);
        assert_eq!(
            stats.average_win_pct,
            Some(dec!(3.50)),
            "(5 + 2) / 2; the trade without a cost is skipped"
        );
        assert_eq!(stats.average_loss_pct, Some(dec!(-2.25)));
        assert_eq!(
            stats.average_win,
            Some(dec!(183.33)),
            "dollars still average all three wins"
        );

        let none = compute(vec![with(dec!(10), None)]);
        assert_eq!((none.average_win_pct, none.average_loss_pct), (None, None));
    }

    #[test]
    fn nothing_to_measure_is_not_an_error() {
        let stats = compute(vec![]);
        assert_eq!(
            (stats.trades, stats.win_rate, stats.profit_factor),
            (0, None, None)
        );
    }

    #[test]
    fn r_divides_by_the_dollars_at_risk() {
        let risk = stop_risk(dec!(10), dec!(9), dec!(50), dec!(1));
        assert_eq!(r_multiple(dec!(100), risk), Some(dec!(2)));
        assert_eq!(
            r_multiple(dec!(100), stop_risk(dec!(10), dec!(10), dec!(50), dec!(1))),
            None
        );
        assert_eq!(
            r_multiple(dec!(-200), stop_risk(dec!(2), dec!(1), dec!(1), dec!(100))),
            Some(dec!(-2)),
            "an option's risk counts its multiplier"
        );
        assert_eq!(
            r_multiple(dec!(150), dec!(50)),
            Some(dec!(3)),
            "a planned dollar risk"
        );
    }

    #[test]
    fn labels_break_results_down_and_a_trade_counts_under_each() {
        let orb = label(LabelKind::Edge, "ORB");
        let volume = label(LabelKind::Edge, "Relative volume");
        let pullback = label(LabelKind::EntryTactic, "Pullback");
        let chased = label(LabelKind::Mistake, "Chased");
        let with = |net: Decimal,
                    edges: &[&LabelRef],
                    tactics: &[&LabelRef],
                    mistakes: &[&LabelRef],
                    r: Option<Decimal>| StatTrade {
            edges: edges.iter().map(|l| (*l).clone()).collect(),
            entry_tactics: tactics.iter().map(|l| (*l).clone()).collect(),
            mistakes: mistakes.iter().map(|m| (*m).clone()).collect(),
            ..trade(net, "2026-01-05T15:00:00Z", 600, r, &[])
        };
        let stats = compute(vec![
            with(
                dec!(100),
                &[&orb, &volume],
                &[&pullback],
                &[],
                Some(dec!(2)),
            ),
            with(dec!(-40), &[&orb], &[], &[&chased], Some(dec!(-1))),
            with(dec!(-60), &[&volume], &[&pullback], &[&chased], None),
            with(dec!(30), &[], &[], &[], None),
        ]);

        let keys: Vec<(&str, usize, Decimal)> = stats
            .by_edge
            .iter()
            .map(|b| (b.key.as_str(), b.trades, b.net))
            .collect();
        assert_eq!(
            keys,
            [
                ("ORB", 2, dec!(60)),
                ("Relative volume", 2, dec!(40)),
                ("None", 1, dec!(30))
            ],
            "the first trade counts under both of its edges"
        );
        let orb_bucket = &stats.by_edge[0];
        assert_eq!(orb_bucket.label_id, Some(orb.id.clone()));
        assert_eq!(
            (orb_bucket.expectancy, orb_bucket.expectancy_r),
            (Some(dec!(30)), Some(dec!(0.5)))
        );
        assert_eq!(stats.by_edge[2].label_id, None);
        assert_eq!(
            stats
                .by_entry_tactic
                .iter()
                .map(|b| (b.key.as_str(), b.trades))
                .collect::<Vec<_>>(),
            [("Pullback", 2), ("None", 2)]
        );
        assert_eq!(stats.untagged, 1);

        let cell = |edge: Option<&LabelRef>, tactic: Option<&LabelRef>| {
            stats
                .edge_tactic
                .iter()
                .find(|c| c.edge.as_ref() == edge && c.entry_tactic.as_ref() == tactic)
                .map(|c| (c.trades, c.net))
        };
        assert_eq!(cell(Some(&orb), Some(&pullback)), Some((1, dec!(100))));
        assert_eq!(cell(Some(&volume), Some(&pullback)), Some((2, dec!(40))));
        assert_eq!(cell(Some(&orb), None), Some((1, dec!(-40))));
        assert_eq!(cell(None, None), Some((1, dec!(30))));
        assert_eq!(stats.edge_tactic.len(), 4);

        assert_eq!(stats.by_mistake.len(), 1, "no None bucket for mistakes");
        let cost = &stats.mistake_costs[0];
        assert_eq!(cost.mistake, chased);
        assert_eq!((cost.trades, cost.net), (2, dec!(-100)));
        assert_eq!(
            (cost.expectancy_with, cost.expectancy_without),
            (Some(dec!(-50)), Some(dec!(65)))
        );
    }
}
