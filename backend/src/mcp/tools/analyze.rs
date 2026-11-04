//! `analyze`: results broken down by one dimension, from the same analytics the
//! app shows, so "where am I winning and losing?" is one call.

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
        caller, capitalize, percent, plural, r_multiple, reads, respond, signed_money, tool_error,
    },
};
use crate::{
    analytics::{Bucket, Stats},
    mcp::period::Period,
};

/// What to break results down by.
#[derive(Clone, Copy, Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Dimension {
    /// The edge the trader recorded for the trade.
    Edge,
    /// The entry tactic recorded for the trade.
    EntryTactic,
    /// Free-form tags.
    Tag,
    /// Each recorded mistake, with what trades with it earned against the rest.
    Mistake,
    /// The traded symbol.
    Symbol,
    /// Long against short.
    Direction,
    /// Weekday the trade opened, New York time.
    Weekday,
    /// Hour the trade opened, New York time.
    Hour,
    /// Session it opened in: pre-market, first hour, midday, last hour, after hours.
    Session,
    /// Month it closed.
    Month,
    /// How long it was held.
    HoldTime,
    /// What the entries cost.
    PositionSize,
    /// R-multiple ranges, for trades with a stop or risk.
    RMultiple,
    /// Trades with no mistake against trades with one.
    Discipline,
    /// How the previous trade that day ended.
    PreviousTrade,
    /// How many trades closed that day.
    TradesPerDay,
    /// Pre-trade conviction, 1 to 5.
    Conviction,
    /// Market regime: trending, choppy, ranging, volatile.
    Market,
    /// Planned before the open or not.
    PlannedPreMarket,
    /// Revenge trades against the rest.
    Revenge,
    /// Kept or broke the 30-minute rule.
    ThirtyMinuteRule,
    /// Rule adherence, 1 to 5.
    RuleAdherence,
    /// Trades from a saved plan against trades without one.
    Plan,
}

