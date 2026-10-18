use std::{collections::HashMap, str::FromStr};

use anyhow::Result;
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use sqlx::{PgConnection, Row};

use super::source::{Holdings, SourceGroup};
use crate::service::trade_review::types::ExecutionInstrument;

/// The broker's latest holdings for a workspace. Each sync replaces the whole
/// snapshot, so an instrument missing from it is held at zero.
pub(super) struct Snapshot {
    synced_at: Option<DateTime<Utc>>,
    by_id: HashMap<String, Decimal>,
    by_symbol: HashMap<String, Decimal>,
}

pub(super) async fn load(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
) -> Result<Snapshot> {
    let synced: Vec<Option<String>> = sqlx::query_scalar("SELECT holdings_last_successful_sync FROM brokerage_sync_state WHERE user_id=$1 AND workspace_id=$2")
        .bind(user).bind(workspace).fetch_all(&mut *connection).await?;
    // Every account in the workspace must have synced; the oldest one bounds
    // what the snapshot can vouch for.
    let synced_at = synced
        .iter()
        .map(|at| {
            at.as_deref()
                .and_then(|at| DateTime::parse_from_rfc3339(at).ok())
                .map(|at| at.with_timezone(&Utc))
        })
        .collect::<Option<Vec<_>>>()
        .and_then(|times| times.into_iter().min());
    let rows = sqlx::query("SELECT NULLIF(btrim(snaptrade_symbol_id),'') AS instrument_id,upper(btrim(symbol)) AS symbol,units::text AS units FROM brokerage_holdings WHERE user_id=$1 AND workspace_id=$2 AND NOT coalesce(is_option,false)")
        .bind(user).bind(workspace).fetch_all(&mut *connection).await?;
    let mut snapshot = Snapshot {
        synced_at,
        by_id: HashMap::new(),
        by_symbol: HashMap::new(),
    };
    for row in rows {
        let Some(units) = row
            .try_get::<Option<String>, _>("units")?
            .as_deref()
            .and_then(parse_decimal)
        else {
            snapshot.synced_at = None;
            continue;
        };
        if let Some(id) = row.try_get::<Option<String>, _>("instrument_id")? {
            *snapshot.by_id.entry(id).or_default() += units;
        }
        if let Some(symbol) = row.try_get::<Option<String>, _>("symbol")? {
            *snapshot.by_symbol.entry(symbol).or_default() += units;
        }
    }
    Ok(snapshot)
}

fn parse_decimal(text: &str) -> Option<Decimal> {
    Decimal::from_str(text)
        .or_else(|_| Decimal::from_scientific(text))
        .ok()
}

impl Snapshot {
    pub fn for_group(&self, group: &SourceGroup) -> Holdings {
        let Some(synced_at) = self.synced_at else {
            return Holdings::Unavailable;
        };
        let stock = group.fills.iter().all(|fill| {
            matches!(&fill.instrument, ExecutionInstrument::Equity { symbol }
                if !symbol.to_ascii_lowercase().contains("unresolved:"))
        });
        if !stock || group.fills.is_empty() {
            return Holdings::Unavailable;
        }
        if group.fills.iter().any(|fill| fill.executed_at > synced_at) {
            return Holdings::Stale;
        }
        let held = if group.instrument_ids.is_empty() {
            self.by_symbol
                .get(&group.symbol.trim().to_ascii_uppercase())
                .copied()
                .unwrap_or_default()
        } else {
            group
                .instrument_ids
                .iter()
                .filter_map(|id| self.by_id.get(id))
                .sum()
        };
        Holdings::Held(held)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_and_scientific_float_text() {
        assert_eq!(parse_decimal("4.5"), Some(Decimal::new(45, 1)));
        assert_eq!(parse_decimal("1e-05"), Some(Decimal::new(1, 5)));
        assert_eq!(parse_decimal("abc"), None);
    }
}
