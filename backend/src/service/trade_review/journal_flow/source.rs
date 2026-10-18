use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    str::FromStr,
};

use anyhow::{Result, anyhow, ensure};
use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde_json::Value;
use sqlx::{PgConnection, Row, postgres::PgRow};

use super::{holdings, opening::OpeningPosition};
use crate::service::trade_review::{
    build_episodes,
    types::{
        EpisodeDirection, ExecutionFill, ExecutionInstrument, ExecutionSide, FillRole,
        TradeEpisodeDraft,
    },
};

#[derive(Clone)]
struct LinkedTrade {
    direction: EpisodeDirection,
    closed: bool,
    entered_quantity: Decimal,
    source_ids: Vec<String>,
}

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
    pub opening: Option<OpeningPosition>,
    /// Keys the instrument was recorded under before its ticker changed.
    pub aliases: BTreeSet<String>,
    pub holdings: Holdings,
    pub instrument_ids: BTreeSet<String>,
    linked_trades: Vec<LinkedTrade>,
}

/// What the broker's latest holdings snapshot says about an instrument.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Holdings {
    Unavailable,
    /// The snapshot is older than the latest execution, so it can't be compared.
    Stale,
    Held(Decimal),
}

impl SourceGroup {
    #[cfg(test)]
    pub fn for_test(symbol: &str, description: &str, fills: Vec<ExecutionFill>) -> Self {
        Self {
            key: format!("equity:{symbol}|USD"),
            symbol: symbol.into(),
            description: description.into(),
            currency: "USD".into(),
            source_ids: fills
                .iter()
                .map(|fill| fill.transaction_id.clone())
                .collect(),
            fills,
            fees_known: true,
            issue: None,
            opening_effect: false,
            opening: None,
            aliases: BTreeSet::new(),
            holdings: Holdings::Unavailable,
            instrument_ids: BTreeSet::new(),
            linked_trades: vec![],
        }
    }

    pub fn answers_to(&self, key: &str) -> bool {
        self.key == key || self.aliases.contains(key)
    }

    /// Imported buys minus sells, starting from zero.
    pub fn net_imported(&self) -> Decimal {
        self.fills
            .iter()
            .map(|fill| match fill.side {
                ExecutionSide::Buy => fill.quantity,
                ExecutionSide::Sell => -fill.quantity,
            })
            .sum()
    }

    /// The position the broker's holdings imply was held before the first
    /// imported execution: holdings − imported buys + imported sells.
    pub fn holdings_gap(&self) -> Option<Decimal> {
        match self.holdings {
            Holdings::Held(held) => Some(held - self.net_imported()),
            Holdings::Unavailable | Holdings::Stale => None,
        }
    }

    pub fn holdings_mismatch(&self) -> Option<String> {
        let Holdings::Held(held) = self.holdings else {
            return None;
        };
        (self.holdings_gap() != Some(Decimal::ZERO)).then(|| format!(
            "Your broker shows {} {} held, but the imported history adds up to {}. If a recent trade hasn't synced yet, this clears on the next sync. Otherwise, add a starting position or import the missing history.",
            held.normalize(),
            self.symbol,
            self.net_imported().normalize()
        ))
    }

    /// Why the start of this history is unknown, when holdings can explain it.
    pub fn holdings_message(&self) -> Option<String> {
        self.holdings_mismatch().or_else(|| {
            (self.holdings == Holdings::Stale).then(|| format!(
                "Waiting for a fresh holdings sync to check the history of {}. You can also confirm a starting position now.",
                self.symbol
            ))
        })
    }

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

    /// Imported executions plus the user's starting position, which comes first.
    pub fn all_fills(&self) -> Vec<ExecutionFill> {
        let opening = self
            .opening
            .as_ref()
            .zip(self.fills.first())
            .map(|(opening, first)| opening.fill(&first.instrument));
        opening.into_iter().chain(self.fills.clone()).collect()
    }

