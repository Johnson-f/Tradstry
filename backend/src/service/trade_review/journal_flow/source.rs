use std::{collections::BTreeMap, str::FromStr};

use anyhow::{Result, anyhow, ensure};
use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde_json::Value;
use sqlx::{PgConnection, Row};

use crate::service::trade_review::{
    build_episodes,
    types::{ExecutionFill, ExecutionInstrument, ExecutionSide, TradeEpisodeDraft},
};

#[derive(Clone)]
pub(super) struct SourceGroup {
    pub key: String,
    pub symbol: String,
    pub description: String,
    pub currency: String,
    pub fills: Vec<ExecutionFill>,
    pub source_ids: Vec<String>,
    pub fees_known: bool,
    pub issue: Option<String>,
    pub opening_effect: bool,
}

impl SourceGroup {
    pub fn can_confirm(&self) -> bool {
        self.fills.len() == self.source_ids.len()
            && self.fills.iter().all(|fill| {
                fill.price > Decimal::ZERO
                    && fill.quantity > Decimal::ZERO
                    && fill.instrument.multiplier() > Decimal::ZERO
                    && !fill
                        .instrument
                        .key()
                        .to_ascii_lowercase()
                        .contains("unresolved:")
            })
    }

    pub fn drafts(&self, inventory: &Value) -> Result<Vec<TradeEpisodeDraft>> {
        if self.issue.is_some() {
            return Ok(vec![]);
        }
        let first = self
            .fills
            .iter()
            .map(|f| f.executed_at)
            .min()
            .ok_or_else(|| anyhow!("empty source group"))?;
        let flat = inventory
            .get(&self.key)
            .or_else(|| inventory.get("*"))
            .filter(|e| e["kind"] == "flat")
            .and_then(|e| e["as_of"].as_str())
            .and_then(|date| DateTime::parse_from_rfc3339(date).ok())
            .is_some_and(|date| date <= first);
        if !flat && !self.opening_effect {
            return Ok(vec![]);
        }
        let mut drafts = build_episodes(self.fills.clone())?;
        for draft in &mut drafts {
            draft.fingerprint = format!(
                "{}:{}:fees_known={}",
                draft.fingerprint, self.currency, self.fees_known
            );
        }
        Ok(drafts)
    }
}

