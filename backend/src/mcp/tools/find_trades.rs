//! `find_trades`: search the journal by symbol, dates, outcome and labels.

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
        caller, day_start, internal, plural, reads, respond, tool_error, trade_brief, trade_line,
    },
};
use crate::trades::{
    labels::{self, LabelKind},
    read::{self, TradeFilter, TradeRow, TradeSort},
};

const DEFAULT_LIMIT: u32 = 20;
const MAX_LIMIT: u32 = 50;

#[derive(Clone, Copy, Debug, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Open,
    Closed,
    #[default]
    Any,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Winners,
    Losers,
    #[default]
    Any,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Sort {
    #[default]
    Newest,
    Oldest,
    /// Biggest winners first.
    Best,
    /// Biggest losers first.
    Worst,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct FindTradesArgs {
    /// A ticker, or the start of one. Matches options by their underlying.
    pub symbol: Option<String>,
    /// Trades opened on or after this New York date, YYYY-MM-DD.
    pub from: Option<String>,
    /// Trades opened before the end of this New York date, YYYY-MM-DD.
    pub to: Option<String>,
    #[serde(default)]
    pub status: Status,
    #[serde(default)]
    pub outcome: Outcome,
    /// An edge, entry tactic, tag or mistake name the trades carry.
    pub label: Option<String>,
    #[serde(default)]
    pub sort: Sort,
    /// How many trades to return, up to 50. Defaults to 20.
    pub limit: Option<u32>,
    /// A workspace name or ID. Leave it out to search every workspace.
    pub workspace: Option<String>,
}

#[tool_router(router = find_trades_router, vis = "pub(super)")]
impl TradstryMcp {
    /// Find trades by symbol, open dates, status, winners or losers, and any
    /// edge, entry tactic, tag or mistake. Returns each trade's id for
    /// `get_trade` and `journal_trade`.
    #[tool(
        name = "find_trades",
        meta = reads(),
        annotations(title = "Find trades", read_only_hint = true, open_world_hint = false)
    )]
    async fn find_trades(
        &self,
        Parameters(args): Parameters<FindTradesArgs>,
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
        let mut filter = TradeFilter {
            symbol: args.symbol.clone(),
            status: match args.status {
                Status::Open => Some("open".into()),
                Status::Closed => Some("closed".into()),
                Status::Any => None,
            },
            winners: match args.outcome {
                Outcome::Winners => Some(true),
                Outcome::Losers => Some(false),
                Outcome::Any => None,
            },
            ..TradeFilter::default()
        };
        for (text, slot, end) in [
            (&args.from, &mut filter.from, false),
            (&args.to, &mut filter.to, true),
        ] {
            if let Some(text) = text {
                match day_start(text) {
                    Ok(start) => {
                        *slot = Some(if end {
                            start + chrono::Duration::days(1)
                        } else {
                            start
                        })
                    }
                    Err(message) => return Ok(tool_error(message)),
                }
            }
        }
        if let Some(name) = args
            .label
            .as_deref()
            .map(str::trim)
            .filter(|n| !n.is_empty())
        {
            let all = labels::list(&self.pool, caller.user_id, None, true)
                .await
                .map_err(internal)?;
            let Some(label) = all.iter().find(|l| l.name.eq_ignore_ascii_case(name)) else {
                let known: Vec<&str> = all.iter().map(|l| l.name.as_str()).collect();
                return Ok(tool_error(format!(
                    "No edge, entry tactic, tag or mistake called \"{name}\".{}",
                    if known.is_empty() {
                        String::new()
                    } else {
                        format!(" Labels in use: {}.", known.join(", "))
                    }
                )));
            };
            match LabelKind::parse(&label.kind) {
                Some(LabelKind::Edge) => filter.edge_id = Some(label.id),
                Some(LabelKind::EntryTactic) => filter.entry_tactic_id = Some(label.id),
                Some(LabelKind::Tag) => filter.tag_id = Some(label.id),
                Some(LabelKind::Mistake) => filter.mistake_id = Some(label.id),
                None => {}
            }
        }
        let sort = match args.sort {
            Sort::Newest => TradeSort::OpenedDesc,
            Sort::Oldest => TradeSort::OpenedAsc,
            Sort::Best => TradeSort::NetDesc,
            Sort::Worst => TradeSort::NetAsc,
        };
        let limit = args.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
        let mut total = 0;
        let mut found: Vec<(String, TradeRow)> = Vec::new();
        for workspace in &workspaces {
            let (count, rows) = read::trades(
                &self.pool,
                caller.user_id,
                workspace.id,
                &filter,
                sort,
                0,
                i64::from(limit),
            )
            .await
            .map_err(internal)?;
            total += count;
            found.extend(rows.into_iter().map(|row| (workspace.name.clone(), row)));
        }
        found.sort_by(|(_, a), (_, b)| match args.sort {
            Sort::Newest => b.opened_at.cmp(&a.opened_at),
            Sort::Oldest => a.opened_at.cmp(&b.opened_at),
            Sort::Best => b.net.cmp(&a.net),
            Sort::Worst => a.net.cmp(&b.net),
        });
        found.truncate(limit as usize);

        let summary = if found.is_empty() {
            "No trades match.".to_owned()
        } else {
            let shown = found
                .iter()
                .take(5)
                .map(|(_, row)| trade_line(row))
                .collect::<Vec<_>>()
                .join("; ");
            format!(
                "{} match{}, showing {}. {shown}{}",
                plural(total as usize, "trade", "trades"),
                if total == 1 { "es" } else { "" },
                found.len(),
                if found.len() > 5 { "; …" } else { "" }
            )
        };
        Ok(respond(
            summary,
            json!({
                "total": total,
                "trades": found.iter().map(|(workspace, row)| {
                    let mut brief = trade_brief(row);
                    brief["workspace"] = json!(workspace);
                    brief
                }).collect::<Vec<_>>(),
            }),
        ))
    }
}