    pub fn problem(&self) -> Option<String> {
        if self.issue.is_some() {
            return self.issue.clone();
        }
        let opening = self.opening.as_ref()?;
        self.fills
            .iter()
            .any(|fill| fill.executed_at <= opening.as_of)
            .then(|| format!(
                "Older broker history for {} was imported on or before the starting position you entered. Remove the starting position or check the history before calculating this trade.",
                self.symbol
            ))
    }

    pub fn drafts(&self, inventory: &Value) -> Result<Vec<TradeEpisodeDraft>> {
        if self.problem().is_some() {
            return Ok(vec![]);
        }
        let mut drafts = build_episodes(self.all_fills())?;
        if !self.has_known_start(inventory)?
            && !drafts.iter().all(|draft| self.has_exact_links(draft))
        {
            return Ok(vec![]);
        }
        for draft in &mut drafts {
            draft.fingerprint = format!(
                "{}:{}:fees_known={}",
                draft.fingerprint, self.currency, self.fees_known
            );
        }
        Ok(drafts)
    }

    /// Holdings that match the imported history prove a flat start. Without a
    /// comparable snapshot, a history that balances from flat is accepted. When
    /// holdings disagree but the history balances, the trades are still built
    /// and the mismatch is shown, because a recent trade that hasn't synced yet
    /// looks the same as a missing start.
    pub fn has_known_start(&self, inventory: &Value) -> Result<bool> {
        Ok(self.has_confirmed_start(inventory)?
            || self.holdings_gap() == Some(Decimal::ZERO)
            || self.balances_from_flat())
    }

    /// A start the user or the broker confirmed, as opposed to one inferred
    /// from the executions balancing.
    pub fn has_confirmed_start(&self, inventory: &Value) -> Result<bool> {
        let first = self
            .fills
            .iter()
            .map(|f| f.executed_at)
            .min()
            .ok_or_else(|| anyhow!("empty source group"))?;
        let flat = std::iter::once(&self.key)
            .chain(&self.aliases)
            .find_map(|key| inventory.get(key))
            .or_else(|| inventory.get("*"))
            .filter(|e| e["kind"] == "flat")
            .and_then(|e| e["as_of"].as_str())
            .and_then(|date| DateTime::parse_from_rfc3339(date).ok())
            .is_some_and(|date| date <= first);
        Ok(flat || self.opening_effect || self.opening.is_some())
    }

    /// Whether the imported history, read from a flat start, never flips between
    /// long and short and ends flat. A position held from before the import would
    /// usually break one of these, so such a history is treated as complete.
    pub fn balances_from_flat(&self) -> bool {
        let mut fills = self.fills.iter().collect::<Vec<_>>();
        fills.sort_by(|a, b| {
            (a.executed_at, &a.transaction_id).cmp(&(b.executed_at, &b.transaction_id))
        });
        let mut position = Decimal::ZERO;
        for fill in fills {
            let next = match fill.side {
                ExecutionSide::Buy => position + fill.quantity,
                ExecutionSide::Sell => position - fill.quantity,
            };
            if position != Decimal::ZERO
                && next != Decimal::ZERO
                && next.is_sign_negative() != position.is_sign_negative()
            {
                return false;
            }
            position = next;
        }
        !self.fills.is_empty() && position == Decimal::ZERO
    }

    fn has_exact_links(&self, draft: &TradeEpisodeDraft) -> bool {
        let entered_quantity: Decimal = draft
            .allocations
            .iter()
            .filter(|fill| fill.role == FillRole::Entry)
            .map(|fill| fill.quantity)
            .sum();
        let quantities = draft
            .allocations
            .iter()
            .fold(BTreeMap::new(), |mut totals, fill| {
                *totals
                    .entry(fill.transaction_id.as_str())
                    .or_insert(Decimal::ZERO) += fill.quantity;
                totals
            });
        self.linked_trades
            .iter()
            .filter(|trade| {
                trade.direction == draft.direction
                    && trade.closed == draft.closed_at.is_some()
                    && trade.entered_quantity == entered_quantity
                    && trade.source_ids.len() == quantities.len()
                    && trade.source_ids.iter().all(|id| {
                        self.fills
                            .iter()
                            .find(|fill| &fill.transaction_id == id)
                            .is_some_and(|fill| quantities.get(id.as_str()) == Some(&fill.quantity))
                    })
            })
            .count()
            == 1
    }
}

