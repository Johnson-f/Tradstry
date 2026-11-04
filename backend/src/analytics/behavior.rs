//! How habits show up in results: mistakes, trading after a loss, how many
//! trades a day, and what the trader recorded about their own behavior.

use std::collections::{BTreeMap, HashMap};

use async_graphql::ID;
use chrono::NaiveDate;
use rust_decimal::Decimal;

use super::{
    common::{bucket, expectancy, is_loss, is_win, market, ratio},
    model::{BehaviorStats, Bucket, DayLoad, MistakeCost, PlanStats, StatTrade},
};
use crate::trades::{
    behavior::{MarketRegime, TradeBehavior},
    labels::LabelRef,
    measure::money,
};

pub(super) fn mistake_costs(trades: &[StatTrade]) -> Vec<MistakeCost> {
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

/// Trades with no mistake recorded against trades with at least one.
pub(super) fn by_discipline(trades: &[StatTrade]) -> Vec<Bucket> {
    let (flawed, clean): (Vec<&StatTrade>, Vec<&StatTrade>) =
        trades.iter().partition(|t| !t.mistakes.is_empty());
    vec![
        bucket("No mistakes", &clean),
        bucket("With mistakes", &flawed),
    ]
}

pub(super) const AFTER: [&str; 4] = [
    "First trade of the day",
    "After a win",
    "After a loss",
    "After breakeven",
];

/// Each trade by how the last trade that closed before it opened, on the same
/// New York day, ended. `trades` must be in closing order.
pub(super) fn by_previous_trade(trades: &[StatTrade]) -> Vec<Bucket> {
    let mut groups: [Vec<&StatTrade>; 4] = Default::default();
    for trade in trades {
        let earlier = trades.partition_point(|p| p.closed_at <= trade.opened_at);
        let previous = trades[..earlier]
            .iter()
            .rev()
            .find(|p| !std::ptr::eq(*p, trade));
        let same_day = |p: &StatTrade| {
            market(p.closed_at).date_naive() == market(trade.opened_at).date_naive()
        };
        let slot = match previous.filter(|p| same_day(p)) {
            None => 0,
            Some(p) if is_win(p) => 1,
            Some(p) if is_loss(p) => 2,
            Some(_) => 3,
        };
        groups[slot].push(trade);
    }
    AFTER
        .iter()
        .zip(groups)
        .filter(|(_, members)| !members.is_empty())
        .map(|(key, members)| bucket(*key, &members))
        .collect()
}

const DAY_LOADS: [(&str, usize, usize); 5] = [
    ("1 trade", 1, 1),
    ("2 trades", 2, 2),
    ("3 trades", 3, 3),
    ("4 to 5 trades", 4, 5),
    ("6 or more trades", 6, usize::MAX),
];

/// Trading days grouped by how many trades closed that day.
pub(super) fn trades_per_day(trades: &[StatTrade]) -> Vec<DayLoad> {
    let mut days: BTreeMap<NaiveDate, Vec<&StatTrade>> = BTreeMap::new();
    for trade in trades {
        days.entry(market(trade.closed_at).date_naive())
            .or_default()
            .push(trade);
    }
    DAY_LOADS
        .iter()
        .filter_map(|(key, low, high)| {
            let matching: Vec<&Vec<&StatTrade>> = days
                .values()
                .filter(|day| (*low..=*high).contains(&day.len()))
                .collect();
            if matching.is_empty() {
                return None;
            }
            let members: Vec<&StatTrade> = matching
                .iter()
                .flat_map(|day| day.iter().copied())
                .collect();
            let net: Decimal = members.iter().map(|t| t.net).sum();
            let wins = members.iter().filter(|t| is_win(t)).count();
            let losses = members.iter().filter(|t| is_loss(t)).count();
            Some(DayLoad {
                key: (*key).to_owned(),
                days: matching.len(),
                trades: members.len(),
                net: money(net),
                average_day: ratio(net, Decimal::from(matching.len())).map(money),
                win_rate: ratio(Decimal::from(wins), Decimal::from(wins + losses)),
            })
        })
        .collect()
}

const SCORES: [&str; 5] = ["1/5", "2/5", "3/5", "4/5", "5/5"];

/// One bucket per key in `order`, skipping trades where `key` is None and
/// keys no trade has.
fn recorded<F>(trades: &[StatTrade], order: &[&'static str], key: F) -> Vec<Bucket>
where
    F: Fn(&TradeBehavior) -> Option<&'static str>,
{
    order
        .iter()
        .filter_map(|wanted| {
            let members: Vec<&StatTrade> = trades
                .iter()
                .filter(|t| key(&t.behavior) == Some(*wanted))
                .collect();
            (!members.is_empty()).then(|| bucket(*wanted, &members))
        })
        .collect()
}

fn score(value: Option<i16>) -> Option<&'static str> {
    let index = usize::try_from(value?).ok()?.checked_sub(1)?;
    SCORES.get(index).copied()
}

fn yes_no(value: Option<bool>, keys: [&'static str; 2]) -> Option<&'static str> {
    value.map(|yes| if yes { keys[0] } else { keys[1] })
}

fn average(values: impl Iterator<Item = i16>) -> Option<Decimal> {
    let values: Vec<Decimal> = values.map(Decimal::from).collect();
    ratio(values.iter().copied().sum(), Decimal::from(values.len())).map(|v| v.round_dp(2))
}

const PLANNED: [&str; 2] = ["Planned pre-market", "Not planned"];
const REVENGE: [&str; 2] = ["Revenge trade", "Not a revenge trade"];
const THIRTY_MINUTES: [&str; 2] = ["Broke the 30-minute rule", "Kept the 30-minute rule"];

pub(super) fn self_review(trades: &[StatTrade]) -> BehaviorStats {
    let regimes = MarketRegime::ALL.map(MarketRegime::label);
    BehaviorStats {
        recorded: trades
            .iter()
            .filter(|t| t.behavior != TradeBehavior::default())
            .count(),
        average_conviction: average(trades.iter().filter_map(|t| t.behavior.conviction)),
        average_rule_adherence: average(trades.iter().filter_map(|t| t.behavior.rule_adherence)),
        by_conviction: recorded(trades, &SCORES, |b| score(b.conviction)),
        by_market_regime: recorded(trades, &regimes, |b| {
            b.market_regime.map(MarketRegime::label)
        }),
        by_planned: recorded(trades, &PLANNED, |b| yes_no(b.planned_pre_market, PLANNED)),
        by_revenge: recorded(trades, &[REVENGE[1], REVENGE[0]], |b| {
            yes_no(b.revenge_trade, REVENGE)
        }),
        by_thirty_minute_rule: recorded(trades, &[THIRTY_MINUTES[1], THIRTY_MINUTES[0]], |b| {
            yes_no(b.broke_thirty_minute_rule, THIRTY_MINUTES)
        }),
        by_rule_adherence: recorded(trades, &SCORES, |b| score(b.rule_adherence)),
    }
}

/// Trades carried out from a plan against the rest. Skipped plans are counted
/// by the loader, which can see plans that never became trades.
pub(super) fn plans(trades: &[StatTrade]) -> PlanStats {
    let (planned, unplanned): (Vec<&StatTrade>, Vec<&StatTrade>) =
        trades.iter().partition(|t| t.planned);
    PlanStats {
        from_plan: planned.len(),
        skipped: 0,
        by_plan: [("From a plan", planned), ("No plan", unplanned)]
            .into_iter()
            .filter(|(_, members)| !members.is_empty())
            .map(|(key, members)| bucket(key, &members))
            .collect(),
    }
}
