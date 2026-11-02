use std::collections::HashMap;

use async_graphql::{
    Context, Enum, Error, ErrorExtensions, ID, InputObject, Json, Object, Result, SimpleObject,
};
use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use super::brokerage::require_web_session;
use super::errors::{coded, to_graphql};
use super::user::current_user;
use super::workspaces::parse_id;
use crate::trades::analytics::{Stats, money};
use crate::trades::decisions::{DecisionKind, DecisionOutcome, OutcomeStatus};
use crate::trades::labels::LabelRef;
use crate::trades::model::{AssetClass, Instrument, Intent, OptionRight, Side, Trade};
use crate::trades::notes::NoteDocument;
use crate::trades::read::{self, TradeFilter as Filter, TradeRow, TradeSort as Sort};
use crate::trades::service::{
    self, AnnotationInput, InstrumentInput, ManualFillInput, OpeningInput, TradeError,
};
use crate::trades::{measure, suggest};

fn trade_error(error: TradeError) -> Error {
    match error {
        TradeError::NotFound => coded("Not found", "NOT_FOUND"),
        TradeError::Invalid(code, message) => coded(message, code),
        TradeError::Conflict => coded(error.to_string(), "CONFLICT"),
        TradeError::LabelExists(id) => Error::new(error.to_string()).extend_with(|_, ext| {
            ext.set("code", "LABEL_EXISTS");
            ext.set("existingId", id.to_string());
        }),
        TradeError::Rejected(code, _) => coded(code, "DECISION_REJECTED"),
        TradeError::Internal(error) => to_graphql(error),
    }
}

async fn context(ctx: &Context<'_>, workspace_id: &ID) -> Result<(PgPool, Uuid, Uuid)> {
    let pool = ctx.data::<PgPool>()?.clone();
    let user = current_user(ctx).await?;
    let workspace_id = parse_id(workspace_id)?;
    service::owns_workspace(&pool, user.id, workspace_id)
        .await
        .map_err(trade_error)?;
    Ok((pool, user.id, workspace_id))
}

#[derive(SimpleObject, Clone)]
pub struct OptionDetail {
    underlying: String,
    expiry: NaiveDate,
    right: String,
    strike: Decimal,
    multiplier: Decimal,
}

fn option_detail(instrument: &Instrument) -> Option<OptionDetail> {
    instrument.option.as_ref().map(|option| OptionDetail {
        underlying: option.underlying.clone(),
        expiry: option.expiry,
        right: match option.right {
            OptionRight::Call => "call".into(),
            OptionRight::Put => "put".into(),
        },
        strike: option.strike,
        multiplier: instrument.multiplier,
    })
}

#[derive(SimpleObject, Clone, Deserialize)]
pub struct TradeIssue {
    code: String,
    severity: String,
    message: String,
    instrument_key: Option<String>,
    fill_key: Option<String>,
    trade_id: Option<String>,
    #[graphql(skip)]
    workspace_id: Option<Uuid>,
}

fn issues(value: &serde_json::Value) -> Vec<TradeIssue> {
    serde_json::from_value(value.clone()).unwrap_or_default()
}

#[derive(SimpleObject, Clone)]
pub struct TradeAnnotation {
    id: ID,
    trade_id: String,
    notes: Json<serde_json::Value>,
    /// What gave the trade an advantage.
    edges: Vec<LabelRef>,
    /// What triggered the entry.
    entry_tactics: Vec<LabelRef>,
    tags: Vec<LabelRef>,
    mistakes: Vec<LabelRef>,
    initial_stop: Option<Decimal>,
    /// Dollars at risk; overrides the initial stop for R.
    planned_risk: Option<Decimal>,
    version: i32,
    updated_at: DateTime<Utc>,
    orphaned: bool,
}

impl From<read::AnnotationRow> for TradeAnnotation {
    fn from(row: read::AnnotationRow) -> Self {
        Self {
            id: ID(row.id.to_string()),
            trade_id: row.trade_id,
            notes: Json(row.notes.0),
            edges: row.edges.0,
            entry_tactics: row.entry_tactics.0,
            tags: row.tags.0,
            mistakes: row.mistakes.0,
            initial_stop: row.initial_stop,
            planned_risk: row.planned_risk,
            version: row.record_version,
            updated_at: row.updated_at,
            orphaned: row.orphaned_at.is_some(),
        }
    }
}

#[derive(SimpleObject, Clone)]
pub struct TradeSummary {
    id: ID,
    kind: String,
    workspace_id: ID,
    parent_id: Option<String>,
    children: Vec<String>,
    instrument_key: String,
    asset_class: String,
    symbol: String,
    underlying: String,
    option: Option<OptionDetail>,
    direction: Option<String>,
    status: String,
    opened_at: DateTime<Utc>,
    closed_at: Option<DateTime<Utc>>,
    max_quantity: Decimal,
    open_quantity: Decimal,
    avg_entry: Option<Decimal>,
    avg_exit: Option<Decimal>,
    gross: Decimal,
    fees: Decimal,
    /// Realised so far for an open trade; null when history is missing.
    net: Option<Decimal>,
    income: Decimal,
    return_pct: Option<Decimal>,
    holding_seconds: Option<i64>,
    fill_count: i32,
    non_economic: bool,
    related: Vec<String>,
    strategy_label: Option<String>,
    issues: Vec<TradeIssue>,
    annotation: Option<TradeAnnotation>,
    r_multiple: Option<Decimal>,
    /// The latest holdings price, for open trades.
    mark: Option<Decimal>,
    unrealized: Option<Decimal>,
}

