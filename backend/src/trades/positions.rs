//! What the brokerage says is held, from the latest holdings snapshot: marks
//! for unrealised P&L, and a check that the engine agrees.

use std::collections::{BTreeMap, BTreeSet, HashMap};

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde_json::Value;
use uuid::Uuid;

use super::{
    instrument::{self, Alias, decimal, parse_occ},
    model::{Direction, Instrument, Issue, Severity, Trade, TradeKind, TradeStatus},
    stitch::dust,
};

#[derive(Clone, Debug)]
pub struct HoldingsSnapshot {
    pub workspace_id: Uuid,
    pub captured_at: DateTime<Utc>,
    pub positions: Value,
}

#[derive(Clone, Debug, PartialEq)]
pub struct BrokerPosition {
    pub units: Decimal,
    pub price: Option<Decimal>,
}

fn text<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str().filter(|s| !s.trim().is_empty())
}

fn instrument_of(item: &Value) -> Option<Instrument> {
    let kind = text(item, &["instrument", "kind"]).unwrap_or("stock");
    let symbol = text(item, &["instrument", "symbol"])
        .or_else(|| text(item, &["symbol", "symbol", "symbol"]))
        .or_else(|| text(item, &["symbol", "symbol"]))?;
    if kind.eq_ignore_ascii_case("option") {
        return parse_occ(symbol).map(|contract| {
            Instrument::option(contract, Decimal::from(instrument::STANDARD_MULTIPLIER))
        });
    }
    if kind.eq_ignore_ascii_case("crypto") {
        return Some(Instrument::crypto(symbol));
    }
    Some(Instrument::stock(symbol))
}

fn snapshot_items(positions: &Value) -> Option<&Vec<Value>> {
    match positions {
        Value::Object(map) => map.get("results").and_then(Value::as_array),
        Value::Array(items) => Some(items),
        _ => None,
    }
}

/// What a brokerage account is worth in US dollars: its dollar cash plus the
/// market value of its positions, shorts counting against it. None when the
/// snapshot has neither, or the total is not above zero.
pub fn account_value(positions: &Value, balances: &Value) -> Option<Decimal> {
    let cash: Vec<Decimal> = balances
        .as_array()
        .into_iter()
        .flatten()
        .filter(|item| {
            text(item, &["currency", "code"]).is_none_or(|code| code.eq_ignore_ascii_case("USD"))
        })
        .filter_map(|item| item.get("cash").and_then(decimal))
        .collect();
    let holdings: Vec<Decimal> = snapshot_items(positions)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let multiplier = instrument_of(item)?.multiplier;
            Some(
                item.get("units").and_then(decimal)?
                    * item.get("price").and_then(decimal)?
                    * multiplier,
            )
        })
        .collect();
    if cash.is_empty() && holdings.is_empty() {
        return None;
    }
    let total: Decimal = cash.into_iter().chain(holdings).sum();
    (total > Decimal::ZERO).then(|| total.round_dp(2))
}

/// Positions by instrument key (after aliases), signed: negative is short.
pub fn broker_positions(
    snapshot: &HoldingsSnapshot,
    aliases: &[Alias],
) -> HashMap<String, BrokerPosition> {
    let items = snapshot_items(&snapshot.positions);
    let mut positions = HashMap::new();
    for item in items.into_iter().flatten() {
        let Some(instrument) = instrument_of(item) else {
            continue;
        };
        let Some(units) = item.get("units").and_then(decimal) else {
            continue;
        };
        let key = instrument::resolve(&instrument.key(), snapshot.captured_at, aliases);
        positions.insert(
            key,
            BrokerPosition {
                units,
                price: item.get("price").and_then(decimal),
            },
        );
    }
    positions
}

fn engine_positions(trades: &[Trade], workspace_id: Uuid) -> BTreeMap<String, Decimal> {
    let mut positions = BTreeMap::new();
    for trade in trades.iter().filter(|t| {
        t.workspace_id == workspace_id
            && t.kind == TradeKind::Single
            && t.status == TradeStatus::Open
    }) {
        for lot in trade.lots.iter().filter(|l| l.quantity > Decimal::ZERO) {
            let signed = match lot.direction {
                Direction::Long => lot.quantity,
                Direction::Short => -lot.quantity,
            };
            *positions
                .entry(trade.instrument_key.clone())
                .or_insert(Decimal::ZERO) += signed;
        }
    }
    positions
}

/// Differences between what the engine holds and what the brokerage reports.
/// A difference almost always means history is missing before the import.
pub fn reconcile(
    trades: &[Trade],
    snapshots: &[HoldingsSnapshot],
    aliases: &[Alias],
) -> Vec<Issue> {
    let mut issues = Vec::new();
    for snapshot in snapshots {
        let broker = broker_positions(snapshot, aliases);
        let engine = engine_positions(trades, snapshot.workspace_id);
        let keys: BTreeSet<&String> = broker.keys().chain(engine.keys()).collect();
        for key in keys {
            let held = broker.get(key).map_or(Decimal::ZERO, |p| p.units);
            let computed = engine.get(key).copied().unwrap_or_default();
            if (held - computed).abs() > dust() {
                issues.push(
                    Issue::new(
                        "position_mismatch",
                        Severity::Warning,
                        format!(
                            "The brokerage reports {} for {} but the imported history adds up to {}; add an opening position for the difference",
                            held.normalize(),
                            key.split(':').nth(1).unwrap_or(key),
                            computed.normalize()
                        ),
                    )
                    .workspace(snapshot.workspace_id)
                    .instrument(key),
                );
            }
        }
    }
    issues
}

/// Latest marks by (workspace, instrument key).
pub fn marks(
    snapshots: &[HoldingsSnapshot],
    aliases: &[Alias],
) -> HashMap<(Uuid, String), Decimal> {
    snapshots
        .iter()
        .flat_map(|snapshot| {
            broker_positions(snapshot, aliases)
                .into_iter()
                .filter_map(move |(key, p)| {
                    p.price.map(|price| ((snapshot.workspace_id, key), price))
                })
        })
        .collect()
}
