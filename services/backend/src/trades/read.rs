//! Queries over the engine's output and the journal, for the API.

use std::collections::HashMap;

use anyhow::Result;
use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc};
use chrono_tz::America::New_York;
use rust_decimal::Decimal;
use serde_json::Value;
use sqlx::{PgPool, Postgres, QueryBuilder, types::Json};
use uuid::Uuid;

use super::{
    behavior::TradeBehavior,
    instrument::Alias,
    labels::LabelRef,
    measure,
    model::Instrument,
    positions::{self, HoldingsSnapshot},
};

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct TradeRow {
    pub id: String,
    pub workspace_id: Uuid,
    pub kind: String,
    pub parent_id: Option<String>,
    pub children: Vec<String>,
    pub instrument_key: String,
    pub instrument: Json<Instrument>,
    pub asset_class: String,
    pub symbol: String,
    pub underlying: String,
    pub direction: Option<String>,
    pub status: String,
    pub opened_at: DateTime<Utc>,
    pub closed_at: Option<DateTime<Utc>>,
    pub max_quantity: Decimal,
    pub open_quantity: Decimal,
    pub avg_entry: Option<Decimal>,
    pub avg_exit: Option<Decimal>,
    pub gross: Decimal,
    pub fees: Decimal,
    pub net: Option<Decimal>,
    pub income: Decimal,
    pub entry_cost: Decimal,
    pub return_pct: Option<Decimal>,
    pub holding_seconds: Option<i64>,
    pub fill_count: i32,
    pub non_economic: bool,
    pub related: Vec<String>,
    pub strategy_label: Option<String>,
    pub issues: Value,
    pub annotation_id: Option<Uuid>,
    pub notes: Option<Json<Value>>,
    pub initial_stop: Option<Decimal>,
    pub planned_risk: Option<Decimal>,
    /// The user's default risk per trade, for trades with neither of the above.
    pub default_risk: Option<Decimal>,
    pub edges: Json<Vec<LabelRef>>,
    pub entry_tactics: Json<Vec<LabelRef>>,
    pub tags: Json<Vec<LabelRef>>,
    pub mistakes: Json<Vec<LabelRef>>,
    #[sqlx(flatten)]
    pub behavior: TradeBehavior,
    /// A trade plan is linked to this trade.
    pub has_plan: bool,
    pub annotation_version: Option<i32>,
    pub annotation_updated_at: Option<DateTime<Utc>>,
}

impl TradeRow {
    /// Dollars at risk: the planned risk if set, otherwise what the initial
    /// stop put at risk, otherwise the user's default risk per trade.
    pub fn risk(&self) -> Option<Decimal> {
        self.planned_risk
            .or_else(|| {
                Some(measure::stop_risk(
                    self.avg_entry?,
                    self.initial_stop?,
                    self.max_quantity,
                    self.instrument.multiplier,
                ))
            })
            .or(self.default_risk)
    }

    pub fn r_multiple(&self) -> Option<Decimal> {
        measure::r_multiple(self.net?, self.risk()?)
    }
}

/// A journal label as JSON, matching `LabelRef`.
macro_rules! label_json {
    () => {
        "json_build_object('id', l.id, 'kind', l.kind, 'name', l.name, 'color', l.color, 'archived', l.archived_at IS NOT NULL)"
    };
}

/// The labels of one kind on journal entry `a`, as a JSON array.
macro_rules! label_list {
    ($kind:literal) => {
        concat!(
            "COALESCE((SELECT json_agg(",
            label_json!(),
            " ORDER BY l.position, lower(l.name)) ",
            "FROM trade_annotation_labels x JOIN journal_labels l ON l.id = x.label_id ",
            "WHERE x.annotation_id = a.id AND x.kind = '",
            $kind,
            "'), '[]'::json)"
        )
    };
}

/// The behavior fields of journal entry `a`, matching `TradeBehavior`.
macro_rules! behavior_columns {
    () => {
        "a.conviction, a.market_regime, a.planned_pre_market, a.revenge_trade, a.broke_thirty_minute_rule, a.rule_adherence"
    };
}