fn summary(row: TradeRow, unrealized: &HashMap<String, (Decimal, Decimal)>) -> TradeSummary {
    let annotation = row.annotation_id.map(|id| TradeAnnotation {
        id: ID(id.to_string()),
        trade_id: row.id.clone(),
        notes: Json(
            row.notes
                .as_ref()
                .map(|notes| notes.0.clone())
                .unwrap_or_else(|| NoteDocument::default().0),
        ),
        edges: row.edges.0.clone(),
        entry_tactics: row.entry_tactics.0.clone(),
        tags: row.tags.0.clone(),
        mistakes: row.mistakes.0.clone(),
        initial_stop: row.initial_stop,
        planned_risk: row.planned_risk,
        version: row.annotation_version.unwrap_or(1),
        updated_at: row.annotation_updated_at.unwrap_or(row.opened_at),
        orphaned: false,
    });
    let mark = unrealized.get(&row.id);
    TradeSummary {
        r_multiple: row.r_multiple(),
        id: ID(row.id.clone()),
        kind: row.kind,
        workspace_id: ID(row.workspace_id.to_string()),
        parent_id: row.parent_id,
        children: row.children,
        instrument_key: row.instrument_key,
        asset_class: row.asset_class,
        symbol: row.symbol,
        underlying: row.underlying,
        option: option_detail(&row.instrument),
        direction: row.direction,
        status: row.status,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        max_quantity: row.max_quantity.normalize(),
        open_quantity: row.open_quantity.normalize(),
        avg_entry: row.avg_entry.map(|v| v.round_dp(6).normalize()),
        avg_exit: row.avg_exit.map(|v| v.round_dp(6).normalize()),
        gross: money(row.gross),
        fees: money(row.fees),
        net: row.net.map(money),
        income: money(row.income),
        return_pct: row.return_pct.map(money),
        holding_seconds: row.holding_seconds,
        fill_count: row.fill_count,
        non_economic: row.non_economic,
        related: row.related,
        strategy_label: row.strategy_label,
        issues: issues(&row.issues),
        annotation,
        mark: mark.map(|m| m.0),
        unrealized: mark.map(|m| money(m.1)),
    }
}

