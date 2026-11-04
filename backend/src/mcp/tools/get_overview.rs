//! `get_overview`: how the user is doing over a period, in one call.

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
    common::{
        caller, capitalize, money, percent, plural, r_multiple, reads, respond, signed_money,
        tool_error,
    },
};
use crate::mcp::period::Period;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct OverviewArgs {
    /// The window of closed trades: today, 1w, 1m, 3m, 6m, ytd, 1y or all. Defaults to 1m.
    #[serde(default)]
    pub period: Period,
    /// A workspace name or ID. Leave it out to include every workspace.
    pub workspace: Option<String>,
}

#[tool_router(router = get_overview_router, vis = "pub(super)")]
impl TradstryMcp {
    /// How the user is doing: P&L, win rate, expectancy in dollars and R,
    /// profit factor, drawdown and streaks for closed trades in a period.
    #[tool(
        name = "get_overview",
        meta = reads(),
        annotations(title = "Trading overview", read_only_hint = true, open_world_hint = false)
    )]
    async fn get_overview(
        &self,
        Parameters(args): Parameters<OverviewArgs>,
        Extension(parts): Extension<Parts>,
    ) -> Result<CallToolResult, ErrorData> {
        let caller = caller(&parts)?;
        let workspace = match self
            .workspace(caller.user_id, args.workspace.as_deref())
            .await?
        {
            Ok(workspace) => workspace,
            Err(message) => return Ok(tool_error(message)),
        };
        let stats = self
            .stats(caller.user_id, workspace.as_ref(), args.period)
            .await?;
        let scope = workspace
            .as_ref()
            .map_or("every workspace".to_owned(), |w| w.name.clone());
        let summary = if stats.trades == 0 {
            format!(
                "No closed trades in the {} across {scope}.",
                args.period.phrase()
            )
        } else {
            let r = r_multiple(stats.expectancy_r);
            format!(
                "{} across {scope}: {}, net {}, win rate {}, expectancy {} per trade{}, profit factor {}, max drawdown {}.",
                capitalize(args.period.phrase()),
                plural(stats.trades, "closed trade", "closed trades"),
                signed_money(stats.net),
                percent(stats.win_rate),
                stats.expectancy.map_or("n/a".into(), signed_money),
                if r.is_empty() { r } else { format!(" ({r})") },
                stats
                    .profit_factor
                    .map_or("n/a".into(), |pf| format!("{:.2}", pf)),
                money(-stats.max_drawdown.abs()),
            )
        };
        Ok(respond(
            summary,
            json!({
                "period": args.period.phrase(),
                "workspace": workspace.as_ref().map(|w| &w.name),
                "trades": stats.trades,
                "wins": stats.wins,
                "losses": stats.losses,
                "breakeven": stats.breakeven,
                "winRate": stats.win_rate,
                "net": stats.net,
                "grossProfit": stats.gross_profit,
                "grossLoss": stats.gross_loss,
                "averageWin": stats.average_win,
                "averageLoss": stats.average_loss,
                "largestWin": stats.largest_win,
                "largestLoss": stats.largest_loss,
                "profitFactor": stats.profit_factor,
                "expectancy": stats.expectancy,
                "expectancyR": stats.expectancy_r,
                "tradesWithR": stats.r_trades,
                "sqn": stats.sqn,
                "maxDrawdown": stats.max_drawdown,
                "currentDrawdown": stats.current_drawdown,
                "longestWinStreak": stats.longest_win_streak,
                "longestLossStreak": stats.longest_loss_streak,
                "currentStreak": stats.current_streak,
            }),
        ))
    }
}
