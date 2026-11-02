//! Changes a user makes to their trades: manual fills, opening positions,
//! ticker aliases, regrouping decisions and journal annotations. Anything that
//! changes engine input rebuilds before returning, so the caller reads fresh
//! trades.

use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use sqlx::PgPool;
use uuid::Uuid;

use super::{
    behavior::TradeBehavior,
    compute,
    decisions::{Decision, DecisionKind, DecisionOutcome, OutcomeStatus},
    labels::{self, LabelKind},
    model::{AssetClass, Instrument, Intent, Side, Trade},
    notes::{self, NoteDocument},
    rebuild, store,
};
use crate::db::new_id;

#[derive(Debug, thiserror::Error)]
pub enum TradeError {
    #[error("not found")]
    NotFound,
    #[error("{1}")]
    Invalid(&'static str, String),
    #[error("this changed on another device; reload and try again")]
    Conflict,
    /// A label of that kind and name already exists; this is its ID.
    #[error("a label with that name already exists")]
    LabelExists(Uuid),
    #[error("the decision does not apply: {0}")]
    Rejected(String, OutcomeStatus),
    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<sqlx::Error> for TradeError {
    fn from(error: sqlx::Error) -> Self {
        Self::Internal(error.into())
    }
}

type Result<T> = std::result::Result<T, TradeError>;

pub(super) fn invalid<T>(code: &'static str, message: impl Into<String>) -> Result<T> {
    Err(TradeError::Invalid(code, message.into()))
}

/// The workspace, if the user owns it, and whether it is manual.
async fn workspace(pool: &PgPool, user_id: Uuid, workspace_id: Uuid) -> Result<bool> {
    let row: Option<Option<Uuid>> = sqlx::query_scalar(
        "SELECT brokerage_account_id FROM workspaces WHERE id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    row.map(|account| account.is_none())
        .ok_or(TradeError::NotFound)
}

pub async fn owns_workspace(pool: &PgPool, user_id: Uuid, workspace_id: Uuid) -> Result<()> {
    workspace(pool, user_id, workspace_id).await.map(|_| ())
}

async fn rebuilt(pool: &PgPool, user_id: Uuid) -> Result<()> {
    rebuild::rebuild(pool, user_id).await?;
    Ok(())
}

#[derive(Clone, Debug)]
pub struct InstrumentInput {
    pub asset_class: AssetClass,
    pub symbol: String,
    pub expiry: Option<chrono::NaiveDate>,
    pub right: Option<super::model::OptionRight>,
    pub strike: Option<Decimal>,
    pub mini: bool,
}

pub fn instrument(input: &InstrumentInput) -> Result<Instrument> {
    let symbol = input.symbol.trim().to_ascii_uppercase();
    if symbol.is_empty()
        || symbol.len() > 24
        || !symbol
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".-/".contains(c))
    {
        return invalid("INVALID_SYMBOL", "Enter a ticker such as AAPL");
    }
    Ok(match input.asset_class {
        AssetClass::Stock => Instrument::stock(&symbol),
        AssetClass::Crypto => Instrument::crypto(&symbol),
        AssetClass::Option => {
            let (Some(expiry), Some(right), Some(strike)) =
                (input.expiry, input.right, input.strike)
            else {
                return invalid(
                    "INVALID_OPTION",
                    "An option needs an expiry, call or put, and a strike",
                );
            };
            if strike <= Decimal::ZERO {
                return invalid("INVALID_OPTION", "The strike must be above zero");
            }
            Instrument::option(
                super::model::OptionContract {
                    underlying: symbol,
                    expiry,
                    right,
                    strike: strike.normalize(),
                },
                Decimal::from(if input.mini {
                    super::instrument::MINI_MULTIPLIER
                } else {
                    super::instrument::STANDARD_MULTIPLIER
                }),
            )
        }
    })
}

#[derive(Clone, Debug)]
pub struct ManualFillInput {
    pub instrument: InstrumentInput,
    pub side: Side,
    pub quantity: Decimal,
    pub price: Decimal,
    pub fee: Decimal,
    pub intent: Option<Intent>,
    pub executed_at: DateTime<Utc>,
    pub note: String,
}

fn validate_fill(input: &ManualFillInput) -> Result<Instrument> {
    let instrument = instrument(&input.instrument)?;
    if input.quantity <= Decimal::ZERO {
        return invalid("INVALID_QUANTITY", "Quantity must be above zero");
    }
    if input.price < Decimal::ZERO || input.fee < Decimal::ZERO {
        return invalid("INVALID_PRICE", "Price and fee cannot be negative");
    }
    if input.executed_at > Utc::now() + Duration::minutes(5) {
        return invalid("FUTURE_FILL", "A fill cannot be in the future");
    }
    if input.note.chars().count() > 2000 {
        return invalid("NOTE_TOO_LONG", "Notes are at most 2,000 characters");
    }
    Ok(instrument)
}

fn side_text(side: Side) -> &'static str {
    match side {
        Side::Buy => "buy",
        Side::Sell => "sell",
    }
}

fn intent_text(intent: Option<Intent>) -> Option<&'static str> {
    intent.map(|intent| match intent {
        Intent::Open => "open",
        Intent::Close => "close",
    })
}