/// The labels on journal entry `a`, as `edges`, `entry_tactics`, `tags` and `mistakes`.
macro_rules! annotation_labels {
    () => {
        concat!(
            label_list!("edge"),
            " AS edges, ",
            label_list!("entry_tactic"),
            " AS entry_tactics, ",
            label_list!("tag"),
            " AS tags, ",
            label_list!("mistake"),
            " AS mistakes"
        )
    };
}

pub(crate) const TRADE_COLUMNS: &str = concat!(
    "t.id, t.workspace_id, t.kind, t.parent_id, t.children, t.instrument_key, t.instrument,
    t.asset_class, t.symbol, t.underlying, t.direction, t.status, t.opened_at, t.closed_at, t.max_quantity,
    t.open_quantity, t.avg_entry, t.avg_exit, t.gross, t.fees, t.net, t.income, t.entry_cost, t.return_pct,
    t.holding_seconds, t.fill_count, t.non_economic, t.related, t.strategy_label, t.issues,
    a.id AS annotation_id, a.notes, a.initial_stop, a.planned_risk,
    (SELECT s.default_risk FROM user_settings s WHERE s.user_id = t.user_id) AS default_risk, ",
    annotation_labels!(),
    ", ",
    behavior_columns!(),
    ", EXISTS (SELECT 1 FROM trade_plans p WHERE p.user_id = t.user_id AND p.trade_id = t.id) AS has_plan,
    a.record_version AS annotation_version, a.updated_at AS annotation_updated_at
    FROM trades t LEFT JOIN trade_annotations a
      ON a.user_id = t.user_id AND a.trade_id = t.id AND a.orphaned_at IS NULL"
);

#[derive(Clone, Debug, Default)]
pub struct TradeFilter {
    pub status: Option<String>,
    pub direction: Option<String>,
    pub symbol: Option<String>,
    pub edge_id: Option<Uuid>,
    pub entry_tactic_id: Option<Uuid>,
    pub tag_id: Option<Uuid>,
    pub mistake_id: Option<Uuid>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub closed_from: Option<DateTime<Utc>>,
    pub closed_to: Option<DateTime<Utc>>,
}

#[derive(Clone, Copy, Debug, Default)]
pub enum TradeSort {
    #[default]
    OpenedDesc,
    OpenedAsc,
    NetDesc,
    NetAsc,
}

fn push_filters(
    builder: &mut QueryBuilder<Postgres>,
    user_id: Uuid,
    workspace_id: Uuid,
    filter: &TradeFilter,
) {
    builder.push(" WHERE t.user_id = ").push_bind(user_id);
    builder
        .push(" AND t.workspace_id = ")
        .push_bind(workspace_id);
    builder.push(" AND t.parent_id IS NULL");
    if let Some(status) = &filter.status {
        builder.push(" AND t.status = ").push_bind(status.clone());
    }
    if let Some(direction) = &filter.direction {
        builder
            .push(" AND t.direction = ")
            .push_bind(direction.clone());
    }
    if let Some(symbol) = filter
        .symbol
        .as_ref()
        .map(|s| s.trim().to_ascii_uppercase())
        .filter(|s| !s.is_empty())
    {
        builder
            .push(" AND (t.symbol LIKE ")
            .push_bind(format!("{symbol}%"))
            .push(" OR t.underlying LIKE ")
            .push_bind(format!("{symbol}%"))
            .push(")");
    }
    for label in [
        filter.edge_id,
        filter.entry_tactic_id,
        filter.tag_id,
        filter.mistake_id,
    ]
    .into_iter()
    .flatten()
    {
        builder
            .push(" AND EXISTS (SELECT 1 FROM trade_annotation_labels x WHERE x.annotation_id = a.id AND x.label_id = ")
            .push_bind(label)
            .push(")");
    }
    if let Some(from) = filter.from {
        builder.push(" AND t.opened_at >= ").push_bind(from);
    }
    if let Some(to) = filter.to {
        builder.push(" AND t.opened_at < ").push_bind(to);
    }
    if let Some(from) = filter.closed_from {
        builder.push(" AND t.closed_at >= ").push_bind(from);
    }
    if let Some(to) = filter.closed_to {
        builder.push(" AND t.closed_at < ").push_bind(to);
    }
}

