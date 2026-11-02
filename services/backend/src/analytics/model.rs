use async_graphql::{ID, SimpleObject};
use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::Serialize;

use crate::trades::{behavior::TradeBehavior, labels::LabelRef};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Outcome {
    Win,
    Loss,
    #[default]
    Even,
}

/// One closed trade, as statistics see it.
#[derive(Clone, Debug)]
pub struct StatTrade {
    pub symbol: String,
    pub direction: Option<String>,
    pub opened_at: DateTime<Utc>,
    pub closed_at: DateTime<Utc>,
    pub net: Decimal,
    /// Net over what the entries cost, in percent; None without a known cost.
    pub return_pct: Option<Decimal>,
    /// What the entries cost; zero when unknown.
    pub entry_cost: Decimal,
    pub holding_seconds: i64,
    pub r: Option<Decimal>,
    pub edges: Vec<LabelRef>,
    pub entry_tactics: Vec<LabelRef>,
    pub tags: Vec<LabelRef>,
    pub mistakes: Vec<LabelRef>,
    pub behavior: TradeBehavior,
    /// Carried out from a trade plan.
    pub planned: bool,
    /// Set by `compute_with` from the breakeven band.
    pub outcome: Outcome,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, SimpleObject)]
pub struct Bucket {
    pub key: String,
    /// Set for label breakdowns; null for their "None" bucket and for the rest.
    pub label_id: Option<ID>,
    pub color: Option<String>,
    pub trades: usize,
    pub wins: usize,
    pub losses: usize,
    pub net: Decimal,
    pub win_rate: Option<Decimal>,
    pub expectancy: Option<Decimal>,
    pub expectancy_r: Option<Decimal>,
}

/// Results for one edge and entry tactic pair; null means "None". A trade
/// counts in every pair its edges and tactics make.
#[derive(Clone, Debug, PartialEq, Serialize, SimpleObject)]
pub struct EdgeTacticCell {
    pub edge: Option<LabelRef>,
    pub entry_tactic: Option<LabelRef>,
    pub trades: usize,
    pub wins: usize,
    pub losses: usize,
    pub net: Decimal,
    pub win_rate: Option<Decimal>,
    pub expectancy: Option<Decimal>,
}

/// What a mistake costs: results of trades with it, against every other
/// trade in the same filter.
#[derive(Clone, Debug, PartialEq, Serialize, SimpleObject)]
pub struct MistakeCost {
    pub mistake: LabelRef,
    pub trades: usize,
    pub net: Decimal,
    pub expectancy_with: Option<Decimal>,
    pub expectancy_without: Option<Decimal>,
}

#[derive(Clone, Debug, PartialEq, Serialize, SimpleObject)]
pub struct EquityPoint {
    pub day: NaiveDate,
    pub net: Decimal,
    pub cumulative: Decimal,
    /// Trades closed that day.
    pub trades: usize,
    pub wins: usize,
    pub losses: usize,
}

/// Trading days grouped by how many trades closed on them.
#[derive(Clone, Debug, PartialEq, Serialize, SimpleObject)]
pub struct DayLoad {
    pub key: String,
    pub days: usize,
    pub trades: usize,
    pub net: Decimal,
    /// Net per trading day.
    pub average_day: Option<Decimal>,
    pub win_rate: Option<Decimal>,
}

/// Results by what the trader recorded about their behavior. Trades without
/// a field recorded are left out of that field's breakdown.
#[derive(Clone, Debug, Default, PartialEq, Serialize, SimpleObject)]
pub struct BehaviorStats {
    /// Trades with at least one behavior field recorded.
    pub recorded: usize,
    pub average_conviction: Option<Decimal>,
    pub average_rule_adherence: Option<Decimal>,
    /// "1/5" to "5/5".
    pub by_conviction: Vec<Bucket>,
    pub by_market_regime: Vec<Bucket>,
    pub by_planned: Vec<Bucket>,
    pub by_revenge: Vec<Bucket>,
    pub by_thirty_minute_rule: Vec<Bucket>,
    /// "1/5" to "5/5".
    pub by_rule_adherence: Vec<Bucket>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, SimpleObject)]
pub struct PlanStats {
    /// Closed trades linked to a plan.
    pub from_plan: usize,
    /// Plans made in the window that were skipped.
    pub skipped: usize,
    /// Trades from a plan against trades with none.
    pub by_plan: Vec<Bucket>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, SimpleObject)]
pub struct Stats {
    pub trades: usize,
    pub wins: usize,
    pub losses: usize,
    pub breakeven: usize,
    /// Wins over wins plus losses; breakeven trades are left out.
    pub win_rate: Option<Decimal>,
    pub net: Decimal,
    pub gross_profit: Decimal,
    pub gross_loss: Decimal,
    pub average_win: Option<Decimal>,
    pub average_loss: Option<Decimal>,
    /// Mean return of winning trades, in percent; each trade counts equally.
    pub average_win_pct: Option<Decimal>,
    /// Mean return of losing trades, in percent (negative).
    pub average_loss_pct: Option<Decimal>,
    pub largest_win: Option<Decimal>,
    pub largest_loss: Option<Decimal>,
    pub profit_factor: Option<Decimal>,
    pub expectancy: Option<Decimal>,
    pub expectancy_r: Option<Decimal>,
    pub r_trades: usize,
    /// System quality number: √n × mean R ÷ standard deviation of R.
    pub sqn: Option<Decimal>,
    /// Net P&L over the largest drawdown.
    pub recovery_factor: Option<Decimal>,
    pub average_hold_seconds: Option<i64>,
    pub average_win_hold_seconds: Option<i64>,
    pub average_loss_hold_seconds: Option<i64>,
    pub max_drawdown: Decimal,
    pub current_drawdown: Decimal,
    pub longest_win_streak: usize,
    pub longest_loss_streak: usize,
    /// Positive for wins in a row, negative for losses.
    pub current_streak: i64,
    pub equity: Vec<EquityPoint>,
    pub by_symbol: Vec<Bucket>,
    pub by_direction: Vec<Bucket>,
    /// Monday first, by the New York day each trade opened.
    pub by_weekday: Vec<Bucket>,
    /// By the New York hour each trade opened.
    pub by_hour: Vec<Bucket>,
    /// By the New York session each trade opened in.
    pub by_session: Vec<Bucket>,
    /// By the New York month each trade closed, oldest first.
    pub by_month: Vec<Bucket>,
    pub by_hold: Vec<Bucket>,
    /// By what the entries cost.
    pub by_size: Vec<Bucket>,
    /// Trades with a risk, by R-multiple; every range is listed, empty or not.
    pub r_distribution: Vec<Bucket>,
    pub by_edge: Vec<Bucket>,
    pub by_entry_tactic: Vec<Bucket>,
    pub by_tag: Vec<Bucket>,
    pub by_mistake: Vec<Bucket>,
    pub edge_tactic: Vec<EdgeTacticCell>,
    pub mistake_costs: Vec<MistakeCost>,
    /// Trades without a mistake against trades with one.
    pub by_discipline: Vec<Bucket>,
    /// By how the previous trade that day ended, before this one opened.
    pub by_previous_trade: Vec<Bucket>,
    pub trades_per_day: Vec<DayLoad>,
    pub behavior: BehaviorStats,
    pub plans: PlanStats,
    /// Closed trades with no edge.
    pub untagged: usize,
}
