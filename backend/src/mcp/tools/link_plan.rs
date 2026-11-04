//! `link_plan`: record that a trade carried out a plan, and measure the trade
//! against the plan's stop and risk, as the journal does.

use axum::http::request::Parts;
use rmcp::{
    ErrorData,
    handler::server::{tool::Extension, wrapper::Parameters},
    model::CallToolResult,
    tool, tool_router,
};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use super::{
    TradstryMcp,
    common::{caller, respond, tool_error, trade_brief, writes},
    plan_args::trade_error,
};
use crate::trades::plans;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct LinkPlanArgs {
    /// The plan's id, from `list_plans` or `save_plan`.
    pub plan_id: String,
    /// The trade that carried it out, from `find_trades`.
    pub trade_id: String,
}

#[tool_router(router = link_plan_router, vis = "pub(super)")]
impl TradstryMcp {
    /// Link a saved plan to the trade that carried it out. The trade takes
    /// the plan's stop and risk, so its R is measured against the plan.
    #[tool(
        name = "link_plan",
        meta = writes(),
        annotations(
            title = "Link a plan to a trade",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = true,
            open_world_hint = false
        )
    )]
    async fn link_plan(
        &self,
        Parameters(args): Parameters<LinkPlanArgs>,
        Extension(parts): Extension<Parts>,
    ) -> Result<CallToolResult, ErrorData> {
        let caller = caller(&parts)?;
        if let Some(refused) = self.require_write(caller) {
            return Ok(refused);
        }
        let Ok(plan_id) = Uuid::parse_str(args.plan_id.trim()) else {
            return Ok(tool_error(
                "That isn't a plan id. Use list_plans to find it.",
            ));
        };
        let plan =
            match plans::link(&self.pool, caller.user_id, plan_id, args.trade_id.trim()).await {
                Ok(plan) => plan,
                Err(error) => return Ok(tool_error(trade_error(error)?)),
            };
        let (stop, risk) = (plan.stop, plan.risk);
        match self
            .edit_entry(caller.user_id, args.trade_id.trim(), |_, input| {
                input.initial_stop = Some(stop);
                input.planned_risk = Some(risk);
            })
            .await?
        {
            Ok(row) => Ok(respond(
                format!(
                    "Linked the {} plan to the trade; it is now measured against the plan's ${stop} stop and ${risk} risk.",
                    plan.symbol
                ),
                json!({ "planId": plan.id, "trade": trade_brief(&row) }),
            )),
            Err(message) => Ok(tool_error(message)),
        }
    }
}