pub async fn add_manual_fill(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    input: &ManualFillInput,
) -> Result<Uuid> {
    if !workspace(pool, user_id, workspace_id).await? {
        return invalid(
            "MANUAL_FILLS_NEED_MANUAL_WORKSPACE",
            "Imported workspaces get their fills from the brokerage; use an opening position for missing history",
        );
    }
    let instrument = validate_fill(input)?;
    let id = new_id();
    sqlx::query(
        "INSERT INTO manual_fills (id, user_id, workspace_id, instrument, instrument_key, side, quantity, price, fee, intent, executed_at, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
    )
    .bind(id)
    .bind(user_id)
    .bind(workspace_id)
    .bind(serde_json::to_value(&instrument).map_err(anyhow::Error::from)?)
    .bind(instrument.key())
    .bind(side_text(input.side))
    .bind(input.quantity)
    .bind(input.price)
    .bind(input.fee)
    .bind(intent_text(input.intent))
    .bind(input.executed_at)
    .bind(input.note.trim())
    .execute(pool)
    .await?;
    rebuilt(pool, user_id).await?;
    Ok(id)
}

pub async fn update_manual_fill(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    expected_version: i32,
    input: &ManualFillInput,
) -> Result<()> {
    let instrument = validate_fill(input)?;
    let updated = sqlx::query(
        "UPDATE manual_fills SET instrument = $4, instrument_key = $5, side = $6, quantity = $7, price = $8, fee = $9,
            intent = $10, executed_at = $11, note = $12, record_version = record_version + 1, updated_at = now()
         WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL AND record_version = $3",
    )
    .bind(id)
    .bind(user_id)
    .bind(expected_version)
    .bind(serde_json::to_value(&instrument).map_err(anyhow::Error::from)?)
    .bind(instrument.key())
    .bind(side_text(input.side))
    .bind(input.quantity)
    .bind(input.price)
    .bind(input.fee)
    .bind(intent_text(input.intent))
    .bind(input.executed_at)
    .bind(input.note.trim())
    .execute(pool)
    .await?
    .rows_affected();
    if updated == 0 {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM manual_fills WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL)",
        )
        .bind(id)
        .bind(user_id)
        .fetch_one(pool)
        .await?;
        return Err(if exists {
            TradeError::Conflict
        } else {
            TradeError::NotFound
        });
    }
    rebuilt(pool, user_id).await
}