pub async fn trades(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    filter: &TradeFilter,
    sort: TradeSort,
    offset: i64,
    limit: i64,
) -> Result<(i64, Vec<TradeRow>)> {
    let mut count: QueryBuilder<Postgres> = QueryBuilder::new(
        "SELECT count(*) FROM trades t LEFT JOIN trade_annotations a ON a.user_id = t.user_id AND a.trade_id = t.id AND a.orphaned_at IS NULL",
    );
    push_filters(&mut count, user_id, workspace_id, filter);
    let total: i64 = count.build_query_scalar().fetch_one(pool).await?;
    let mut list: QueryBuilder<Postgres> = QueryBuilder::new(format!("SELECT {TRADE_COLUMNS}"));
    push_filters(&mut list, user_id, workspace_id, filter);
    list.push(match sort {
        TradeSort::OpenedDesc => " ORDER BY t.opened_at DESC, t.id",
        TradeSort::OpenedAsc => " ORDER BY t.opened_at, t.id",
        TradeSort::NetDesc => " ORDER BY t.net DESC NULLS LAST, t.id",
        TradeSort::NetAsc => " ORDER BY t.net ASC NULLS LAST, t.id",
    });
    list.push(" OFFSET ")
        .push_bind(offset)
        .push(" LIMIT ")
        .push_bind(limit);
    let rows = list.build_query_as::<TradeRow>().fetch_all(pool).await?;
    Ok((total, rows))
}

pub async fn trades_by_id(pool: &PgPool, user_id: Uuid, ids: &[String]) -> Result<Vec<TradeRow>> {
    Ok(sqlx::query_as::<_, TradeRow>(sqlx::AssertSqlSafe(format!(
        "SELECT {TRADE_COLUMNS} WHERE t.user_id = $1 AND t.id = ANY($2) ORDER BY t.opened_at, t.id"
    )))
    .bind(user_id)
    .bind(ids)
    .fetch_all(pool)
    .await?)
}

pub async fn trade(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    id: &str,
) -> Result<Option<TradeRow>> {
    Ok(sqlx::query_as::<_, TradeRow>(sqlx::AssertSqlSafe(format!(
        "SELECT {TRADE_COLUMNS} WHERE t.user_id = $1 AND t.workspace_id = $2 AND t.id = $3"
    )))
    .bind(user_id)
    .bind(workspace_id)
    .bind(id)
    .fetch_optional(pool)
    .await?)
}

