//! Things the engine notices but will not act on without the user: likely
//! ticker changes and likely multi-leg option strategies.

use std::collections::{BTreeSet, HashSet};

use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use uuid::Uuid;

use super::instrument::Alias;
use super::model::{AssetClass, FillRole, Trade, TradeKind, TradeStatus};
use super::stitch::dust;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct AliasSuggestion {
    pub workspace_id: Uuid,
    pub from_key: String,
    pub to_key: String,
    pub effective_at: DateTime<Utc>,
    pub reason: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct StrategySuggestion {
    pub workspace_id: Uuid,
    pub underlying: String,
    pub trade_ids: Vec<String>,
}

fn similar(a: &Trade, b: &Trade) -> Option<&'static str> {
    let (sa, sb) = (&a.instrument.symbol, &b.instrument.symbol);
    if sa.starts_with(sb.as_str()) || sb.starts_with(sa.as_str()) {
        return Some("the ticker gained or lost a suffix");
    }
    match (&a.instrument.description, &b.instrument.description) {
        (Some(da), Some(db)) if da.trim().eq_ignore_ascii_case(db.trim()) => {
            Some("both tickers name the same company")
        }
        _ => None,
    }
}

/// A sale with no opening on one ticker, matching a still-open position of
/// the same size on another, looks like a ticker change.
pub fn aliases(
    trades: &[Trade],
    confirmed: &[Alias],
    rejected: &[(String, String)],
) -> Vec<AliasSuggestion> {
    let known: HashSet<(&str, &str)> = confirmed
        .iter()
        .map(|a| (a.from_key.as_str(), a.to_key.as_str()))
        .chain(rejected.iter().map(|(f, t)| (f.as_str(), t.as_str())))
        .collect();
    let mut suggestions = Vec::new();
    let mut seen = BTreeSet::new();
    for orphan in trades.iter().filter(|t| {
        t.instrument.asset_class == AssetClass::Stock
            && t.fills.first().is_some_and(|f| f.role == FillRole::Orphan)
    }) {
        let fill = &orphan.fills[0];
        for open in trades.iter().filter(|t| {
            t.workspace_id == orphan.workspace_id
                && t.kind == TradeKind::Single
                && t.status == TradeStatus::Open
                && t.instrument.asset_class == AssetClass::Stock
                && t.instrument_key != orphan.instrument_key
                && t.direction == orphan.direction
                && t.opened_at < fill.at
        }) {
            let open_quantity: Decimal = open.lots.iter().map(|l| l.quantity).sum();
            if (open_quantity - fill.quantity).abs() > dust() {
                continue;
            }
            let Some(reason) = similar(orphan, open) else {
                continue;
            };
            let pair = (orphan.instrument_key.as_str(), open.instrument_key.as_str());
            if known.contains(&pair)
                || !seen.insert((orphan.workspace_id, pair.0.to_owned(), pair.1.to_owned()))
            {
                continue;
            }
            suggestions.push(AliasSuggestion {
                workspace_id: orphan.workspace_id,
                from_key: orphan.instrument_key.clone(),
                to_key: open.instrument_key.clone(),
                effective_at: fill
                    .at
                    .date_naive()
                    .and_hms_opt(0, 0, 0)
                    .expect("midnight exists")
                    .and_utc(),
                reason: format!(
                    "Sold {} {} with no opening while {} {} was still open; {reason}",
                    fill.quantity, orphan.instrument.symbol, open_quantity, open.instrument.symbol
                ),
            });
        }
    }
    suggestions
}

/// Option legs on one underlying opened within a minute of each other.
pub fn strategies(trades: &[Trade]) -> Vec<StrategySuggestion> {
    let mut legs: Vec<&Trade> = trades
        .iter()
        .filter(|t| {
            t.kind == TradeKind::Single && t.parent_id.is_none() && t.instrument.option.is_some()
        })
        .collect();
    legs.sort_by(|a, b| {
        (a.workspace_id, a.underlying(), a.opened_at).cmp(&(
            b.workspace_id,
            b.underlying(),
            b.opened_at,
        ))
    });
    let mut suggestions = Vec::new();
    let mut group: Vec<&Trade> = Vec::new();
    let flush = |group: &mut Vec<&Trade>, out: &mut Vec<StrategySuggestion>| {
        let distinct: BTreeSet<&str> = group.iter().map(|t| t.instrument_key.as_str()).collect();
        if group.len() >= 2 && distinct.len() >= 2 {
            out.push(StrategySuggestion {
                workspace_id: group[0].workspace_id,
                underlying: group[0].underlying().to_owned(),
                trade_ids: group.iter().map(|t| t.id.clone()).collect(),
            });
        }
        group.clear();
    };
    for leg in legs {
        let joins = group.last().is_some_and(|last| {
            last.workspace_id == leg.workspace_id
                && last.underlying() == leg.underlying()
                && leg.opened_at - last.opened_at <= Duration::seconds(60)
        });
        if !joins {
            flush(&mut group, &mut suggestions);
        }
        group.push(leg);
    }
    flush(&mut group, &mut suggestions);
    suggestions
}