impl Dimension {
    fn label(self) -> &'static str {
        match self {
            Self::Edge => "edge",
            Self::EntryTactic => "entry tactic",
            Self::Tag => "tag",
            Self::Mistake => "mistake",
            Self::Symbol => "symbol",
            Self::Direction => "direction",
            Self::Weekday => "weekday",
            Self::Hour => "hour opened",
            Self::Session => "session",
            Self::Month => "month",
            Self::HoldTime => "hold time",
            Self::PositionSize => "position size",
            Self::RMultiple => "R-multiple",
            Self::Discipline => "discipline",
            Self::PreviousTrade => "previous trade",
            Self::TradesPerDay => "trades per day",
            Self::Conviction => "conviction",
            Self::Market => "market",
            Self::PlannedPreMarket => "pre-market plan",
            Self::Revenge => "revenge trading",
            Self::ThirtyMinuteRule => "30-minute rule",
            Self::RuleAdherence => "rule adherence",
            Self::Plan => "trade plan",
        }
    }

    fn buckets(self, stats: &Stats) -> &[Bucket] {
        match self {
            Self::Edge => &stats.by_edge,
            Self::EntryTactic => &stats.by_entry_tactic,
            Self::Tag => &stats.by_tag,
            Self::Mistake => &stats.by_mistake,
            Self::Symbol => &stats.by_symbol,
            Self::Direction => &stats.by_direction,
            Self::Weekday => &stats.by_weekday,
            Self::Hour => &stats.by_hour,
            Self::Session => &stats.by_session,
            Self::Month => &stats.by_month,
            Self::HoldTime => &stats.by_hold,
            Self::PositionSize => &stats.by_size,
            Self::RMultiple => &stats.r_distribution,
            Self::Discipline => &stats.by_discipline,
            Self::PreviousTrade => &stats.by_previous_trade,
            Self::Conviction => &stats.behavior.by_conviction,
            Self::Market => &stats.behavior.by_market_regime,
            Self::PlannedPreMarket => &stats.behavior.by_planned,
            Self::Revenge => &stats.behavior.by_revenge,
            Self::ThirtyMinuteRule => &stats.behavior.by_thirty_minute_rule,
            Self::RuleAdherence => &stats.behavior.by_rule_adherence,
            Self::Plan => &stats.plans.by_plan,
            Self::TradesPerDay => &[],
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct AnalyzeArgs {
    /// What to group closed trades by.
    pub dimension: Dimension,
    /// The window of closed trades: today, 1w, 1m, 3m, 6m, ytd, 1y or all. Defaults to 1m.
    #[serde(default)]
    pub period: Period,
    /// A workspace name or ID. Leave it out to include every workspace.
    pub workspace: Option<String>,
}

fn bucket_json(bucket: &Bucket) -> Value {
    json!({
        "group": bucket.key,
        "trades": bucket.trades,
        "wins": bucket.wins,
        "losses": bucket.losses,
        "winRate": bucket.win_rate,
        "net": bucket.net,
        "expectancy": bucket.expectancy,
        "expectancyR": bucket.expectancy_r,
    })
}

fn bucket_line(bucket: &Bucket) -> String {
    let r = r_multiple(bucket.expectancy_r);
    format!(
        "{} ({}, {} win rate, {} per trade{})",
        bucket.key,
        plural(bucket.trades, "trade", "trades"),
        percent(bucket.win_rate),
        bucket.expectancy.map_or("n/a".into(), signed_money),
        if r.is_empty() { r } else { format!(", {r}") }
    )
}

/// Best and worst groups by expectancy, ignoring one-off groups when there are others.
fn best_and_worst(buckets: &[Bucket]) -> (Option<&Bucket>, Option<&Bucket>) {
    let mut ranked: Vec<&Bucket> = buckets.iter().filter(|b| b.expectancy.is_some()).collect();
    if ranked.iter().any(|b| b.trades >= 2) {
        ranked.retain(|b| b.trades >= 2);
    }
    ranked.sort_by_key(|b| std::cmp::Reverse(b.expectancy));
    let best = ranked.first().copied();
    let worst = ranked
        .last()
        .copied()
        .filter(|w| ranked.len() > 1 && w.expectancy < Some(Decimal::ZERO));
    (best, worst)
}

#[tool_router(router = analyze_router, vis = "pub(super)")]
impl TradstryMcp {
    /// Closed-trade results grouped by one dimension (edge, entry tactic,
    /// mistake, session, weekday, hold time, conviction, plan and more), with
    /// trades, win rate, net P&L and expectancy in dollars and R per group.
    /// Use it to find where the trader makes and loses money.
    #[tool(
        name = "analyze",
        meta = reads(),
        annotations(title = "Analyze results", read_only_hint = true, open_world_hint = false)
    )]
    async fn analyze(
        &self,
        Parameters(args): Parameters<AnalyzeArgs>,
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
        let heading = format!(
            "{} by {} across {scope}",
            capitalize(args.period.phrase()),
            args.dimension.label()
        );

        if let Dimension::TradesPerDay = args.dimension {
            let rows: Vec<Value> = stats
                .trades_per_day
                .iter()
                .map(|day| {
                    json!({ "group": day.key, "days": day.days, "trades": day.trades, "net": day.net,
                        "averageDay": day.average_day, "winRate": day.win_rate })
                })
                .collect();
            let best = stats
                .trades_per_day
                .iter()
                .max_by_key(|day| day.average_day);
            let summary = match best {
                None => format!("{heading}: no closed trades."),
                Some(best) => format!(
                    "{heading}: the best days were those with {} ({} on average).",
                    best.key,
                    best.average_day.map_or("n/a".into(), signed_money)
                ),
            };
            return Ok(respond(
                summary,
                json!({ "dimension": "trades_per_day", "groups": rows }),
            ));
        }

        let buckets = args.dimension.buckets(&stats);
        let groups: Vec<Value> = buckets.iter().map(bucket_json).collect();
        let mut extra = json!({});
        if let Dimension::Mistake = args.dimension {
            extra = json!({
                "mistakeCosts": stats.mistake_costs.iter().map(|cost| json!({
                    "mistake": cost.mistake.name,
                    "trades": cost.trades,
                    "net": cost.net,
                    "expectancyWith": cost.expectancy_with,
                    "expectancyWithout": cost.expectancy_without,
                })).collect::<Vec<_>>(),
            });
        }
        let summary = if buckets.iter().all(|b| b.trades == 0) {
            match args.dimension {
                Dimension::Edge | Dimension::EntryTactic | Dimension::Tag | Dimension::Mistake => {
                    format!(
                        "{heading}: no trades have a {} recorded yet. The trader adds them in each trade's details.",
                        args.dimension.label()
                    )
                }
                Dimension::RMultiple => {
                    format!("{heading}: no trades have a stop or risk, so there's no R yet.")
                }
                _ => format!("{heading}: nothing recorded in this window."),
            }
        } else {
            let (best, worst) = best_and_worst(buckets);
            let mut parts = vec![format!(
                "{heading}: {}.",
                plural(buckets.len(), "group", "groups")
            )];
            if let Some(best) = best {
                parts.push(format!("Best: {}.", bucket_line(best)));
            }
            if let Some(worst) = worst {
                parts.push(format!("Worst: {}.", bucket_line(worst)));
            }
            parts.join(" ")
        };
        let mut value = json!({
            "dimension": args.dimension.label(),
            "period": args.period.phrase(),
            "workspace": workspace.as_ref().map(|w| &w.name),
            "groups": groups,
        });
        if let (Some(object), Some(extra)) = (value.as_object_mut(), extra.as_object()) {
            object.extend(extra.clone());
        }
        Ok(respond(summary, value))
    }
}