pub async fn delete_manual_fill(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<()> {
    let deleted = sqlx::query(
        "UPDATE manual_fills SET deleted_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?
    .rows_affected();
    if deleted == 0 {
        return Err(TradeError::NotFound);
    }
    rebuilt(pool, user_id).await
}

#[derive(Clone, Debug)]
pub struct OpeningInput {
    pub instrument: InstrumentInput,
    pub quantity: Decimal,
    pub cost_per_unit: Decimal,
    pub acquired_at: DateTime<Utc>,
    pub as_of: DateTime<Utc>,
}

pub async fn set_opening_position(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    input: &OpeningInput,
) -> Result<Uuid> {
    workspace(pool, user_id, workspace_id).await?;
    let instrument = instrument(&input.instrument)?;
    if input.quantity.is_zero() {
        return invalid(
            "INVALID_QUANTITY",
            "Quantity cannot be zero; negative means short",
        );
    }
    if input.cost_per_unit < Decimal::ZERO {
        return invalid("INVALID_PRICE", "Cost cannot be negative");
    }
    if input.acquired_at > input.as_of {
        return invalid(
            "INVALID_DATES",
            "The position must be acquired on or before the date it is held as of",
        );
    }
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO opening_positions (id, user_id, workspace_id, instrument, instrument_key, quantity, cost_per_unit, acquired_at, as_of)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (workspace_id, instrument_key) DO UPDATE SET quantity = EXCLUDED.quantity,
            cost_per_unit = EXCLUDED.cost_per_unit, acquired_at = EXCLUDED.acquired_at, as_of = EXCLUDED.as_of,
            instrument = EXCLUDED.instrument, updated_at = now()
         RETURNING id",
    )
    .bind(new_id())
    .bind(user_id)
    .bind(workspace_id)
    .bind(serde_json::to_value(&instrument).map_err(anyhow::Error::from)?)
    .bind(instrument.key())
    .bind(input.quantity)
    .bind(input.cost_per_unit)
    .bind(input.acquired_at)
    .bind(input.as_of)
    .fetch_one(pool)
    .await?;
    rebuilt(pool, user_id).await?;
    Ok(id)
}

pub async fn delete_opening_position(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<()> {
    let deleted = sqlx::query("DELETE FROM opening_positions WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?
        .rows_affected();
    if deleted == 0 {
        return Err(TradeError::NotFound);
    }
    rebuilt(pool, user_id).await
}

fn alias_key(key: &str) -> Result<String> {
    let key = key.trim();
    match key.split_once(':') {
        Some((kind, symbol)) if ["stock", "crypto"].contains(&kind) && !symbol.is_empty() => {
            Ok(format!("{kind}:{}", symbol.to_ascii_uppercase()))
        }
        _ => invalid(
            "INVALID_ALIAS",
            "Aliases join two tickers, such as stock:IRBTQ and stock:IRBT",
        ),
    }
}

/// Records the user's answer to a ticker-change suggestion, or one of their own.
pub async fn set_alias(
    pool: &PgPool,
    user_id: Uuid,
    from_key: &str,
    to_key: &str,
    effective_at: DateTime<Utc>,
    confirmed: bool,
) -> Result<()> {
    let (from_key, to_key) = (alias_key(from_key)?, alias_key(to_key)?);
    if from_key == to_key {
        return invalid("INVALID_ALIAS", "A ticker cannot be an alias of itself");
    }
    sqlx::query(
        "INSERT INTO instrument_aliases (id, user_id, from_key, to_key, effective_at, status) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, from_key, to_key) DO UPDATE SET effective_at = EXCLUDED.effective_at, status = EXCLUDED.status",
    )
    .bind(new_id())
    .bind(user_id)
    .bind(&from_key)
    .bind(&to_key)
    .bind(effective_at)
    .bind(if confirmed { "confirmed" } else { "rejected" })
    .execute(pool)
    .await?;
    rebuilt(pool, user_id).await
}

pub async fn remove_alias(
    pool: &PgPool,
    user_id: Uuid,
    from_key: &str,
    to_key: &str,
) -> Result<()> {
    let deleted = sqlx::query(
        "DELETE FROM instrument_aliases WHERE user_id = $1 AND from_key = $2 AND to_key = $3",
    )
    .bind(user_id)
    .bind(alias_key(from_key)?)
    .bind(alias_key(to_key)?)
    .execute(pool)
    .await?
    .rows_affected();
    if deleted == 0 {
        return Err(TradeError::NotFound);
    }
    rebuilt(pool, user_id).await
}

pub struct Preview {
    pub outcome: DecisionOutcome,
    pub trades: Vec<Trade>,
}

/// What a decision would do, computed in memory; nothing is saved.
pub async fn preview_decision(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    kind: &DecisionKind,
) -> Result<Preview> {
    workspace(pool, user_id, workspace_id).await?;
    let mut conn = pool.acquire().await?;
    let mut loaded = store::load(&mut conn, user_id).await?;
    // Saved decisions carry the database's clock, which can run ahead of this
    // host's; the new one must still replay after all of them.
    let latest = loaded.input.decisions.iter().map(|d| d.created_at).max();
    let created_at = latest.map_or_else(Utc::now, |latest| {
        Utc::now().max(latest + Duration::microseconds(1))
    });
    let decision = Decision {
        id: new_id(),
        workspace_id,
        created_at,
        kind: kind.clone(),
    };
    loaded.input.decisions.push(decision.clone());
    let mut output = compute(&loaded.input);
    let outcome = output
        .decision_outcomes
        .iter()
        .find(|o| o.decision_id == decision.id)
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("the decision produced no outcome"))?;
    let ids: std::collections::HashSet<&String> = outcome.trade_ids.iter().collect();
    let mut trades: Vec<Trade> = Vec::new();
    for trade in output.trades.drain(..) {
        if ids.contains(&trade.id) || trade.parent_id.as_ref().is_some_and(|p| ids.contains(p)) {
            trades.push(trade);
        }
    }
    Ok(Preview { outcome, trades })
}

/// Saves a decision only if it applies; one that would not is refused.
pub async fn decide(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    kind: &DecisionKind,
) -> Result<(Uuid, Vec<String>)> {
    let preview = preview_decision(pool, user_id, workspace_id, kind).await?;
    if preview.outcome.status != OutcomeStatus::Applied {
        return Err(TradeError::Rejected(
            preview
                .outcome
                .code
                .unwrap_or_else(|| "not_applicable".into()),
            preview.outcome.status,
        ));
    }
    let id = new_id();
    sqlx::query(
        "INSERT INTO trade_decisions (id, user_id, workspace_id, payload) VALUES ($1, $2, $3, $4)",
    )
    .bind(id)
    .bind(user_id)
    .bind(workspace_id)
    .bind(serde_json::to_value(kind).map_err(anyhow::Error::from)?)
    .execute(pool)
    .await?;
    rebuilt(pool, user_id).await?;
    let state = super::read::state(pool, user_id).await?;
    let ids = serde_json::from_value::<Vec<DecisionOutcome>>(state.decision_outcomes)
        .unwrap_or_default()
        .into_iter()
        .find(|o| o.decision_id == id)
        .map(|o| o.trade_ids)
        .unwrap_or_default();
    Ok((id, ids))
}

pub async fn undo_decision(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<()> {
    let undone = sqlx::query(
        "UPDATE trade_decisions SET undone_at = now() WHERE id = $1 AND user_id = $2 AND undone_at IS NULL",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?
    .rows_affected();
    if undone == 0 {
        return Err(TradeError::NotFound);
    }
    rebuilt(pool, user_id).await
}

#[derive(Clone, Debug, Default)]
pub struct AnnotationInput {
    pub notes: NoteDocument,
    pub edge_ids: Vec<Uuid>,
    pub entry_tactic_ids: Vec<Uuid>,
    pub tag_ids: Vec<Uuid>,
    pub mistake_ids: Vec<Uuid>,
    pub initial_stop: Option<Decimal>,
    /// Dollars at risk; overrides the initial stop for R.
    pub planned_risk: Option<Decimal>,
    pub behavior: TradeBehavior,
}

fn validate_annotation(input: &AnnotationInput) -> Result<()> {
    notes::validate(&input.notes.0)?;
    if input.initial_stop.is_some_and(|p| p <= Decimal::ZERO)
        || input.planned_risk.is_some_and(|p| p <= Decimal::ZERO)
    {
        return invalid(
            "INVALID_PRICE",
            "The stop and planned risk must be above zero",
        );
    }
    if [
        &input.edge_ids,
        &input.entry_tactic_ids,
        &input.tag_ids,
        &input.mistake_ids,
    ]
    .iter()
    .any(|ids| ids.len() > 30)
    {
        return invalid("INVALID_LABEL", "At most 30 labels of each kind on a trade");
    }
    if !input.behavior.scores_in_range() {
        return invalid(
            "INVALID_SCORE",
            "Conviction and rule adherence run from 1 to 5",
        );
    }
    Ok(())
}

fn unique(ids: &[Uuid]) -> Vec<Uuid> {
    let mut ids = ids.to_vec();
    ids.sort();
    ids.dedup();
    ids
}

/// The fill a journal entry anchors to: the trade's first, or for a strategy
/// its first leg's first.
pub(super) async fn anchor_fill(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    trade_id: &str,
) -> Result<String> {
    let anchor: Option<String> = sqlx::query_scalar(
        "SELECT f.fill_key FROM trades t JOIN trade_fills f ON f.user_id = t.user_id AND f.trade_id = t.id
         WHERE t.user_id = $1 AND t.workspace_id = $2 AND t.id = $3 ORDER BY f.seq LIMIT 1",
    )
    .bind(user_id)
    .bind(workspace_id)
    .bind(trade_id)
    .fetch_optional(pool)
    .await?;
    if let Some(anchor) = anchor {
        return Ok(anchor);
    }
    let child: Option<String> = sqlx::query_scalar(
        "SELECT f.fill_key FROM trades t JOIN trades c ON c.user_id = t.user_id AND c.parent_id = t.id
         JOIN trade_fills f ON f.user_id = c.user_id AND f.trade_id = c.id
         WHERE t.user_id = $1 AND t.workspace_id = $2 AND t.id = $3 ORDER BY c.opened_at, f.seq LIMIT 1",
    )
    .bind(user_id)
    .bind(workspace_id)
    .bind(trade_id)
    .fetch_optional(pool)
    .await?;
    child.ok_or(TradeError::NotFound)
}

/// Creates or updates the journal entry on a trade. `expected_version` must
/// match an existing entry's version, so two devices cannot overwrite each other.
pub async fn save_annotation(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    trade_id: &str,
    expected_version: Option<i32>,
    input: &AnnotationInput,
) -> Result<Uuid> {
    validate_annotation(input)?;
    let b = &input.behavior;
    let anchor = anchor_fill(pool, user_id, workspace_id, trade_id).await?;
    let chosen = [
        (unique(&input.edge_ids), LabelKind::Edge),
        (unique(&input.entry_tactic_ids), LabelKind::EntryTactic),
        (unique(&input.tag_ids), LabelKind::Tag),
        (unique(&input.mistake_ids), LabelKind::Mistake),
    ];
    let mut tx = pool.begin().await?;
    let existing: Option<(Uuid, i32)> = sqlx::query_as(
        "SELECT id, record_version FROM trade_annotations
         WHERE user_id = $1 AND trade_id = $2 AND orphaned_at IS NULL FOR UPDATE",
    )
    .bind(user_id)
    .bind(trade_id)
    .fetch_optional(&mut *tx)
    .await?;
    let choices: Vec<(Uuid, LabelKind)> = chosen
        .iter()
        .flat_map(|(ids, kind)| ids.iter().map(|id| (*id, *kind)))
        .collect();
    labels::check_choices(&mut tx, user_id, existing.map(|(id, _)| id), &choices).await?;

    let id = match (existing, expected_version) {
        (Some((id, version)), Some(expected)) if version == expected => {
            sqlx::query(
                "UPDATE trade_annotations SET notes = $3, initial_stop = $4, planned_risk = $5,
                    conviction = $6, market_regime = $7, planned_pre_market = $8, revenge_trade = $9,
                    broke_thirty_minute_rule = $10, rule_adherence = $11,
                    record_version = record_version + 1, updated_at = now()
                 WHERE id = $1 AND record_version = $2",
            )
            .bind(id)
            .bind(version)
            .bind(sqlx::types::Json(&input.notes.0))
            .bind(input.initial_stop)
            .bind(input.planned_risk)
            .bind(b.conviction)
            .bind(b.market_regime)
            .bind(b.planned_pre_market)
            .bind(b.revenge_trade)
            .bind(b.broke_thirty_minute_rule)
            .bind(b.rule_adherence)
            .execute(&mut *tx)
            .await?;
            sqlx::query("DELETE FROM trade_annotation_labels WHERE annotation_id = $1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            id
        }
        (Some(_), _) | (None, Some(_)) => return Err(TradeError::Conflict),
        (None, None) => {
            let id = new_id();
            sqlx::query(
                "INSERT INTO trade_annotations (id, user_id, workspace_id, trade_id, anchor_fill_key, notes,
                    initial_stop, planned_risk, conviction, market_regime, planned_pre_market, revenge_trade,
                    broke_thirty_minute_rule, rule_adherence)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
            )
            .bind(id)
            .bind(user_id)
            .bind(workspace_id)
            .bind(trade_id)
            .bind(anchor)
            .bind(sqlx::types::Json(&input.notes.0))
            .bind(input.initial_stop)
            .bind(input.planned_risk)
            .bind(b.conviction)
            .bind(b.market_regime)
            .bind(b.planned_pre_market)
            .bind(b.revenge_trade)
            .bind(b.broke_thirty_minute_rule)
            .bind(b.rule_adherence)
            .execute(&mut *tx)
            .await
            .map_err(|error| match error {
                sqlx::Error::Database(db) if db.is_unique_violation() => TradeError::Conflict,
                other => other.into(),
            })?;
            id
        }
    };
    for (ids, kind) in &chosen {
        sqlx::query(
            "INSERT INTO trade_annotation_labels (annotation_id, label_id, kind) SELECT $1, unnest($2::uuid[]), $3",
        )
        .bind(id)
        .bind(ids)
        .bind(kind.as_str())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(id)
}

/// Moves an orphaned journal entry onto a trade that has none.
pub async fn reassign_annotation(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
    trade_id: &str,
) -> Result<()> {
    let annotation = super::read::annotation(pool, user_id, id)
        .await?
        .ok_or(TradeError::NotFound)?;
    let anchor: Option<String> = sqlx::query_scalar(
        "SELECT f.fill_key FROM trades t JOIN trade_fills f ON f.user_id = t.user_id AND f.trade_id = t.id
         WHERE t.user_id = $1 AND t.workspace_id = $2 AND t.id = $3 ORDER BY f.seq LIMIT 1",
    )
    .bind(user_id)
    .bind(annotation.workspace_id)
    .bind(trade_id)
    .fetch_optional(pool)
    .await?;
    let anchor = anchor.ok_or(TradeError::NotFound)?;
    sqlx::query(
        "UPDATE trade_annotations SET trade_id = $3, anchor_fill_key = $4, orphaned_at = NULL, updated_at = now(),
            record_version = record_version + 1
         WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(user_id)
    .bind(trade_id)
    .bind(anchor)
    .execute(pool)
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(db) if db.is_unique_violation() => TradeError::Conflict,
        other => other.into(),
    })?;
    Ok(())
}

pub async fn delete_annotation(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<()> {
    let deleted = sqlx::query("DELETE FROM trade_annotations WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?
        .rows_affected();
    if deleted == 0 {
        return Err(TradeError::NotFound);
    }
    Ok(())
}