pub(super) async fn load(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
) -> Result<Vec<SourceGroup>> {
    let continuations: Option<Value> = sqlx::query_scalar("SELECT coalesce(opening_inventory->'confirmed_continuations','[]'::jsonb) FROM journal_workspace_state WHERE user_id=$1 AND workspace_id=$2")
        .bind(user).bind(workspace).fetch_optional(&mut *connection).await?;
    // Brokerage storage represents absent option strings as either NULL or empty.
    // Normalize only the read; the original broker facts must remain untouched.
    let rows=sqlx::query("SELECT id,symbol,symbol_description,currency,transaction_type,price::text,units::text,fee::text,trade_date,raw_json,NULLIF(btrim(underlying_symbol),'') AS underlying_symbol,NULLIF(btrim(option_kind),'') AS option_kind,strike_price::text,NULLIF(btrim(option_expiration),'') AS option_expiration,contract_multiplier::text FROM brokerage_transactions WHERE user_id=$1 AND workspace_id=$2 ORDER BY trade_date,id")
        .bind(user).bind(workspace).fetch_all(&mut *connection).await?;
    let mut groups = BTreeMap::<String, SourceGroup>::new();
    for row in rows {
        let kind = row
            .try_get::<String, _>("transaction_type")?
            .to_ascii_uppercase();
        let side = if kind.starts_with("BUY") {
            Some(ExecutionSide::Buy)
        } else if kind.starts_with("SELL") {
            Some(ExecutionSide::Sell)
        } else if ["TRANSFER", "SPLIT", "MERGER", "EXERCISE", "ASSIGN"]
            .iter()
            .any(|event| kind.contains(event))
        {
            None
        } else {
            continue;
        };
        let symbol = row
            .try_get::<Option<String>, _>("symbol")?
            .unwrap_or_default();
        let currency: String = row.try_get("currency")?;
        let id: String = row.try_get("id")?;
        let raw: Value =
            serde_json::from_str(&row.try_get::<String, _>("raw_json")?).unwrap_or(Value::Null);
        let decimal = |column: &str| -> Result<Decimal> {
            Ok(Decimal::from_str(&row.try_get::<String, _>(column)?)?)
        };
        let option = row.try_get::<Option<String>, _>("option_kind")?;
        let instrument = if let Some(option_kind) = option {
            let underlying = row
                .try_get::<Option<String>, _>("underlying_symbol")?
                .unwrap_or_default();
            let expiration = row
                .try_get::<Option<String>, _>("option_expiration")?
                .and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok());
            let strike = row
                .try_get::<Option<String>, _>("strike_price")?
                .and_then(|s| Decimal::from_str(&s).ok());
            match (expiration, strike) {
                (Some(expiration), Some(strike))
                    if !underlying.trim().is_empty()
                        && strike > Decimal::ZERO
                        && matches!(option_kind.to_ascii_lowercase().as_str(), "call" | "put") =>
                {
                    ExecutionInstrument::Option {
                        underlying,
                        expiration,
                        strike,
                        option_kind,
                        multiplier: decimal("contract_multiplier")?,
                    }
                }
                _ => ExecutionInstrument::Equity {
                    symbol: format!("unresolved:{symbol}"),
                },
            }
        } else if row
            .try_get::<Option<String>, _>("underlying_symbol")?
            .is_some()
            || row.try_get::<Option<String>, _>("strike_price")?.is_some()
            || row
                .try_get::<Option<String>, _>("option_expiration")?
                .is_some()
            || decimal("contract_multiplier")? != Decimal::ONE
            || (!raw["option_symbol"].is_null()
                && raw["option_symbol"]
                    .as_str()
                    .is_none_or(|s| !s.trim().is_empty()))
        {
            ExecutionInstrument::Equity {
                symbol: format!("unresolved:{symbol}"),
            }
        } else {
            ExecutionInstrument::Equity {
                symbol: symbol.clone(),
            }
        }
        .normalized();
        let key = format!("{}|{}", instrument.key(), currency);
        let group = groups.entry(key.clone()).or_insert_with(|| SourceGroup {
            key,
            symbol: symbol.clone(),
            description: row
                .try_get::<Option<String>, _>("symbol_description")
                .ok()
                .flatten()
                .unwrap_or_default(),
            currency,
            fills: vec![],
            source_ids: vec![],
            fees_known: true,
            issue: None,
            opening_effect: matches!(kind.as_str(), "BUY_TO_OPEN" | "SELL_TO_OPEN" | "SELL_SHORT"),
        });
        group.source_ids.push(id.clone());
        let Some(side) = side else {
            group.issue=Some("A transfer, corporate action, exercise or assignment needs confirmed position history".into());
            continue;
        };
        let at: Option<DateTime<Utc>> = row.try_get("trade_date")?;
        let raw_date = raw["trade_date"].as_str();
        if at.is_none() || raw_date.is_none_or(|s| DateTime::parse_from_rfc3339(s).is_err()) {
            group.issue = Some("Execution time precision is unavailable".into());
        }
        if symbol.is_empty()
            || instrument
                .key()
                .to_ascii_lowercase()
                .contains("unresolved:")
            || instrument.multiplier() <= Decimal::ZERO
        {
            group.issue = Some("Instrument details are incomplete".into());
        }
        let price = decimal("price")?;
        let quantity = decimal("units")?.abs();
        if price <= Decimal::ZERO || quantity <= Decimal::ZERO {
            group.issue = Some("Execution price or quantity is invalid".into());
        }
        if raw["fee"].is_null() {
            group.fees_known = false;
        }
        if let Some(executed_at) = at {
            if group
                .fills
                .iter()
                .any(|f| f.executed_at == executed_at && (f.side != side || f.price != price))
            {
                group.issue = Some("Execution order needs confirmation".into());
            }
            group.fills.push(ExecutionFill {
                transaction_id: id,
                instrument,
                side,
                price,
                quantity,
                fee: decimal("fee")?,
                executed_at,
            });
        }
    }
    if let Some(continuations) = continuations {
        for continuation in serde_json::from_value::<Vec<ConfirmedContinuation>>(continuations)? {
            apply_continuation(&mut groups, &continuation)?;
        }
    }
    Ok(groups.into_values().collect())
}

