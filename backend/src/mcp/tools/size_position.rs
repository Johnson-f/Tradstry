//! `size_position`: the position calculator, using the workspace's rule.

use axum::http::request::Parts;
use rmcp::{
    ErrorData,
    handler::server::{tool::Extension, wrapper::Parameters},
    model::CallToolResult,
    tool, tool_router,
};

use super::{
    TradstryMcp,
    common::{caller, reads, respond, tool_error},
    plan_args::{PlanArgs, sizing_json, trade_error},
};
use crate::trades::plans;

#[tool_router(router = size_position_router, vis = "pub(super)")]
impl TradstryMcp {
    /// How many shares or contracts to trade so a loss at the stop costs no
    /// more than the chosen risk. Risk can be dollars, a percent of the
    /// balance, or the user's rule. Supports several entries splitting the
    /// risk. Saves nothing; use `save_plan` to keep it.
    #[tool(
        name = "size_position",
        meta = reads(),
        annotations(title = "Size a position", read_only_hint = true, open_world_hint = false)
    )]
    async fn size_position(
        &self,
        Parameters(args): Parameters<PlanArgs>,
        Extension(parts): Extension<Parts>,
    ) -> Result<CallToolResult, ErrorData> {
        let caller = caller(&parts)?;
        let workspace = match self
            .one_workspace(caller.user_id, args.workspace.as_deref())
            .await?
        {
            Ok(workspace) => workspace,
            Err(message) => return Ok(tool_error(message)),
        };
        let prepared = match self
            .prepare_plan(caller.user_id, &workspace, &args, String::new())
            .await?
        {
            Ok(prepared) => prepared,
            Err(message) => return Ok(tool_error(message)),
        };
        match plans::size(&prepared.input) {
            Ok(sizing) => {
                let (summary, value) = sizing_json(&prepared, &sizing);
                Ok(respond(summary, value))
            }
            Err(error) => Ok(tool_error(trade_error(error)?)),
        }
    }
}
