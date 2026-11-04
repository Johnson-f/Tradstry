//! `save_plan`: keep a sized position as a plan, to link to the trade later.

use axum::http::request::Parts;
use rmcp::{
    ErrorData,
    handler::server::{tool::Extension, wrapper::Parameters},
    model::CallToolResult,
    tool, tool_router,
};
use schemars::JsonSchema;
use serde::Deserialize;

use super::{
    TradstryMcp,
    common::{caller, respond, tool_error, writes},
    plan_args::{PlanArgs, sizing_json, trade_error},
};
use crate::trades::plans;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SavePlanArgs {
    #[serde(flatten)]
    pub plan: PlanArgs,
    /// Why the trader is taking it, in their words.
    #[serde(default)]
    pub note: String,
}

#[tool_router(router = save_plan_router, vis = "pub(super)")]
impl TradstryMcp {
    /// Save a planned trade (sized like `size_position`) to the user's open
    /// plans, so it can be linked to the trade once taken.
    #[tool(
        name = "save_plan",
        meta = writes(),
        annotations(
            title = "Save a trade plan",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn save_plan(
        &self,
        Parameters(args): Parameters<SavePlanArgs>,
        Extension(parts): Extension<Parts>,
    ) -> Result<CallToolResult, ErrorData> {
        let caller = caller(&parts)?;
        if let Some(refused) = self.require_write(caller) {
            return Ok(refused);
        }
        let workspace = match self
            .one_workspace(caller.user_id, args.plan.workspace.as_deref())
            .await?
        {
            Ok(workspace) => workspace,
            Err(message) => return Ok(tool_error(message)),
        };
        let prepared = match self
            .prepare_plan(caller.user_id, &workspace, &args.plan, args.note.clone())
            .await?
        {
            Ok(prepared) => prepared,
            Err(message) => return Ok(tool_error(message)),
        };
        let sizing = match plans::size(&prepared.input) {
            Ok(sizing) => sizing,
            Err(error) => return Ok(tool_error(trade_error(error)?)),
        };
        let plan =
            match plans::create(&self.pool, caller.user_id, workspace.id, &prepared.input).await {
                Ok(plan) => plan,
                Err(error) => return Ok(tool_error(trade_error(error)?)),
            };
        let (summary, mut value) = sizing_json(&prepared, &sizing);
        value["planId"] = serde_json::json!(plan.id);
        value["workspace"] = serde_json::json!(workspace.name);
        Ok(respond(
            format!("Saved to {}'s open plans. {summary}", workspace.name),
            value,
        ))
    }
}
