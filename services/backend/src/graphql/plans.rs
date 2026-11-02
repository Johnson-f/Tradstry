use async_graphql::{Context, ID, InputObject, Object, Result, SimpleObject};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use sqlx::PgPool;

use super::{
    brokerage::require_web_session,
    trades::{context, trade_error},
    user::current_user,
    workspaces::parse_id,
};
use crate::trades::plans::{
    self, BalanceSource, PlanAssetClass, PlanDirection, PlanInput, PlanRow, PlanStatus,
    PlanningRule as Rule, RuleInput, Tranche,
};

/// One planned entry and the size its share of the risk buys.
#[derive(SimpleObject)]
pub struct TradePlanTranche {
    /// Percent of the plan's risk.
    percent: Decimal,
    entry: Decimal,
    quantity: Decimal,
    /// What this entry loses at the stop.
    risk: Decimal,
}

#[derive(SimpleObject)]
pub struct TradePlan {
    id: ID,
    workspace_id: ID,
    asset_class: PlanAssetClass,
    /// The ticker; the underlying for an option.
    symbol: String,
    direction: PlanDirection,
    /// The size-weighted average entry.
    entry: Decimal,
    stop: Decimal,
    target: Option<Decimal>,
    /// Dollars the trader chose to risk.
    risk: Decimal,
    /// Shares, contracts or coins across every entry.
    quantity: Decimal,
    /// The entries the risk is split across, in order.
    tranches: Vec<TradePlanTranche>,
    /// Sizes were rounded up, so the plan can risk a little more than `risk`.
    round_up: bool,
    /// What the sizes actually risk at the stop.
    actual_risk: Option<Decimal>,
    /// What the position costs at its entries.
    cost: Option<Decimal>,
    note: String,
    status: PlanStatus,
    /// The trade this plan was carried out by, once linked.
    trade_id: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

impl From<PlanRow> for TradePlan {
    fn from(row: PlanRow) -> Self {
        let sizing = row.sizing();
        Self {
            id: ID(row.id.to_string()),
            workspace_id: ID(row.workspace_id.to_string()),
            asset_class: row.asset_class(),
            direction: row.direction(),
            status: row.status(),
            tranches: sizing
                .as_ref()
                .map(|s| {
                    s.tranches
                        .iter()
                        .map(|t| TradePlanTranche {
                            percent: t.percent,
                            entry: t.entry,
                            quantity: t.quantity,
                            risk: t.risk,
                        })
                        .collect()
                })
                .unwrap_or_default(),
            actual_risk: sizing.as_ref().map(|s| s.actual_risk),
            cost: sizing.as_ref().map(|s| s.cost),
            symbol: row.symbol,
            entry: row.entry,
            stop: row.stop,
            target: row.target,
            risk: row.risk,
            quantity: row.quantity,
            round_up: row.round_up,
            note: row.note,
            trade_id: row.trade_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(InputObject)]
pub struct TradePlanTrancheInput {
    /// Percent of the plan's risk; a plan's entries add up to 100.
    percent: Decimal,
    entry: Decimal,
}

#[derive(InputObject)]
pub struct TradePlanInput {
    asset_class: PlanAssetClass,
    symbol: String,
    direction: PlanDirection,
    /// One to ten entries whose percents add up to 100.
    tranches: Vec<TradePlanTrancheInput>,
    stop: Decimal,
    target: Option<Decimal>,
    risk: Decimal,
    #[graphql(default)]
    round_up: bool,
    #[graphql(default)]
    note: String,
}

impl From<TradePlanInput> for PlanInput {
    fn from(input: TradePlanInput) -> Self {
        Self {
            asset_class: input.asset_class,
            symbol: input.symbol,
            direction: input.direction,
            tranches: input
                .tranches
                .into_iter()
                .map(|t| Tranche {
                    percent: t.percent,
                    entry: t.entry,
                })
                .collect(),
            stop: input.stop,
            target: input.target,
            risk: input.risk,
            round_up: input.round_up,
            note: input.note,
        }
    }
}

#[derive(SimpleObject)]
pub struct PlanningRule {
    /// What percent risk is sized from: the brokerage snapshot when there is one, else the typed balance.
    balance: Option<Decimal>,
    source: Option<BalanceSource>,
    /// When the brokerage reported the balance.
    as_of: Option<DateTime<Utc>>,
    /// Linked to a brokerage, whose balance wins over a typed one.
    linked: bool,
    manual_balance: Option<Decimal>,
    /// Percent of the balance risked per trade.
    risk_percent: Option<Decimal>,
    /// The widest stop, as a percent of the entry, before the calculator warns.
    max_stop_percent: Option<Decimal>,
}

impl From<Rule> for PlanningRule {
    fn from(rule: Rule) -> Self {
        Self {
            balance: rule.balance,
            source: rule.source,
            as_of: rule.as_of,
            linked: rule.linked,
            manual_balance: rule.manual_balance,
            risk_percent: rule.risk_percent,
            max_stop_percent: rule.max_stop_percent,
        }
    }
}

#[derive(InputObject)]
pub struct PlanningRuleInput {
    manual_balance: Option<Decimal>,
    risk_percent: Option<Decimal>,
    max_stop_percent: Option<Decimal>,
}

async fn plan_context(ctx: &Context<'_>, id: &ID) -> Result<(PgPool, uuid::Uuid, uuid::Uuid)> {
    require_web_session(ctx)?;
    let pool = ctx.data::<PgPool>()?.clone();
    let user = current_user(ctx).await?;
    Ok((pool, user.id, parse_id(id)?))
}

#[derive(Default)]
pub struct PlanQuery;

#[Object]
impl PlanQuery {
    /// The workspace's plans, newest first.
    async fn trade_plans(&self, ctx: &Context<'_>, workspace_id: ID) -> Result<Vec<TradePlan>> {
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let rows = plans::list(&pool, user_id, workspace_id)
            .await
            .map_err(trade_error)?;
        Ok(rows.into_iter().map(TradePlan::from).collect())
    }

    async fn planning_rule(&self, ctx: &Context<'_>, workspace_id: ID) -> Result<PlanningRule> {
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        plans::rule(&pool, user_id, workspace_id)
            .await
            .map(PlanningRule::from)
            .map_err(trade_error)
    }
}

#[derive(Default)]
pub struct PlanMutation;

#[Object]
impl PlanMutation {
    async fn create_trade_plan(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        input: TradePlanInput,
    ) -> Result<TradePlan> {
        require_web_session(ctx)?;
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        plans::create(&pool, user_id, workspace_id, &input.into())
            .await
            .map(TradePlan::from)
            .map_err(trade_error)
    }

    /// Changes a plan that is not linked to a trade.
    async fn update_trade_plan(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: TradePlanInput,
    ) -> Result<TradePlan> {
        let (pool, user_id, id) = plan_context(ctx, &id).await?;
        plans::update(&pool, user_id, id, &input.into())
            .await
            .map(TradePlan::from)
            .map_err(trade_error)
    }

    /// Skips an open plan (`skipped: true`) or reopens a skipped one.
    async fn skip_trade_plan(&self, ctx: &Context<'_>, id: ID, skipped: bool) -> Result<TradePlan> {
        let (pool, user_id, id) = plan_context(ctx, &id).await?;
        plans::set_skipped(&pool, user_id, id, skipped)
            .await
            .map(TradePlan::from)
            .map_err(trade_error)
    }

    async fn delete_trade_plan(&self, ctx: &Context<'_>, id: ID) -> Result<bool> {
        let (pool, user_id, id) = plan_context(ctx, &id).await?;
        plans::delete(&pool, user_id, id)
            .await
            .map_err(trade_error)?;
        Ok(true)
    }

    /// Records that a trade carried out the plan. The client copies the
    /// plan's stop and risk onto the trade's journal entry.
    async fn link_trade_plan(&self, ctx: &Context<'_>, id: ID, trade_id: ID) -> Result<TradePlan> {
        let (pool, user_id, id) = plan_context(ctx, &id).await?;
        plans::link(&pool, user_id, id, &trade_id)
            .await
            .map(TradePlan::from)
            .map_err(trade_error)
    }

    /// Reopens a linked plan; the stop and risk it filled in stay on the trade.
    async fn unlink_trade_plan(&self, ctx: &Context<'_>, id: ID) -> Result<TradePlan> {
        let (pool, user_id, id) = plan_context(ctx, &id).await?;
        plans::unlink(&pool, user_id, id)
            .await
            .map(TradePlan::from)
            .map_err(trade_error)
    }

    /// Replaces the workspace's position calculator rule; a null field clears it.
    async fn save_planning_rule(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        input: PlanningRuleInput,
    ) -> Result<PlanningRule> {
        require_web_session(ctx)?;
        let (pool, user_id, workspace_id) = context(ctx, &workspace_id).await?;
        let input = RuleInput {
            manual_balance: input.manual_balance,
            risk_percent: input.risk_percent,
            max_stop_percent: input.max_stop_percent,
        };
        plans::save_rule(&pool, user_id, workspace_id, input)
            .await
            .map(PlanningRule::from)
            .map_err(trade_error)
    }
}