pub(super) async fn load(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
) -> Result<Vec<SourceGroup>> {
    let openings = super::opening::active(&mut *connection, user, workspace).await?;
    let continuations: Option<Value> = sqlx::query_scalar("SELECT coalesce(opening_inventory->'confirmed_continuations','[]'::jsonb) FROM journal_workspace_state WHERE user_id=$1 AND workspace_id=$2")
        .bind(user).bind(workspace).fetch_optional(&mut *connection).await?;
    // Brokerage storage represents absent option strings as either NULL or empty.
    // Normalize only the read; the original broker facts must remain untouched.
    let rows=sqlx::query("SELECT id,symbol,symbol_description,currency,transaction_type,price::text,units::text,fee::text,trade_date,raw_json,NULLIF(btrim(underlying_symbol),'') AS underlying_symbol,NULLIF(btrim(option_kind),'') AS option_kind,strike_price::text,NULLIF(btrim(option_expiration),'') AS option_expiration,contract_multiplier::text FROM brokerage_transactions WHERE user_id=$1 AND workspace_id=$2 ORDER BY trade_date,id")
        .bind(user).bind(workspace).fetch_all(&mut *connection).await?;
    let raws = rows
        .iter()
        .map(|row| {
            Ok(serde_json::from_str(&row.try_get::<String, _>("raw_json")?).unwrap_or(Value::Null))
        })
        .collect::<Result<Vec<Value>>>()?;
    let canonical = canonical_symbols(&rows, &raws)?;
    let mut groups = BTreeMap::<String, SourceGroup>::new();
    for (row, raw) in rows.iter().zip(raws) {
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
        let instrument_id = match &instrument {
            ExecutionInstrument::Equity { symbol }
                if !symbol.to_ascii_lowercase().contains("unresolved:") =>
            {
                stock_instrument_id(&raw)
            }
            _ => None,
        };
        let recorded_key = format!("{}|{}", instrument.key(), currency);
        let (instrument, symbol) = match instrument_id
            .and_then(|id| canonical.get(id))
            .filter(|current| **current != symbol.trim().to_ascii_uppercase())
        {
            Some(current) => (
                ExecutionInstrument::Equity {
                    symbol: current.clone(),
                }
                .normalized(),
                current.clone(),
            ),
            None => (instrument, symbol),
        };
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
            opening: None,
            aliases: BTreeSet::new(),
            holdings: Holdings::Unavailable,
            instrument_ids: BTreeSet::new(),
            linked_trades: vec![],
        });
        if recorded_key != group.key {
            group.aliases.insert(recorded_key);
        }
        if let Some(instrument_id) = instrument_id {
            group.instrument_ids.insert(instrument_id.to_owned());
        }
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
    for group in groups.values_mut() {
        if group.instrument_ids.len() > 1 {
            group.issue = Some(format!(
                "Executions under {} belong to more than one security. Check the broker history before calculating this trade.",
                group.symbol
            ));
        }
    }
    if let Some(continuations) = continuations {
        for continuation in serde_json::from_value::<Vec<ConfirmedContinuation>>(continuations)? {
            apply_continuation(&mut groups, &continuation)?;
        }
    }
    let holdings = holdings::load(&mut *connection, user, workspace).await?;
    for group in groups.values_mut() {
        group.holdings = holdings.for_group(group);
    }
    for opening in openings {
        if let Some(group) = groups
            .values_mut()
            .find(|group| group.answers_to(&opening.instrument_key))
        {
            group.opening = Some(opening);
        }
    }
    // Existing execution links preserve a previously recorded trade; they do
    // not establish an empty account or authorize unrelated executions.
    let linked = sqlx::query("SELECT j.trade_type,j.close_date IS NOT NULL AS closed,j.position_size::text AS entered_quantity,array_agg(l.brokerage_transaction_id ORDER BY l.brokerage_transaction_id) AS source_ids
        FROM journal_entries j JOIN journal_brokerage_links l ON l.journal_entry_id=j.id AND l.user_id=j.user_id
        LEFT JOIN brokerage_transactions b ON b.id=l.brokerage_transaction_id AND b.user_id=j.user_id AND b.workspace_id=j.workspace_id
        WHERE j.user_id=$1 AND j.workspace_id=$2 AND j.deleted_at IS NULL AND j.retired_at IS NULL AND j.trade_type IN ('long','short') AND j.position_size>0
          AND (j.source_kind='manual' OR EXISTS(SELECT 1 FROM trade_episodes e WHERE e.id=j.episode_id AND e.user_id=j.user_id AND e.workspace_id=j.workspace_id AND e.grouping_source='manual' AND e.retired_at IS NULL))
        GROUP BY j.id,j.trade_type
        HAVING bool_and(b.id IS NOT NULL AND (l.allocated_quantity IS NULL OR l.allocated_quantity=abs(b.units::text::numeric)))")
        .bind(user).bind(workspace).fetch_all(&mut *connection).await?;
    for row in linked {
        let source_ids: Vec<String> = row.try_get("source_ids")?;
        if let Some(group) = groups
            .values_mut()
            .find(|group| source_ids.iter().all(|id| group.source_ids.contains(id)))
        {
            group.linked_trades.push(LinkedTrade {
                direction: if row.try_get::<String, _>("trade_type")? == "long" {
                    EpisodeDirection::Long
                } else {
                    EpisodeDirection::Short
                },
                closed: row.try_get("closed")?,
                entered_quantity: Decimal::from_str(
                    &row.try_get::<String, _>("entered_quantity")?,
                )?,
                source_ids,
            });
        }
    }
    Ok(groups.into_values().collect())
}