pub async fn open_trades(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
) -> Result<Vec<TradeRow>> {
    Ok(sqlx::query_as::<_, TradeRow>(sqlx::AssertSqlSafe(format!(
        "SELECT {TRADE_COLUMNS} WHERE t.user_id = $1 AND t.workspace_id = $2 AND t.status = 'open' AND t.kind = 'single'
         ORDER BY t.symbol, t.opened_at"
    )))
    .bind(user_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await?)
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct FillRow {
    pub fill_key: String,
    pub role: String,
    pub executed_at: DateTime<Utc>,
    pub quantity: Decimal,
    pub price: Decimal,
    pub fee: Decimal,
    pub derived: bool,
}

pub async fn fills(pool: &PgPool, user_id: Uuid, trade_id: &str) -> Result<Vec<FillRow>> {
    Ok(sqlx::query_as(
        "SELECT fill_key, role, executed_at, quantity, price, fee, derived FROM trade_fills
         WHERE user_id = $1 AND trade_id = $2 ORDER BY seq",
    )
    .bind(user_id)
    .bind(trade_id)
    .fetch_all(pool)
    .await?)
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct LotRow {
    pub lot_id: String,
    pub direction: String,
    pub opened_by: String,
    pub acquired_at: DateTime<Utc>,
    pub holding_from: DateTime<Utc>,
    pub original_quantity: Decimal,
    pub quantity: Decimal,
    pub cost_per_unit: Decimal,
    pub tax_cost_adjustment: Decimal,
    pub wash_basis_adjustment: Decimal,
    pub cost_known: bool,
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct ClosureRow {
    pub lot_id: String,
    pub trade_id: String,
    pub workspace_id: Uuid,
    pub symbol: String,
    pub direction: String,
    pub acquired_at: DateTime<Utc>,
    pub closed_by: String,
    pub closed_at: DateTime<Utc>,
    pub quantity: Decimal,
    pub exit_price: Decimal,
    pub fee: Decimal,
    pub gross: Decimal,
    pub kind: String,
    pub non_economic: bool,
    pub tax_proceeds: Option<Decimal>,
    pub tax_cost: Option<Decimal>,
    pub tax_realized: Option<Decimal>,
    pub wash_disallowed: Option<Decimal>,
    pub wash_permanent: Option<bool>,
    pub term: Option<String>,
}

const CLOSURE_COLUMNS: &str = "lot_id, trade_id, workspace_id, symbol, direction, acquired_at, closed_by, closed_at, quantity,
    exit_price, fee, gross, kind, non_economic, tax_proceeds, tax_cost, tax_realized, wash_disallowed, wash_permanent, term";

pub async fn lots(
    pool: &PgPool,
    user_id: Uuid,
    trade_id: &str,
) -> Result<(Vec<LotRow>, Vec<ClosureRow>)> {
    let lots = sqlx::query_as(
        "SELECT lot_id, direction, opened_by, acquired_at, holding_from, original_quantity, quantity, cost_per_unit,
            tax_cost_adjustment, wash_basis_adjustment, cost_known
         FROM trade_lots WHERE user_id = $1 AND trade_id = $2 ORDER BY acquired_at, lot_id",
    )
    .bind(user_id)
    .bind(trade_id)
    .fetch_all(pool)
    .await?;
    let closures = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {CLOSURE_COLUMNS} FROM lot_closures WHERE user_id = $1 AND trade_id = $2 ORDER BY closed_at, lot_id, seq"
    )))
    .bind(user_id)
    .bind(trade_id)
    .fetch_all(pool)
    .await?;
    Ok((lots, closures))
}

pub async fn aliases(pool: &PgPool, user_id: Uuid) -> Result<Vec<Alias>> {
    let rows: Vec<(String, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT from_key, to_key, effective_at FROM instrument_aliases WHERE user_id = $1 AND status = 'confirmed'",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(from_key, to_key, effective_at)| Alias {
            from_key,
            to_key,
            effective_at,
        })
        .collect())
}

/// Latest holdings marks for a workspace, by instrument key.
pub async fn marks(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
) -> Result<HashMap<String, Decimal>> {
    let snapshot: Option<(DateTime<Utc>, Value)> = sqlx::query_as(
        "SELECT s.captured_at, s.positions FROM brokerage_snapshots s
         JOIN workspaces w ON w.brokerage_account_id = s.account_id
         WHERE w.id = $1 AND w.user_id = $2 ORDER BY s.captured_at DESC LIMIT 1",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    let Some((captured_at, positions)) = snapshot else {
        return Ok(HashMap::new());
    };
    let aliases = aliases(pool, user_id).await?;
    Ok(positions::marks(
        &[HoldingsSnapshot {
            workspace_id,
            captured_at,
            positions,
        }],
        &aliases,
    )
    .into_iter()
    .map(|((_, key), price)| (key, price))
    .collect())
}

#[derive(Clone, Debug, Default)]
pub struct EngineState {
    pub rebuilt_at: Option<DateTime<Utc>>,
    pub issues: Value,
    pub decision_outcomes: Value,
    pub alias_suggestions: Value,
    pub strategy_suggestions: Value,
    pub unattributed_income: Value,
}