/// (mark, unrealised) for each open trade in a workspace that has a mark.
async fn unrealized(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
) -> Result<HashMap<String, (Decimal, Decimal)>> {
    let marks = read::marks(pool, user_id, workspace_id)
        .await
        .map_err(to_graphql)?;
    if marks.is_empty() {
        return Ok(HashMap::new());
    }
    let lots: Vec<(String, String, String, Decimal, Decimal, sqlx::types::Json<Instrument>)> = sqlx::query_as(
        "SELECT l.trade_id, l.instrument_key, l.direction, l.quantity, l.cost_per_unit, t.instrument
         FROM trade_lots l JOIN trades t ON t.user_id = l.user_id AND t.id = l.trade_id
         WHERE l.user_id = $1 AND l.workspace_id = $2 AND l.quantity > 0",
    )
    .bind(user_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await
    .map_err(|e| to_graphql(e.into()))?;
    let mut out: HashMap<String, (Decimal, Decimal)> = HashMap::new();
    for (trade_id, key, direction, quantity, cost, instrument) in lots {
        let Some(mark) = marks.get(&key) else {
            continue;
        };
        let sign = if direction == "short" {
            Decimal::NEGATIVE_ONE
        } else {
            Decimal::ONE
        };
        let entry = out.entry(trade_id).or_insert((*mark, Decimal::ZERO));
        entry.1 += (*mark - cost) * quantity * instrument.multiplier * sign;
    }
    Ok(out)
}

#[derive(SimpleObject)]
pub struct TradePage {
    total: i64,
    items: Vec<TradeSummary>,
}

#[derive(SimpleObject)]
pub struct TradeFillView {
    key: String,
    role: String,
    executed_at: DateTime<Utc>,
    quantity: Decimal,
    price: Decimal,
    fee: Decimal,
    derived: bool,
    manual: bool,
}

#[derive(SimpleObject)]
pub struct LotClosureView {
    closed_by: String,
    closed_at: DateTime<Utc>,
    quantity: Decimal,
    exit_price: Decimal,
    fee: Decimal,
    gross: Decimal,
    kind: String,
    non_economic: bool,
    tax_proceeds: Option<Decimal>,
    tax_cost: Option<Decimal>,
    tax_realized: Option<Decimal>,
    wash_disallowed: Option<Decimal>,
    wash_permanent: Option<bool>,
    term: Option<String>,
}

#[derive(SimpleObject)]
pub struct TradeLotView {
    id: String,
    direction: String,
    opened_by: String,
    acquired_at: DateTime<Utc>,
    holding_from: DateTime<Utc>,
    original_quantity: Decimal,
    quantity: Decimal,
    cost_per_unit: Decimal,
    tax_cost_adjustment: Decimal,
    wash_basis_adjustment: Decimal,
    cost_known: bool,
    closures: Vec<LotClosureView>,
}

#[derive(SimpleObject)]
pub struct SuggestedStopView {
    price: Decimal,
    order_type: String,
    placed_at: DateTime<Utc>,
    status: Option<String>,
}

#[derive(SimpleObject)]
pub struct TradeDetail {
    trade: TradeSummary,
    /// The first protective stop order placed while the trade was open, when
    /// the journal has no initial stop yet.
    suggested_stop: Option<SuggestedStopView>,
    fills: Vec<TradeFillView>,
    lots: Vec<TradeLotView>,
    legs: Vec<TradeSummary>,
    parent: Option<TradeSummary>,
    related: Vec<TradeSummary>,
}

#[derive(SimpleObject)]
pub struct AliasSuggestionView {
    from_key: String,
    to_key: String,
    from_symbol: String,
    to_symbol: String,
    effective_at: DateTime<Utc>,
    reason: String,
}

#[derive(SimpleObject)]
pub struct StrategySuggestionView {
    underlying: String,
    trades: Vec<TradeSummary>,
}

#[derive(SimpleObject)]
pub struct DecisionView {
    id: ID,
    kind: String,
    created_at: DateTime<Utc>,
    status: String,
    code: Option<String>,
    trade_ids: Vec<String>,
}

#[derive(SimpleObject)]
pub struct OpeningPositionView {
    id: ID,
    symbol: String,
    instrument_key: String,
    option: Option<OptionDetail>,
    quantity: Decimal,
    cost_per_unit: Decimal,
    acquired_at: DateTime<Utc>,
    as_of: DateTime<Utc>,
}

#[derive(SimpleObject)]
pub struct IncomeView {
    symbol: String,
    at: DateTime<Utc>,
    amount: Decimal,
}

#[derive(SimpleObject)]
pub struct AliasView {
    from_key: String,
    to_key: String,
    effective_at: DateTime<Utc>,
}

#[derive(SimpleObject)]
pub struct TradeAttention {
    rebuilt_at: Option<DateTime<Utc>>,
    issues: Vec<TradeIssue>,
    alias_suggestions: Vec<AliasSuggestionView>,
    strategy_suggestions: Vec<StrategySuggestionView>,
    decisions: Vec<DecisionView>,
    orphaned_annotations: Vec<TradeAnnotation>,
    opening_positions: Vec<OpeningPositionView>,
    unattributed_income: Vec<IncomeView>,
    aliases: Vec<AliasView>,
}

#[derive(SimpleObject)]
pub struct ManualFillView {
    id: ID,
    symbol: String,
    asset_class: String,
    option: Option<OptionDetail>,
    side: String,
    quantity: Decimal,
    price: Decimal,
    fee: Decimal,
    intent: Option<String>,
    executed_at: DateTime<Utc>,
    note: String,
    version: i32,
}

#[derive(SimpleObject, Default)]
pub struct TaxTotals {
    proceeds: Decimal,
    cost: Decimal,
    wash_disallowed: Decimal,
    /// Proceeds minus cost, with disallowed losses added back.
    gain: Decimal,
}

impl TaxTotals {
    fn rounded(self) -> Self {
        Self {
            proceeds: money(self.proceeds),
            cost: money(self.cost),
            wash_disallowed: money(self.wash_disallowed),
            gain: money(self.gain),
        }
    }

    fn add(&mut self, row: &TaxRow) {
        self.proceeds += row.proceeds;
        self.cost += row.cost;
        self.wash_disallowed += row.wash_disallowed;
        self.gain += row.gain;
    }
}

#[derive(SimpleObject, Clone)]
pub struct TaxRow {
    symbol: String,
    workspace_id: ID,
    trade_id: String,
    direction: String,
    quantity: Decimal,
    acquired_at: DateTime<Utc>,
    sold_at: DateTime<Utc>,
    proceeds: Decimal,
    cost: Decimal,
    wash_disallowed: Decimal,
    wash_permanent: bool,
    gain: Decimal,
    term: String,
    /// "W" when part of the loss was washed, as on Form 8949.
    code: Option<String>,
}

#[derive(SimpleObject)]
pub struct TaxReport {
    year: i32,
    years: Vec<i32>,
    short_term: TaxTotals,
    long_term: TaxTotals,
    total: TaxTotals,
    rows: Vec<TaxRow>,
}

#[derive(SimpleObject)]
pub struct DecisionPreview {
    status: String,
    code: Option<String>,
    trades: Vec<PreviewTrade>,
}

#[derive(SimpleObject)]
pub struct PreviewTrade {
    id: String,
    kind: String,
    symbol: String,
    direction: Option<String>,
    status: String,
    opened_at: DateTime<Utc>,
    closed_at: Option<DateTime<Utc>>,
    fill_count: i32,
    net: Option<Decimal>,
}

#[derive(SimpleObject)]
pub struct DecisionResult {
    decision_id: ID,
    trade_ids: Vec<String>,
}

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum AssetClassInput {
    Stock,
    Option,
    Crypto,
}

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum OptionRightInput {
    Call,
    Put,
}

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum SideInput {
    Buy,
    Sell,
}

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum IntentInput {
    Open,
    Close,
}

#[derive(Enum, Copy, Clone, Eq, PartialEq, Default)]
pub enum TradeSort {
    #[default]
    OpenedDesc,
    OpenedAsc,
    NetDesc,
    NetAsc,
}

#[derive(InputObject)]
pub struct InstrumentInputObject {
    asset_class: AssetClassInput,
    /// The ticker, or the underlying for an option.
    symbol: String,
    expiry: Option<NaiveDate>,
    right: Option<OptionRightInput>,
    strike: Option<Decimal>,
    #[graphql(default = false)]
    mini: bool,
}

impl From<&InstrumentInputObject> for InstrumentInput {
    fn from(input: &InstrumentInputObject) -> Self {
        Self {
            asset_class: match input.asset_class {
                AssetClassInput::Stock => AssetClass::Stock,
                AssetClassInput::Option => AssetClass::Option,
                AssetClassInput::Crypto => AssetClass::Crypto,
            },
            symbol: input.symbol.clone(),
            expiry: input.expiry,
            right: input.right.map(|r| match r {
                OptionRightInput::Call => OptionRight::Call,
                OptionRightInput::Put => OptionRight::Put,
            }),
            strike: input.strike,
            mini: input.mini,
        }
    }
}

#[derive(InputObject)]
pub struct ManualFillInputObject {
    instrument: InstrumentInputObject,
    side: SideInput,
    quantity: Decimal,
    price: Decimal,
    #[graphql(default)]
    fee: Decimal,
    intent: Option<IntentInput>,
    executed_at: DateTime<Utc>,
    #[graphql(default)]
    note: String,
}

impl From<&ManualFillInputObject> for ManualFillInput {
    fn from(input: &ManualFillInputObject) -> Self {
        Self {
            instrument: (&input.instrument).into(),
            side: match input.side {
                SideInput::Buy => Side::Buy,
                SideInput::Sell => Side::Sell,
            },
            quantity: input.quantity,
            price: input.price,
            fee: input.fee,
            intent: input.intent.map(|i| match i {
                IntentInput::Open => Intent::Open,
                IntentInput::Close => Intent::Close,
            }),
            executed_at: input.executed_at,
            note: input.note.clone(),
        }
    }
}

#[derive(InputObject)]
pub struct OpeningPositionInput {
    instrument: InstrumentInputObject,
    /// Negative for a short.
    quantity: Decimal,
    cost_per_unit: Decimal,
    acquired_at: DateTime<Utc>,
    as_of: DateTime<Utc>,
}

#[derive(InputObject)]
pub struct TradeAnnotationInput {
    notes: Option<Json<serde_json::Value>>,
    #[graphql(default)]
    edge_ids: Vec<ID>,
    #[graphql(default)]
    entry_tactic_ids: Vec<ID>,
    #[graphql(default)]
    tag_ids: Vec<ID>,
    #[graphql(default)]
    mistake_ids: Vec<ID>,
    initial_stop: Option<Decimal>,
    /// Dollars at risk; overrides the initial stop for R.
    planned_risk: Option<Decimal>,
}

#[derive(InputObject, Default)]
pub struct TradeFilterInput {
    status: Option<String>,
    direction: Option<String>,
    symbol: Option<String>,
    edge_id: Option<ID>,
    entry_tactic_id: Option<ID>,
    tag_id: Option<ID>,
    mistake_id: Option<ID>,
    from: Option<DateTime<Utc>>,
    to: Option<DateTime<Utc>>,
    /// Trades closed at or after this instant.
    closed_from: Option<DateTime<Utc>>,
    /// Trades closed before this instant.
    closed_to: Option<DateTime<Utc>>,
}

#[derive(InputObject)]
pub struct TradeDecisionInput {
    /// `merge`, `split` or `combine_legs`.
    kind: String,
    #[graphql(default)]
    trade_ids: Vec<String>,
    trade_id: Option<String>,
    at_fill: Option<String>,
    label: Option<String>,
}

fn decision_kind(input: &TradeDecisionInput) -> Result<DecisionKind> {
    match input.kind.as_str() {
        "merge" => Ok(DecisionKind::Merge {
            trade_ids: input.trade_ids.clone(),
        }),
        "split" => match (&input.trade_id, &input.at_fill) {
            (Some(trade_id), Some(at_fill)) => Ok(DecisionKind::Split {
                trade_id: trade_id.clone(),
                at_fill: at_fill.clone(),
            }),
            _ => Err(coded(
                "A split needs a trade and a fill",
                "INVALID_DECISION",
            )),
        },
        "combine_legs" => Ok(DecisionKind::CombineLegs {
            trade_ids: input.trade_ids.clone(),
            label: input
                .label
                .clone()
                .map(|l| l.trim().to_owned())
                .filter(|l| !l.is_empty()),
        }),
        _ => Err(coded("Unknown decision", "INVALID_DECISION")),
    }
}

fn status_text(status: OutcomeStatus) -> String {
    match status {
        OutcomeStatus::Applied => "applied",
        OutcomeStatus::Stale => "stale",
        OutcomeStatus::Conflict => "conflict",
    }
    .into()
}

fn preview_trade(trade: &Trade, metrics: &HashMap<String, measure::Metrics>) -> PreviewTrade {
    let text = |v: serde_json::Value| v.as_str().unwrap_or_default().to_owned();
    PreviewTrade {
        id: trade.id.clone(),
        kind: text(serde_json::to_value(trade.kind).unwrap_or_default()),
        symbol: trade.instrument.symbol.clone(),
        direction: trade
            .direction
            .map(|d| text(serde_json::to_value(d).unwrap_or_default())),
        status: text(serde_json::to_value(trade.status).unwrap_or_default()),
        opened_at: trade.opened_at,
        closed_at: trade.closed_at,
        fill_count: metrics.get(&trade.id).map_or(0, |m| m.fill_count as i32),
        net: metrics.get(&trade.id).and_then(|m| m.net).map(money),
    }
}

#[derive(Default)]
pub struct TradeQuery;

#[Object]
impl TradeQuery {
    async fn trades(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        #[graphql(default)] filter: TradeFilterInput,
        #[graphql(default)] sort: TradeSort,
        #[graphql(default = 0)] offset: i64,
        #[graphql(default = 50)] limit: i64,
    ) -> Result<TradePage> {
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let filter = Filter {
            status: filter.status,
            direction: filter.direction,
            symbol: filter.symbol,
            edge_id: filter.edge_id.as_ref().map(parse_id).transpose()?,
            entry_tactic_id: filter.entry_tactic_id.as_ref().map(parse_id).transpose()?,
            tag_id: filter.tag_id.as_ref().map(parse_id).transpose()?,
            mistake_id: filter.mistake_id.as_ref().map(parse_id).transpose()?,
            from: filter.from,
            to: filter.to,
            closed_from: filter.closed_from,
            closed_to: filter.closed_to,
        };
        let sort = match sort {
            TradeSort::OpenedDesc => Sort::OpenedDesc,
            TradeSort::OpenedAsc => Sort::OpenedAsc,
            TradeSort::NetDesc => Sort::NetDesc,
            TradeSort::NetAsc => Sort::NetAsc,
        };
        let (total, rows) = read::trades(
            &pool,
            user_id,
            workspace_id,
            &filter,
            sort,
            offset.max(0),
            limit.clamp(1, 200),
        )
        .await
        .map_err(to_graphql)?;
        let marks = unrealized(&pool, user_id, workspace_id).await?;
        Ok(TradePage {
            total,
            items: rows.into_iter().map(|r| summary(r, &marks)).collect(),
        })
    }

    async fn trade(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        id: ID,
    ) -> Result<Option<TradeDetail>> {
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let Some(row) = read::trade(&pool, user_id, workspace_id, &id)
            .await
            .map_err(to_graphql)?
        else {
            return Ok(None);
        };
        let marks = unrealized(&pool, user_id, workspace_id).await?;
        let suggested_stop = read::suggested_stop(&pool, user_id, &row)
            .await
            .map_err(to_graphql)?
            .map(|stop| SuggestedStopView {
                price: stop.price.normalize(),
                order_type: stop.order_type,
                placed_at: stop.placed_at,
                status: stop.status,
            });
        let fills = read::fills(&pool, user_id, &row.id)
            .await
            .map_err(to_graphql)?;
        let (lots, closures) = read::lots(&pool, user_id, &row.id)
            .await
            .map_err(to_graphql)?;
        let legs = read::trades_by_id(&pool, user_id, &row.children)
            .await
            .map_err(to_graphql)?;
        let related = read::trades_by_id(&pool, user_id, &row.related)
            .await
            .map_err(to_graphql)?;
        let parent = match &row.parent_id {
            Some(parent) => read::trades_by_id(&pool, user_id, std::slice::from_ref(parent))
                .await
                .map_err(to_graphql)?
                .into_iter()
                .next(),
            None => None,
        };
        let mut by_lot: HashMap<String, Vec<LotClosureView>> = HashMap::new();
        for c in closures {
            by_lot
                .entry(c.lot_id.clone())
                .or_default()
                .push(LotClosureView {
                    closed_by: c.closed_by,
                    closed_at: c.closed_at,
                    quantity: c.quantity.normalize(),
                    exit_price: c.exit_price.normalize(),
                    fee: money(c.fee),
                    gross: money(c.gross),
                    kind: c.kind,
                    non_economic: c.non_economic,
                    tax_proceeds: c.tax_proceeds.map(money),
                    tax_cost: c.tax_cost.map(money),
                    tax_realized: c.tax_realized.map(money),
                    wash_disallowed: c.wash_disallowed.map(money),
                    wash_permanent: c.wash_permanent,
                    term: c.term,
                });
        }
        Ok(Some(TradeDetail {
            suggested_stop,
            fills: fills
                .into_iter()
                .map(|f| TradeFillView {
                    manual: f.fill_key.starts_with("manual:"),
                    key: f.fill_key,
                    role: f.role,
                    executed_at: f.executed_at,
                    quantity: f.quantity.normalize(),
                    price: f.price.normalize(),
                    fee: money(f.fee),
                    derived: f.derived,
                })
                .collect(),
            lots: lots
                .into_iter()
                .map(|l| TradeLotView {
                    closures: by_lot.remove(&l.lot_id).unwrap_or_default(),
                    id: l.lot_id,
                    direction: l.direction,
                    opened_by: l.opened_by,
                    acquired_at: l.acquired_at,
                    holding_from: l.holding_from,
                    original_quantity: l.original_quantity.normalize(),
                    quantity: l.quantity.normalize(),
                    cost_per_unit: l.cost_per_unit.normalize(),
                    tax_cost_adjustment: l.tax_cost_adjustment.normalize(),
                    wash_basis_adjustment: money(l.wash_basis_adjustment),
                    cost_known: l.cost_known,
                })
                .collect(),
            legs: legs.into_iter().map(|r| summary(r, &marks)).collect(),
            related: related.into_iter().map(|r| summary(r, &marks)).collect(),
            parent: parent.map(|r| summary(r, &marks)),
            trade: summary(row, &marks),
        }))
    }

    async fn open_positions(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
    ) -> Result<Vec<TradeSummary>> {
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let rows = read::open_trades(&pool, user_id, workspace_id)
            .await
            .map_err(to_graphql)?;
        let marks = unrealized(&pool, user_id, workspace_id).await?;
        Ok(rows.into_iter().map(|r| summary(r, &marks)).collect())
    }

    /// Everything about a workspace's trades that needs the user: problems,
    /// suggestions, decisions and journal entries without a trade.
    async fn trade_attention(&self, ctx: &Context<'_>, workspace_id: ID) -> Result<TradeAttention> {
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let state = read::state(&pool, user_id).await.map_err(to_graphql)?;
        let in_workspace = |id: Option<Uuid>| id == Some(workspace_id);
        let symbol_of = |key: &str| key.split(':').nth(1).unwrap_or(key).to_owned();
        let aliases: Vec<suggest::AliasSuggestion> =
            serde_json::from_value::<Vec<serde_json::Value>>(state.alias_suggestions)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|v| {
                    Some(suggest::AliasSuggestion {
                        workspace_id: v.get("workspace_id")?.as_str()?.parse().ok()?,
                        from_key: v.get("from_key")?.as_str()?.to_owned(),
                        to_key: v.get("to_key")?.as_str()?.to_owned(),
                        effective_at: v.get("effective_at")?.as_str()?.parse().ok()?,
                        reason: v.get("reason")?.as_str()?.to_owned(),
                    })
                })
                .filter(|s| s.workspace_id == workspace_id)
                .collect();
        let strategies: Vec<(String, Vec<String>, Uuid)> =
            serde_json::from_value::<Vec<serde_json::Value>>(state.strategy_suggestions)
                .unwrap_or_default()
                .into_iter()
                .filter_map(|v| {
                    Some((
                        v.get("underlying")?.as_str()?.to_owned(),
                        serde_json::from_value(v.get("trade_ids")?.clone()).ok()?,
                        v.get("workspace_id")?.as_str()?.parse().ok()?,
                    ))
                })
                .filter(|(_, _, w)| *w == workspace_id)
                .collect();
        let marks = HashMap::new();
        let mut strategy_views = Vec::new();
        for (underlying, ids, _) in strategies {
            let trades = read::trades_by_id(&pool, user_id, &ids)
                .await
                .map_err(to_graphql)?;
            strategy_views.push(StrategySuggestionView {
                underlying,
                trades: trades.into_iter().map(|r| summary(r, &marks)).collect(),
            });
        }
        let outcomes: HashMap<Uuid, DecisionOutcome> =
            serde_json::from_value::<Vec<DecisionOutcome>>(state.decision_outcomes)
                .unwrap_or_default()
                .into_iter()
                .map(|o| (o.decision_id, o))
                .collect();
        let decisions = read::decisions(&pool, user_id, workspace_id)
            .await
            .map_err(to_graphql)?;
        let openings = read::openings(&pool, user_id, workspace_id)
            .await
            .map_err(to_graphql)?;
        let orphans = read::orphaned_annotations(&pool, user_id, workspace_id)
            .await
            .map_err(to_graphql)?;
        let confirmed = read::aliases(&pool, user_id).await.map_err(to_graphql)?;
        let income: Vec<serde_json::Value> =
            serde_json::from_value(state.unattributed_income).unwrap_or_default();
        Ok(TradeAttention {
            rebuilt_at: state.rebuilt_at,
            issues: issues(&state.issues)
                .into_iter()
                .filter(|i| in_workspace(i.workspace_id))
                .collect(),
            alias_suggestions: aliases
                .into_iter()
                .map(|s| AliasSuggestionView {
                    from_symbol: symbol_of(&s.from_key),
                    to_symbol: symbol_of(&s.to_key),
                    from_key: s.from_key,
                    to_key: s.to_key,
                    effective_at: s.effective_at,
                    reason: s.reason,
                })
                .collect(),
            strategy_suggestions: strategy_views,
            decisions: decisions
                .into_iter()
                .map(|d| {
                    let outcome = outcomes.get(&d.id);
                    DecisionView {
                        id: ID(d.id.to_string()),
                        kind: d
                            .payload
                            .get("kind")
                            .and_then(|k| k.as_str())
                            .unwrap_or_default()
                            .to_owned(),
                        created_at: d.created_at,
                        status: outcome.map_or("stale".into(), |o| status_text(o.status)),
                        code: outcome.and_then(|o| o.code.clone()),
                        trade_ids: outcome.map(|o| o.trade_ids.clone()).unwrap_or_default(),
                    }
                })
                .collect(),
            orphaned_annotations: orphans.into_iter().map(TradeAnnotation::from).collect(),
            opening_positions: openings
                .into_iter()
                .map(|o| OpeningPositionView {
                    id: ID(o.id.to_string()),
                    symbol: o.instrument.symbol.clone(),
                    instrument_key: o.instrument.key(),
                    option: option_detail(&o.instrument),
                    quantity: o.quantity.normalize(),
                    cost_per_unit: o.cost_per_unit.normalize(),
                    acquired_at: o.acquired_at,
                    as_of: o.as_of,
                })
                .collect(),
            unattributed_income: income
                .into_iter()
                .filter(|v| {
                    v.get("workspaceId").and_then(|w| w.as_str())
                        == Some(workspace_id.to_string().as_str())
                })
                .filter_map(|v| {
                    Some(IncomeView {
                        symbol: symbol_of(v.get("instrumentKey")?.as_str()?),
                        at: v.get("at")?.as_str()?.parse().ok()?,
                        amount: v.get("amount")?.as_str()?.parse().ok()?,
                    })
                })
                .collect(),
            aliases: confirmed
                .into_iter()
                .map(|a| AliasView {
                    from_key: a.from_key,
                    to_key: a.to_key,
                    effective_at: a.effective_at,
                })
                .collect(),
        })
    }

    /// Statistics over closed trades: one workspace, or all of them when
    /// `workspaceId` is null.
    async fn trade_stats(
        &self,
        ctx: &Context<'_>,
        workspace_id: Option<ID>,
        from: Option<DateTime<Utc>>,
        to: Option<DateTime<Utc>>,
    ) -> Result<Stats> {
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        let workspace = match workspace_id {
            Some(id) => {
                let id = parse_id(&id)?;
                service::owns_workspace(pool, user.id, id)
                    .await
                    .map_err(trade_error)?;
                Some(id)
            }
            None => None,
        };
        read::stats(pool, user.id, workspace, from, to)
            .await
            .map_err(to_graphql)
    }

    async fn manual_fills(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
    ) -> Result<Vec<ManualFillView>> {
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let rows = read::manual_fills(&pool, user_id, workspace_id)
            .await
            .map_err(to_graphql)?;
        Ok(rows
            .into_iter()
            .map(|r| ManualFillView {
                id: ID(r.id.to_string()),
                symbol: r
                    .instrument
                    .option
                    .as_ref()
                    .map_or(r.instrument.symbol.clone(), |o| o.underlying.clone()),
                asset_class: serde_json::to_value(r.instrument.asset_class)
                    .ok()
                    .and_then(|v| v.as_str().map(str::to_owned))
                    .unwrap_or_default(),
                option: option_detail(&r.instrument),
                side: r.side,
                quantity: r.quantity.normalize(),
                price: r.price.normalize(),
                fee: r.fee.normalize(),
                intent: r.intent,
                executed_at: r.executed_at,
                note: r.note,
                version: r.record_version,
            })
            .collect())
    }

    /// Realised gains for a calendar year across every taxable workspace.
    /// An estimate, not tax advice.
    async fn tax_report(&self, ctx: &Context<'_>, year: Option<i32>) -> Result<TaxReport> {
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        let years = read::tax_years(pool, user.id).await.map_err(to_graphql)?;
        let year = year.or_else(|| years.first().copied()).unwrap_or_else(|| {
            use chrono::Datelike;
            Utc::now().year()
        });
        let closures = read::tax_closures(pool, user.id, year)
            .await
            .map_err(to_graphql)?;
        let mut report = TaxReport {
            year,
            years,
            short_term: TaxTotals::default(),
            long_term: TaxTotals::default(),
            total: TaxTotals::default(),
            rows: Vec::new(),
        };
        for c in closures {
            let (Some(proceeds), Some(cost), Some(realized)) =
                (c.tax_proceeds, c.tax_cost, c.tax_realized)
            else {
                continue;
            };
            let wash = c.wash_disallowed.unwrap_or_default();
            let row = TaxRow {
                symbol: c.symbol,
                workspace_id: ID(c.workspace_id.to_string()),
                trade_id: c.trade_id,
                direction: c.direction,
                quantity: c.quantity.normalize(),
                acquired_at: c.acquired_at,
                sold_at: c.closed_at,
                proceeds: money(proceeds),
                cost: money(cost),
                wash_disallowed: money(wash),
                wash_permanent: c.wash_permanent.unwrap_or(false),
                gain: money(realized + wash),
                term: c.term.unwrap_or_else(|| "short".into()),
                code: (!wash.is_zero()).then(|| "W".into()),
            };
            if row.term == "long" {
                report.long_term.add(&row);
            } else {
                report.short_term.add(&row);
            }
            report.total.add(&row);
            report.rows.push(row);
        }
        report.short_term = report.short_term.rounded();
        report.long_term = report.long_term.rounded();
        report.total = report.total.rounded();
        Ok(report)
    }
}