#[derive(serde::Deserialize)]
struct ConfirmedContinuation {
    execution_id: String,
    opening_execution_id: String,
    provenance: String,
}

fn apply_continuation(
    groups: &mut BTreeMap<String, SourceGroup>,
    continuation: &ConfirmedContinuation,
) -> Result<()> {
    ensure!(
        continuation.provenance == "user_confirmed",
        "Position continuation requires confirmation"
    );
    let source = groups
        .values()
        .find(|group| group.source_ids.contains(&continuation.execution_id))
        .ok_or_else(|| anyhow!("Confirmed continuation execution is unavailable"))?;
    let target = groups
        .values()
        .find(|group| {
            group
                .source_ids
                .contains(&continuation.opening_execution_id)
        })
        .ok_or_else(|| anyhow!("Confirmed continuation opening execution is unavailable"))?;
    ensure!(
        source.issue.is_none() && target.issue.is_none() && source.currency == target.currency,
        "Correct the broker history before applying the confirmed continuation"
    );
    let closing = source
        .fills
        .iter()
        .find(|fill| fill.transaction_id == continuation.execution_id)
        .ok_or_else(|| anyhow!("Confirmed continuation has no closing fill"))?;
    let opening = target
        .fills
        .iter()
        .find(|fill| fill.transaction_id == continuation.opening_execution_id)
        .ok_or_else(|| anyhow!("Confirmed continuation has no opening fill"))?;
    ensure!(
        matches!(closing.instrument, ExecutionInstrument::Equity { .. })
            && matches!(opening.instrument, ExecutionInstrument::Equity { .. })
            && closing.side != opening.side
            && closing.executed_at > opening.executed_at,
        "Continuation must join an earlier stock opening to an opposite-side execution"
    );
    if source.key == target.key {
        return Ok(());
    }
    let outstanding: Decimal = target
        .fills
        .iter()
        .filter(|fill| fill.executed_at < closing.executed_at)
        .map(|fill| {
            if fill.side == opening.side {
                fill.quantity
            } else {
                -fill.quantity
            }
        })
        .sum();
    ensure!(
        outstanding == closing.quantity,
        "Continuation quantity does not close the recorded position"
    );
    let mut closing = closing.clone();
    closing.instrument = opening.instrument.clone();
    let source_key = source.key.clone();
    let target_key = target.key.clone();
    let fees_known = source.fees_known;
    // A confirmed ticker transition applies only to this execution. Broker rows
    // and future executions under either ticker retain their original identity.
    let source = groups
        .get_mut(&source_key)
        .ok_or_else(|| anyhow!("Continuation source disappeared"))?;
    source
        .fills
        .retain(|fill| fill.transaction_id != closing.transaction_id);
    source.source_ids.retain(|id| id != &closing.transaction_id);
    if source.source_ids.is_empty() {
        groups.remove(&source_key);
    }
    let target = groups
        .get_mut(&target_key)
        .ok_or_else(|| anyhow!("Continuation target disappeared"))?;
    target.source_ids.push(closing.transaction_id.clone());
    target.fills.push(closing);
    target.fills.sort_by(|a, b| {
        (a.executed_at, &a.transaction_id).cmp(&(b.executed_at, &b.transaction_id))
    });
    target.fees_known &= fees_known;
    Ok(())
}
