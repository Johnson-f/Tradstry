//! `review_period`: a ready-made review of a week, month or any period, so an
//! assistant can coach from one call.

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
use serde_json::{Value, json};

use super::{
    TradstryMcp,
    common::{
        Workspace, caller, capitalize, internal, percent, plural, reads, respond, signed_money,
        tool_error, trade_brief, trade_line,
    },
};
use crate::{
    analytics::{Bucket, Stats},
    mcp::period::Period,
    trades::{
        notes,
        read::{TRADE_COLUMNS, TradeRow},
    },
};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ReviewArgs {
    /// The window to review: today, 1w, 1m, 3m, 6m, ytd, 1y or all. Defaults to 1w.
    #[serde(default = "week")]
    pub period: Period,
    /// A workspace name or ID. Leave it out to include every workspace.
    pub workspace: Option<String>,
}

fn week() -> Period {
    Period::Week
}

/// Groups worth calling out: at least two trades, sorted by net P&L.
fn standouts(stats: &Stats, losing: bool) -> Vec<(&'static str, &Bucket)> {
    let groups: [(&'static str, &[Bucket]); 6] = [
        ("edge", &stats.by_edge),
        ("entry tactic", &stats.by_entry_tactic),
        ("session", &stats.by_session),
        ("weekday", &stats.by_weekday),
        ("hold time", &stats.by_hold),
        ("symbol", &stats.by_symbol),
    ];
    let mut found: Vec<(&'static str, &Bucket)> = groups
        .iter()
        .flat_map(|(kind, buckets)| buckets.iter().map(move |bucket| (*kind, bucket)))
        .filter(|(_, bucket)| bucket.trades >= 2 && bucket.key != "None")
        .filter(|(_, bucket)| {
            if losing {
                bucket.net < Decimal::ZERO
            } else {
                bucket.net > Decimal::ZERO
            }
        })
        .collect();
    found.sort_by(|a, b| {
        if losing {
            a.1.net.cmp(&b.1.net)
        } else {
            b.1.net.cmp(&a.1.net)
        }
    });
    found.truncate(3);
    found
}

fn group_json(kind: &str, bucket: &Bucket) -> Value {
    json!({ "dimension": kind, "group": bucket.key, "trades": bucket.trades, "net": bucket.net,
        "winRate": bucket.win_rate, "expectancy": bucket.expectancy })
}

impl TradstryMcp {
    /// Closed, economic, top-level trades closed in the window, oldest first.
    async fn closed_trades(
        &self,
        user_id: uuid::Uuid,
        workspace: Option<&Workspace>,
        period: Period,
    ) -> Result<Vec<TradeRow>, ErrorData> {
        sqlx::query_as::<_, TradeRow>(sqlx::AssertSqlSafe(format!(
            "SELECT {TRADE_COLUMNS} WHERE t.user_id = $1 AND ($2::uuid IS NULL OR t.workspace_id = $2)
               AND t.status = 'closed' AND t.parent_id IS NULL AND NOT t.non_economic AND t.net IS NOT NULL
               AND ($3::timestamptz IS NULL OR t.closed_at >= $3)
             ORDER BY t.closed_at"
        )))
        .bind(user_id)
        .bind(workspace.map(|w| w.id))
        .bind(period.start(chrono::Utc::now()))
        .fetch_all(&self.pool)
        .await
        .map_err(internal)
    }
}

#[tool_router(router = review_period_router, vis = "pub(super)")]
impl TradstryMcp {
    /// A complete review of a period: headline results, best and worst trades,
    /// the biggest leaks and strengths, what mistakes cost, behavior patterns,
    /// and which trades still need journaling. Start here for "review my week".
    #[tool(
        name = "review_period",
        meta = reads(),
        annotations(title = "Review a period", read_only_hint = true, open_world_hint = false)
    )]
    async fn review_period(
        &self,
        Parameters(args): Parameters<ReviewArgs>,
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
        if stats.trades == 0 {
            return Ok(respond(
                format!(
                    "No closed trades in the {} across {scope}, so there's nothing to review yet.",
                    args.period.phrase()
                ),
                json!({ "period": args.period.phrase(), "trades": 0 }),
            ));
        }
        let trades = self
            .closed_trades(caller.user_id, workspace.as_ref(), args.period)
            .await?;
        let mut by_net: Vec<&TradeRow> = trades.iter().collect();
        by_net.sort_by_key(|t| std::cmp::Reverse(t.net));
        let best: Vec<&TradeRow> = by_net
            .iter()
            .copied()
            .filter(|t| t.net > Some(Decimal::ZERO))
            .take(3)
            .collect();
        let worst: Vec<&TradeRow> = by_net
            .iter()
            .rev()
            .copied()
            .filter(|t| t.net < Some(Decimal::ZERO))
            .take(3)
            .collect();
        let unjournaled: Vec<&TradeRow> = trades
            .iter()
            .filter(|t| {
                t.notes
                    .as_ref()
                    .is_none_or(|note| notes::plain_text(&note.0).is_empty())
            })
            .collect();
        let leaks = standouts(&stats, true);
        let strengths = standouts(&stats, false);
        let mistakes: Vec<_> = stats
            .mistake_costs
            .iter()
            .filter(|cost| cost.net < Decimal::ZERO)
            .take(3)
            .collect();
        let after_loss = stats
            .by_previous_trade
            .iter()
            .find(|b| b.key == "After a loss");
        let first = stats
            .by_previous_trade
            .iter()
            .find(|b| b.key == "First trade of the day");
        let revenge = stats
            .behavior
            .by_revenge
            .iter()
            .find(|b| b.key == "Revenge trade");

        let mut lines = vec![format!(
            "{} across {scope}: {}, net {}, win rate {}, profit factor {}.",
            capitalize(args.period.phrase()),
            plural(stats.trades, "closed trade", "closed trades"),
            signed_money(stats.net),
            percent(stats.win_rate),
            stats
                .profit_factor
                .map_or("n/a".into(), |pf| format!("{:.2}", pf)),
        )];
        if !best.is_empty() {
            lines.push(format!(
                "Best: {}.",
                best.iter()
                    .map(|t| trade_line(t))
                    .collect::<Vec<_>>()
                    .join("; ")
            ));
        }
        if !worst.is_empty() {
            lines.push(format!(
                "Worst: {}.",
                worst
                    .iter()
                    .map(|t| trade_line(t))
                    .collect::<Vec<_>>()
                    .join("; ")
            ));
        }
        if !leaks.is_empty() {
            lines.push(format!(
                "Leaks: {}.",
                leaks
                    .iter()
                    .map(|(kind, b)| format!(
                        "{kind} {} ({}, {})",
                        b.key,
                        plural(b.trades, "trade", "trades"),
                        signed_money(b.net)
                    ))
                    .collect::<Vec<_>>()
                    .join("; ")
            ));
        }
        if !strengths.is_empty() {
            lines.push(format!(
                "Strengths: {}.",
                strengths
                    .iter()
                    .map(|(kind, b)| format!(
                        "{kind} {} ({}, {})",
                        b.key,
                        plural(b.trades, "trade", "trades"),
                        signed_money(b.net)
                    ))
                    .collect::<Vec<_>>()
                    .join("; ")
            ));
        }
        if !mistakes.is_empty() {
            lines.push(format!(
                "Mistakes cost: {}.",
                mistakes
                    .iter()
                    .map(|c| format!(
                        "{} {} over {}",
                        c.mistake.name,
                        signed_money(c.net),
                        plural(c.trades, "trade", "trades")
                    ))
                    .collect::<Vec<_>>()
                    .join("; ")
            ));
        }
        if let (Some(after_loss), Some(first)) = (after_loss, first)
            && after_loss.trades >= 2
            && after_loss.expectancy < first.expectancy
        {
            lines.push(format!(
                "After a loss the next trade averaged {} against {} for the first trade of the day.",
                after_loss.expectancy.map_or("n/a".into(), signed_money),
                first.expectancy.map_or("n/a".into(), signed_money)
            ));
        }
        if let Some(revenge) = revenge {
            lines.push(format!(
                "{} marked as revenge, net {}.",
                plural(revenge.trades, "trade was", "trades were"),
                signed_money(revenge.net)
            ));
        }
        if let (Some(win), Some(loss)) = (
            stats.average_win_hold_seconds,
            stats.average_loss_hold_seconds,
        ) && loss > win
        {
            lines.push(format!(
                "Losers were held longer than winners on average ({} min against {} min).",
                loss / 60,
                win / 60
            ));
        }
        if !unjournaled.is_empty() {
            lines.push(format!(
                "{} no journal note yet.",
                plural(unjournaled.len(), "trade has", "trades have")
            ));
        }
        if stats.r_trades == 0 {
            lines.push("No trade has a stop or risk, so results can't be shown in R.".into());
        }

        Ok(respond(
            lines.join("\n"),
            json!({
                "period": args.period.phrase(),
                "workspace": workspace.as_ref().map(|w| &w.name),
                "trades": stats.trades,
                "net": stats.net,
                "winRate": stats.win_rate,
                "profitFactor": stats.profit_factor,
                "expectancy": stats.expectancy,
                "expectancyR": stats.expectancy_r,
                "bestTrades": best.iter().map(|t| trade_brief(t)).collect::<Vec<_>>(),
                "worstTrades": worst.iter().map(|t| trade_brief(t)).collect::<Vec<_>>(),
                "leaks": leaks.iter().map(|(kind, b)| group_json(kind, b)).collect::<Vec<_>>(),
                "strengths": strengths.iter().map(|(kind, b)| group_json(kind, b)).collect::<Vec<_>>(),
                "mistakeCosts": mistakes.iter().map(|c| json!({ "mistake": c.mistake.name, "trades": c.trades, "net": c.net,
                    "expectancyWith": c.expectancy_with, "expectancyWithout": c.expectancy_without })).collect::<Vec<_>>(),
                "afterALoss": after_loss.map(|b| json!({ "trades": b.trades, "expectancy": b.expectancy, "net": b.net })),
                "averageWinHoldSeconds": stats.average_win_hold_seconds,
                "averageLossHoldSeconds": stats.average_loss_hold_seconds,
                "unjournaledTradeIds": unjournaled.iter().take(20).map(|t| &t.id).collect::<Vec<_>>(),
                "unjournaledCount": unjournaled.len(),
                "tradesWithR": stats.r_trades,
            }),
        ))
    }
}