pub async fn state(pool: &PgPool, user_id: Uuid) -> Result<EngineState> {
    let row: Option<(DateTime<Utc>, Value, Value, Value, Value, Value)> = sqlx::query_as(
        "SELECT rebuilt_at, issues, decision_outcomes, alias_suggestions, strategy_suggestions, unattributed_income
         FROM trade_engine_state WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(row
        .map(
            |(rebuilt_at, issues, outcomes, aliases, strategies, income)| EngineState {
                rebuilt_at: Some(rebuilt_at),
                issues,
                decision_outcomes: outcomes,
                alias_suggestions: aliases,
                strategy_suggestions: strategies,
                unattributed_income: income,
            },
        )
        .unwrap_or_default())
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct DecisionRow {
    pub id: Uuid,
    pub payload: Value,
    pub created_at: DateTime<Utc>,
}

pub async fn decisions(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
) -> Result<Vec<DecisionRow>> {
    Ok(sqlx::query_as(
        "SELECT id, payload, created_at FROM trade_decisions
         WHERE user_id = $1 AND workspace_id = $2 AND undone_at IS NULL ORDER BY created_at DESC",
    )
    .bind(user_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await?)
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct AnnotationRow {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub trade_id: String,
    pub notes: Json<Value>,
    pub initial_stop: Option<Decimal>,
    pub planned_risk: Option<Decimal>,
    pub edges: Json<Vec<LabelRef>>,
    pub entry_tactics: Json<Vec<LabelRef>>,
    pub tags: Json<Vec<LabelRef>>,
    pub mistakes: Json<Vec<LabelRef>>,
    #[sqlx(flatten)]
    pub behavior: TradeBehavior,
    pub record_version: i32,
    pub orphaned_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

const ANNOTATION_COLUMNS: &str = concat!(
    "a.id, a.workspace_id, a.trade_id, a.notes, a.initial_stop, a.planned_risk, ",
    annotation_labels!(),
    ", ",
    behavior_columns!(),
    ", a.record_version, a.orphaned_at, a.updated_at"
);

pub async fn orphaned_annotations(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
) -> Result<Vec<AnnotationRow>> {
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {ANNOTATION_COLUMNS} FROM trade_annotations a
         WHERE a.user_id = $1 AND a.workspace_id = $2 AND a.orphaned_at IS NOT NULL ORDER BY a.updated_at DESC"
    )))
    .bind(user_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await?)
}

pub async fn annotation(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<Option<AnnotationRow>> {
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {ANNOTATION_COLUMNS} FROM trade_annotations a WHERE a.user_id = $1 AND a.id = $2"
    )))
    .bind(user_id)
    .bind(id)
    .fetch_optional(pool)
    .await?)
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct ManualFillRow {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub instrument: Json<Instrument>,
    pub side: String,
    pub quantity: Decimal,
    pub price: Decimal,
    pub fee: Decimal,
    pub intent: Option<String>,
    pub executed_at: DateTime<Utc>,
    pub note: String,
    pub record_version: i32,
}