#[derive(Default)]
pub struct TradeMutation;

#[Object]
impl TradeMutation {
    async fn add_manual_fill(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        input: ManualFillInputObject,
    ) -> Result<ID> {
        require_web_session(ctx)?;
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        service::add_manual_fill(&pool, user_id, workspace_id, &(&input).into())
            .await
            .map(|id| ID(id.to_string()))
            .map_err(trade_error)
    }

    async fn update_manual_fill(
        &self,
        ctx: &Context<'_>,
        id: ID,
        expected_version: i32,
        input: ManualFillInputObject,
    ) -> Result<bool> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        service::update_manual_fill(
            pool,
            user.id,
            parse_id(&id)?,
            expected_version,
            &(&input).into(),
        )
        .await
        .map_err(trade_error)?;
        Ok(true)
    }

    async fn delete_manual_fill(&self, ctx: &Context<'_>, id: ID) -> Result<bool> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        service::delete_manual_fill(pool, user.id, parse_id(&id)?)
            .await
            .map_err(trade_error)?;
        Ok(true)
    }

    async fn set_opening_position(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        input: OpeningPositionInput,
    ) -> Result<ID> {
        require_web_session(ctx)?;
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let opening = OpeningInput {
            instrument: (&input.instrument).into(),
            quantity: input.quantity,
            cost_per_unit: input.cost_per_unit,
            acquired_at: input.acquired_at,
            as_of: input.as_of,
        };
        service::set_opening_position(&pool, user_id, workspace_id, &opening)
            .await
            .map(|id| ID(id.to_string()))
            .map_err(trade_error)
    }

    async fn delete_opening_position(&self, ctx: &Context<'_>, id: ID) -> Result<bool> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        service::delete_opening_position(pool, user.id, parse_id(&id)?)
            .await
            .map_err(trade_error)?;
        Ok(true)
    }

    /// Accepts a ticker-change suggestion, or records one the user knows of.
    async fn confirm_alias(
        &self,
        ctx: &Context<'_>,
        from_key: String,
        to_key: String,
        effective_at: DateTime<Utc>,
    ) -> Result<bool> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        service::set_alias(pool, user.id, &from_key, &to_key, effective_at, true)
            .await
            .map_err(trade_error)?;
        Ok(true)
    }

    async fn reject_alias(
        &self,
        ctx: &Context<'_>,
        from_key: String,
        to_key: String,
    ) -> Result<bool> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        service::set_alias(pool, user.id, &from_key, &to_key, Utc::now(), false)
            .await
            .map_err(trade_error)?;
        Ok(true)
    }

    async fn remove_alias(
        &self,
        ctx: &Context<'_>,
        from_key: String,
        to_key: String,
    ) -> Result<bool> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        service::remove_alias(pool, user.id, &from_key, &to_key)
            .await
            .map_err(trade_error)?;
        Ok(true)
    }

    /// What a merge, split or strategy would produce; nothing is saved.
    async fn preview_trade_decision(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        decision: TradeDecisionInput,
    ) -> Result<DecisionPreview> {
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let preview =
            service::preview_decision(&pool, user_id, workspace_id, &decision_kind(&decision)?)
                .await
                .map_err(trade_error)?;
        let metrics = measure::all(&preview.trades);
        Ok(DecisionPreview {
            status: status_text(preview.outcome.status),
            code: preview.outcome.code,
            trades: preview
                .trades
                .iter()
                .map(|t| preview_trade(t, &metrics))
                .collect(),
        })
    }

    async fn apply_trade_decision(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        decision: TradeDecisionInput,
    ) -> Result<DecisionResult> {
        require_web_session(ctx)?;
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let (id, trade_ids) =
            service::decide(&pool, user_id, workspace_id, &decision_kind(&decision)?)
                .await
                .map_err(trade_error)?;
        Ok(DecisionResult {
            decision_id: ID(id.to_string()),
            trade_ids,
        })
    }

    async fn undo_trade_decision(&self, ctx: &Context<'_>, id: ID) -> Result<bool> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        service::undo_decision(pool, user.id, parse_id(&id)?)
            .await
            .map_err(trade_error)?;
        Ok(true)
    }

    /// Creates the journal entry on a trade (no `expectedVersion`) or updates
    /// it (the version last read).
    async fn save_trade_annotation(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        trade_id: ID,
        expected_version: Option<i32>,
        input: TradeAnnotationInput,
    ) -> Result<TradeAnnotation> {
        require_web_session(ctx)?;
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let ids = |ids: &[ID]| ids.iter().map(parse_id).collect::<Result<Vec<_>>>();
        let annotation = AnnotationInput {
            notes: input
                .notes
                .map(|notes| NoteDocument(notes.0))
                .unwrap_or_default(),
            edge_ids: ids(&input.edge_ids)?,
            entry_tactic_ids: ids(&input.entry_tactic_ids)?,
            tag_ids: ids(&input.tag_ids)?,
            mistake_ids: ids(&input.mistake_ids)?,
            initial_stop: input.initial_stop,
            planned_risk: input.planned_risk,
        };
        let id = service::save_annotation(
            &pool,
            user_id,
            workspace_id,
            &trade_id,
            expected_version,
            &annotation,
        )
        .await
        .map_err(trade_error)?;
        read::annotation(&pool, user_id, id)
            .await
            .map_err(to_graphql)?
            .map(TradeAnnotation::from)
            .ok_or_else(|| coded("Not found", "NOT_FOUND"))
    }

    async fn reassign_trade_annotation(
        &self,
        ctx: &Context<'_>,
        id: ID,
        trade_id: ID,
    ) -> Result<bool> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        service::reassign_annotation(pool, user.id, parse_id(&id)?, &trade_id)
            .await
            .map_err(trade_error)?;
        Ok(true)
    }

    async fn delete_trade_annotation(&self, ctx: &Context<'_>, id: ID) -> Result<bool> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        service::delete_annotation(pool, user.id, parse_id(&id)?)
            .await
            .map_err(trade_error)?;
        Ok(true)
    }
}
