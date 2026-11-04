//! `get_trade`: everything about one trade, so an assistant can review it.

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
    common::{caller, internal, reads, respond, tool_error, trade_brief, trade_line},
};
use crate::trades::{notes, plans, read};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GetTradeArgs {
    /// The trade's id, from `find_trades` or `review_period`.
    pub trade_id: String,
}

#[tool_router(router = get_trade_router, vis = "pub(super)")]
impl TradstryMcp {
    /// One trade in full: fills, P&L, risk and R, the journal note as text,
    /// edges, entry tactics, tags, mistakes, behavior answers and any plan it
    /// carried out.
    #[tool(
        name = "get_trade",
        meta = reads(),
        annotations(title = "Get a trade", read_only_hint = true, open_world_hint = false)
    )]
    async fn get_trade(
        &self,
        Parameters(args): Parameters<GetTradeArgs>,
        Extension(parts): Extension<Parts>,
    ) -> Result<CallToolResult, ErrorData> {
        let caller = caller(&parts)?;
        let rows = read::trades_by_id(
            &self.pool,
            caller.user_id,
            &[args.trade_id.trim().to_owned()],
        )
        .await
        .map_err(internal)?;
        let Some(row) = rows.into_iter().next() else {
            return Ok(tool_error(format!(
                "No trade with id \"{}\". Use find_trades to look it up.",
                args.trade_id
            )));
        };
        let fills = read::fills(&self.pool, caller.user_id, &row.id)
            .await
            .map_err(internal)?;
        let workspace: Option<String> =
            sqlx::query_scalar("SELECT name FROM workspaces WHERE id = $1 AND user_id = $2")
                .bind(row.workspace_id)
                .bind(caller.user_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(internal)?;
        let plan_id: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM trade_plans WHERE user_id = $1 AND trade_id = $2")
                .bind(caller.user_id)
                .bind(&row.id)
                .fetch_optional(&self.pool)
                .await
                .map_err(internal)?;
        let plan = match plan_id {
            Some(id) => plans::list(&self.pool, caller.user_id, row.workspace_id)
                .await
                .map_err(internal)?
                .into_iter()
                .find(|plan| plan.id == id),
            None => None,
        };
        let note = row
            .notes
            .as_ref()
            .map(|note| notes::plain_text(&note.0))
            .unwrap_or_default();
        let behavior = row.behavior;

        let mut summary = trade_line(&row);
        if let Some(risk) = row.risk() {
            summary.push_str(&format!(", risking ${risk:.2}"));
        }
        summary.push('.');
        if note.is_empty() {
            summary.push_str(" No journal note yet.");
        } else {
            summary.push_str(&format!(
                " Note: {}",
                note.chars().take(280).collect::<String>()
            ));
        }

        let mut value = trade_brief(&row);
        value["workspace"] = json!(workspace);
        value["fees"] = json!(row.fees);
        value["gross"] = json!(row.gross);
        value["initialStop"] = json!(row.initial_stop);
        value["plannedRisk"] = json!(row.planned_risk);
        value["risk"] = json!(row.risk());
        value["note"] = json!(note);
        value["strategy"] = json!(row.strategy_label);
        value["legs"] = json!(row.children);
        value["behavior"] = json!({
            "conviction": behavior.conviction,
            "marketRegime": behavior.market_regime.map(|regime| regime.label()),
            "plannedPreMarket": behavior.planned_pre_market,
            "revengeTrade": behavior.revenge_trade,
            "brokeThirtyMinuteRule": behavior.broke_thirty_minute_rule,
            "ruleAdherence": behavior.rule_adherence,
        });
        value["fills"] = json!(
            fills
                .iter()
                .map(|fill| json!({
                    "role": fill.role,
                    "executedAt": fill.executed_at,
                    "quantity": fill.quantity,
                    "price": fill.price,
                    "fee": fill.fee,
                }))
                .collect::<Vec<_>>()
        );
        value["plan"] = json!(plan.map(|plan| json!({
            "id": plan.id,
            "entry": plan.entry,
            "stop": plan.stop,
            "target": plan.target,
            "risk": plan.risk,
            "quantity": plan.quantity,
            "note": plan.note,
        })));
        Ok(respond(summary, value))
    }
}
