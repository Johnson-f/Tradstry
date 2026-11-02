//! Results grouped by one property of each trade.

use std::collections::{BTreeMap, HashMap};

use async_graphql::ID;
use chrono::{Datelike, Timelike};
use rust_decimal::Decimal;

use super::{
    common::{bucket, market},
    model::{Bucket, EdgeTacticCell, StatTrade},
};
use crate::trades::labels::LabelRef;

const NONE: &str = "None";

pub(super) const WEEKDAYS: [&str; 7] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

pub(super) const SESSIONS: [&str; 6] = [
    "Pre-market",
    "First hour",
    "Midday",
    "Last hour",
    "After hours",
    "Overnight",
];

pub(super) const HOLDS: [&str; 5] = [
    "Under 1 hour",
    "1 hour to 1 day",
    "1 to 7 days",
    "1 to 4 weeks",
    "Over 4 weeks",
];

pub(super) const SIZES: [&str; 7] = [
    "Under $1K",
    "$1K to $5K",
    "$5K to $10K",
    "$10K to $25K",
    "$25K to $100K",
    "Over $100K",
    "Unknown",
];

/// Groups by key, largest group first.
pub(super) fn by_count<F>(trades: &[StatTrade], key: F) -> Vec<Bucket>
where
    F: Fn(&StatTrade) -> String,
{
    let mut buckets = by_key(trades, key);
    buckets.sort_by(|a, b| b.trades.cmp(&a.trades).then(a.key.cmp(&b.key)));
    buckets
}

/// Groups by key in key order, for keys that sort naturally (hours, months).
pub(super) fn by_key<F>(trades: &[StatTrade], key: F) -> Vec<Bucket>
where
    F: Fn(&StatTrade) -> String,
{
    let mut groups: BTreeMap<String, Vec<&StatTrade>> = BTreeMap::new();
    for trade in trades {
        groups.entry(key(trade)).or_default().push(trade);
    }
    groups.into_iter().map(|(k, ts)| bucket(k, &ts)).collect()
}

/// Groups in a fixed order of keys, leaving out keys no trade has.
pub(super) fn in_order<F>(trades: &[StatTrade], order: &[&str], key: F) -> Vec<Bucket>
where
    F: Fn(&StatTrade) -> &'static str,
{
    order
        .iter()
        .filter_map(|wanted| {
            let members: Vec<&StatTrade> = trades.iter().filter(|t| key(t) == *wanted).collect();
            (!members.is_empty()).then(|| bucket(*wanted, &members))
        })
        .collect()
}

pub(super) fn weekday(trade: &StatTrade) -> &'static str {
    WEEKDAYS[market(trade.opened_at).weekday().num_days_from_monday() as usize]
}

pub(super) fn hour(trade: &StatTrade) -> String {
    format!("{:02}:00", market(trade.opened_at).hour())
}

/// The New York session a trade opened in. Regular hours run 9:30 to 16:00.
pub(super) fn session(trade: &StatTrade) -> &'static str {
    let opened = market(trade.opened_at);
    match opened.hour() * 60 + opened.minute() {
        m if (4 * 60..9 * 60 + 30).contains(&m) => SESSIONS[0],
        m if (9 * 60 + 30..10 * 60 + 30).contains(&m) => SESSIONS[1],
        m if (10 * 60 + 30..15 * 60).contains(&m) => SESSIONS[2],
        m if (15 * 60..16 * 60).contains(&m) => SESSIONS[3],
        m if (16 * 60..20 * 60).contains(&m) => SESSIONS[4],
        _ => SESSIONS[5],
    }
}

pub(super) fn month(trade: &StatTrade) -> String {
    market(trade.closed_at).format("%Y-%m").to_string()
}

pub(super) fn hold(trade: &StatTrade) -> &'static str {
    match trade.holding_seconds {
        s if s < 3_600 => HOLDS[0],
        s if s < 86_400 => HOLDS[1],
        s if s < 7 * 86_400 => HOLDS[2],
        s if s < 30 * 86_400 => HOLDS[3],
        _ => HOLDS[4],
    }
}

pub(super) fn size(trade: &StatTrade) -> &'static str {
    let cost = trade.entry_cost.abs();
    if cost.is_zero() {
        return SIZES[6];
    }
    [1_000, 5_000, 10_000, 25_000, 100_000]
        .iter()
        .position(|limit| cost < Decimal::from(*limit))
        .map_or(SIZES[5], |index| SIZES[index])
}

/// Buckets by label; a trade counts under each of its labels. With `with_none`
/// (edges, tactics), trades without any go in a "None" bucket.
pub(super) fn by_label<F>(trades: &[StatTrade], with_none: bool, labels: F) -> Vec<Bucket>
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

pub(super) fn edge_tactic(trades: &[StatTrade]) -> Vec<EdgeTacticCell> {
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
