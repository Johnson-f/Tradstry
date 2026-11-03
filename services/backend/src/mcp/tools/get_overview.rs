//! `get_overview`: how the user is doing over a period, in one call.

use axum::http::request::Parts;
use chrono::Utc;
use rmcp::{
    ErrorData,
    handler::server::{tool::Extension, wrapper::Parameters},
    model::{CallToolResult, ContentBlock},
    tool, tool_router,
};
use rust_decimal::Decimal;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;

use super::{
    TradstryMcp,
    common::{caller, capitalize, internal, money, tool_error},
};
use crate::{analytics, mcp::period::Period};

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
        annotations(
            title = "Trading overview",
            read_only_hint = true,
            open_world_hint = false
        )
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
        let from = args.period.start(Utc::now());
        let stats = analytics::stats(
            &self.pool,
            caller.user_id,
            workspace.as_ref().map(|w| w.id),
            from,
            None,
        )
        .await
        .map_err(internal)?;
        let scope = workspace
            .as_ref()
            .map_or("every workspace".to_owned(), |w| w.name.clone());
        let summary = if stats.trades == 0 {
            format!(
                "No closed trades in the {} across {scope}.",
                args.period.phrase()
            )
        } else {
            format!(
                "{} across {scope}: {} closed {}, net {}, win rate {}, expectancy {} per trade{}, profit factor {}, max drawdown {}.",
                capitalize(args.period.phrase()),
                stats.trades,
                if stats.trades == 1 { "trade" } else { "trades" },
                money(stats.net),
                stats.win_rate.map_or("n/a".into(), |rate| format!(
                    "{:.0}%",
                    rate * Decimal::ONE_HUNDRED
                )),
                stats.expectancy.map_or("n/a".into(), money),
                stats
                    .expectancy_r
                    .map_or(String::new(), |r| format!(" ({:.2}R)", r)),
                stats
                    .profit_factor
                    .map_or("n/a".into(), |pf| format!("{:.2}", pf)),
                money(-stats.max_drawdown.abs()),
            )
        };
        let mut result = CallToolResult::structured(json!({
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
        }));
        result.content = vec![ContentBlock::text(summary)];
        Ok(result)
    }
}
