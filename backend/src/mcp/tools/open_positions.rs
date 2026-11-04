//! `open_positions`: what the user holds now, with unrealised P&L where the
//! brokerage has reported a price.

use axum::http::request::Parts;
use rmcp::{
    ErrorData,
    handler::server::{tool::Extension, wrapper::Parameters},
    model::CallToolResult,
    tool, tool_router,
};
use rust_decimal::Decimal;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;

use super::{
    TradstryMcp,
    common::{caller, internal, plural, reads, respond, signed_money, tool_error, trade_brief},
};
use crate::trades::read;

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct OpenPositionsArgs {
    /// A workspace name or ID. Leave it out to include every workspace.
    pub workspace: Option<String>,
}

#[tool_router(router = open_positions_router, vis = "pub(super)")]
impl TradstryMcp {
    /// Open positions with entry, size, the latest price and unrealised P&L
    /// (prices come from linked brokerage holdings; manual workspaces have none).
    #[tool(
        name = "open_positions",
        meta = reads(),
        annotations(title = "Open positions", read_only_hint = true, open_world_hint = false)
    )]
    async fn open_positions(
        &self,
        Parameters(args): Parameters<OpenPositionsArgs>,
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
        let mut positions = Vec::new();
        let mut unrealized_total = Decimal::ZERO;
        let mut priced = 0;
        for workspace in &workspaces {
            let rows = read::open_trades(&self.pool, caller.user_id, workspace.id)
                .await
                .map_err(internal)?;
            let marks = read::unrealized(&self.pool, caller.user_id, workspace.id)
                .await
                .map_err(internal)?;
            for row in rows {
                let mark = marks.get(&row.id);
                if let Some((_, unrealized)) = mark {
                    unrealized_total += *unrealized;
                    priced += 1;
                }
                let mut position = trade_brief(&row);
                position["workspace"] = json!(workspace.name);
                position["openQuantity"] = json!(row.open_quantity);
                position["lastPrice"] = json!(mark.map(|m| m.0));
                position["unrealized"] = json!(mark.map(|m| m.1.round_dp(2)));
                position["realizedSoFar"] = json!(row.net);
                positions.push(position);
            }
        }
        let summary = if positions.is_empty() {
            "No open positions.".to_owned()
        } else if priced == 0 {
            format!(
                "{} open; no current prices to value them.",
                plural(positions.len(), "position", "positions")
            )
        } else {
            format!(
                "{} open, unrealised P&L {} across the {priced} with a current price.",
                plural(positions.len(), "position", "positions"),
                signed_money(unrealized_total)
            )
        };
        Ok(respond(
            summary,
            json!({ "positions": positions, "unrealizedTotal": unrealized_total.round_dp(2) }),
        ))
    }
}