pub async fn manual_fills(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
) -> Result<Vec<ManualFillRow>> {
    Ok(sqlx::query_as(
        "SELECT id, workspace_id, instrument, side, quantity, price, fee, intent, executed_at, note, record_version
         FROM manual_fills WHERE user_id = $1 AND workspace_id = $2 AND deleted_at IS NULL ORDER BY executed_at DESC",
    )
    .bind(user_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await?)
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct OpeningRow {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub instrument: Json<Instrument>,
    pub quantity: Decimal,
    pub cost_per_unit: Decimal,
    pub acquired_at: DateTime<Utc>,
    pub as_of: DateTime<Utc>,
}

pub async fn openings(pool: &PgPool, user_id: Uuid, workspace_id: Uuid) -> Result<Vec<OpeningRow>> {
    Ok(sqlx::query_as(
        "SELECT id, workspace_id, instrument, quantity, cost_per_unit, acquired_at, as_of FROM opening_positions
         WHERE user_id = $1 AND workspace_id = $2 ORDER BY as_of",
    )
    .bind(user_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await?)
}

/// Calendar-year bounds in New York time, where US trading days are dated.
pub fn year_bounds(year: i32) -> Option<(DateTime<Utc>, DateTime<Utc>)> {
    let start = New_York
        .from_local_datetime(&NaiveDate::from_ymd_opt(year, 1, 1)?.and_hms_opt(0, 0, 0)?)
        .single()?;
    let end = New_York
        .from_local_datetime(&NaiveDate::from_ymd_opt(year + 1, 1, 1)?.and_hms_opt(0, 0, 0)?)
        .single()?;
    Some((start.with_timezone(&Utc), end.with_timezone(&Utc)))
}

pub async fn tax_closures(pool: &PgPool, user_id: Uuid, year: i32) -> Result<Vec<ClosureRow>> {
    let Some((from, to)) = year_bounds(year) else {
        return Ok(Vec::new());
    };
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {CLOSURE_COLUMNS} FROM lot_closures WHERE user_id = $1 AND tax_realized IS NOT NULL
           AND closed_at >= $2 AND closed_at < $3 ORDER BY closed_at, lot_id"
    )))
    .bind(user_id)
    .bind(from)
    .bind(to)
    .fetch_all(pool)
    .await?)
}

pub async fn tax_years(pool: &PgPool, user_id: Uuid) -> Result<Vec<i32>> {
    let closed: Vec<DateTime<Utc>> = sqlx::query_scalar(
        "SELECT DISTINCT date_trunc('day', closed_at) FROM lot_closures WHERE user_id = $1 AND tax_realized IS NOT NULL",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    let mut years: Vec<i32> = closed
        .into_iter()
        .map(|at| at.with_timezone(&New_York).year())
        .collect();
    years.sort_unstable();
    years.dedup();
    years.reverse();
    Ok(years)
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct SuggestedStop {
    pub price: Decimal,
    pub order_type: String,
    pub placed_at: DateTime<Utc>,
    pub status: Option<String>,
}

/// The first protective stop order placed while the trade was open, for a
/// trade that has no initial stop yet. Computed on read, never stored.
pub async fn suggested_stop(
    pool: &PgPool,
    user_id: Uuid,
    trade: &TradeRow,
) -> Result<Option<SuggestedStop>> {
    if trade.kind != "single" || trade.initial_stop.is_some() || trade.planned_risk.is_some() {
        return Ok(None);
    }
    let protective = match trade.direction.as_deref() {
        Some("long") => "SELL%",
        Some("short") => "BUY%",
        _ => return Ok(None),
    };
    Ok(sqlx::query_as(
        "SELECT price, order_type, placed_at, status FROM (
            SELECT CASE WHEN o.raw->>'stop_price' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (o.raw->>'stop_price')::numeric END AS price,
                o.raw->>'order_type' AS order_type, o.time_placed AS placed_at, o.status
            FROM brokerage_orders o JOIN workspaces w ON w.brokerage_account_id = o.account_id
            WHERE w.id = $1 AND w.user_id = $2
              AND replace(upper(o.symbol), ' ', '') = replace(upper($3), ' ', '')
              AND upper(o.action) LIKE $4
              AND lower(replace(o.raw->>'order_type', '_', '')) IN ('stop', 'stoplimit', 'trailingstop', 'stoploss')
              AND o.time_placed >= $5 AND o.time_placed <= COALESCE($6, now())
         ) stops WHERE price > 0 ORDER BY placed_at LIMIT 1",
    )
    .bind(trade.workspace_id)
    .bind(user_id)
    .bind(&trade.symbol)
    .bind(protective)
    .bind(trade.opened_at)
    .bind(trade.closed_at)
    .fetch_optional(pool)
    .await?)
}