/// SnapTrade's id for a stock execution. Options have their own symbol object.
fn stock_instrument_id(raw: &Value) -> Option<&str> {
    if !raw["option_symbol"].is_null() {
        return None;
    }
    raw["symbol"]["id"]
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
}

/// The latest ticker each broker instrument id traded under, so a renamed stock
/// stays one position. When two ids share a latest ticker, both keep their
/// recorded tickers: telling them apart needs the user.
fn canonical_symbols(rows: &[PgRow], raws: &[Value]) -> Result<HashMap<String, String>> {
    let mut latest = HashMap::<String, String>::new();
    for (row, raw) in rows.iter().zip(raws) {
        if row.try_get::<Option<String>, _>("option_kind")?.is_some() {
            continue;
        }
        let Some(id) = stock_instrument_id(raw) else {
            continue;
        };
        let symbol = row
            .try_get::<Option<String>, _>("symbol")?
            .unwrap_or_default()
            .trim()
            .to_ascii_uppercase();
        if !symbol.is_empty() {
            latest.insert(id.to_owned(), symbol);
        }
    }
    let mut owners = HashMap::<String, usize>::new();
    for symbol in latest.values() {
        *owners.entry(symbol.clone()).or_default() += 1;
    }
    latest.retain(|_, symbol| owners.get(symbol) == Some(&1));
    Ok(latest)
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
    let instrument_ids = source.instrument_ids.clone();
    // A confirmed ticker transition applies only to this execution. Broker rows
    // and future executions under either ticker retain their original identity.
    let source = groups
        .get_mut(&source_key)
        .ok_or_else(|| anyhow!("Continuation source disappeared"))?;
    source
        .fills
        .retain(|fill| fill.transaction_id != closing.transaction_id);
    source.source_ids.retain(|id| id != &closing.transaction_id);
    let emptied = source.source_ids.is_empty();
    if emptied {
        groups.remove(&source_key);
    }
    let target = groups
        .get_mut(&target_key)
        .ok_or_else(|| anyhow!("Continuation target disappeared"))?;
    if emptied {
        target.aliases.insert(source_key);
    }
    target.instrument_ids.extend(instrument_ids);
    target.source_ids.push(closing.transaction_id.clone());
    target.fills.push(closing);
    target.fills.sort_by(|a, b| {
        (a.executed_at, &a.transaction_id).cmp(&(b.executed_at, &b.transaction_id))
    });
    target.fees_known &= fees_known;
    Ok(())
}
