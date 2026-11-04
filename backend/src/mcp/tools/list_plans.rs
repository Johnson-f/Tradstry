//! `list_plans`: the trades the user planned, open or done.

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

use super::{
    TradstryMcp,
    common::{caller, internal, money, plural, reads, respond, tool_error},
};
use crate::trades::plans::{self, PlanStatus};

#[derive(Clone, Copy, Debug, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Which {
    /// Not yet linked to a trade or skipped.
    #[default]
    Open,
    /// Carried out by a trade.
    Linked,
    Skipped,
    All,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct ListPlansArgs {
    #[serde(default)]
    pub status: Which,
    /// A workspace name or ID. Leave it out to include every workspace.
    pub workspace: Option<String>,
}

#[tool_router(router = list_plans_router, vis = "pub(super)")]
impl TradstryMcp {
    /// The user's trade plans: symbol, side, entries, stop, target, risk and
    /// size, and whether each is open, linked to a trade, or skipped.
    #[tool(
        name = "list_plans",
        meta = reads(),
        annotations(title = "List trade plans", read_only_hint = true, open_world_hint = false)
    )]
    async fn list_plans(
        &self,
        Parameters(args): Parameters<ListPlansArgs>,
        Extension(parts): Extension<Parts>,
    ) -> Result<CallToolResult, ErrorData> {
        let caller = caller(&parts)?;
        let workspaces = match self
            .workspace_list(caller.user_id, args.workspace.as_deref())
            .await?
        {
            Ok(workspaces) => workspaces,
            Err(message) => return Ok(tool_error(message)),
        };
        let mut found = Vec::new();
        for workspace in &workspaces {
            for plan in plans::list(&self.pool, caller.user_id, workspace.id)
                .await
                .map_err(internal)?
            {
                let keep = match args.status {
                    Which::Open => plan.status() == PlanStatus::Open,
                    Which::Linked => plan.status() == PlanStatus::Linked,
                    Which::Skipped => plan.status() == PlanStatus::Skipped,
                    Which::All => true,
                };
                if keep {
                    found.push((workspace.name.clone(), plan));
                }
            }
        }
        let lines: Vec<String> = found
            .iter()
            .take(5)
            .map(|(_, plan)| {
                format!(
                    "{} {} {} at {}, stop {}, risking {}",
                    plan.symbol,
                    plan.direction,
                    plan.quantity,
                    money(plan.entry),
                    money(plan.stop),
                    money(plan.risk)
                )
            })
            .collect();
        let summary = if found.is_empty() {
            "No plans match.".to_owned()
        } else {
            format!(
                "{}: {}.",
                plural(found.len(), "plan", "plans"),
                lines.join("; ")
            )
        };
        Ok(respond(
            summary,
            json!({
                "plans": found.iter().map(|(workspace, plan)| json!({
                    "id": plan.id,
                    "workspace": workspace,
                    "symbol": plan.symbol,
                    "assetClass": plan.asset_class,
                    "side": plan.direction,
                    "status": plan.status,
                    "averageEntry": plan.entry,
                    "entries": plan.tranches.0.iter().map(|t| json!({ "percent": t.percent, "price": t.entry })).collect::<Vec<_>>(),
                    "stop": plan.stop,
                    "target": plan.target,
                    "risk": plan.risk,
                    "quantity": plan.quantity,
                    "roundUp": plan.round_up,
                    "note": plan.note,
                    "tradeId": plan.trade_id,
                    "createdAt": plan.created_at,
                })).collect::<Vec<_>>(),
            }),
        ))
    }
}
