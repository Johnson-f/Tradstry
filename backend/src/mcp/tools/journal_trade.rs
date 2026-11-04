//! `journal_trade`: add to a trade's journal entry. Notes are appended and
//! labels added, so nothing the trader wrote is lost.

use axum::http::request::Parts;
use chrono::Utc;
use chrono_tz::America::New_York;
use rmcp::{
    ErrorData,
    handler::server::{tool::Extension, wrapper::Parameters},
    model::CallToolResult,
    tool, tool_router,
};
use rust_decimal::{Decimal, prelude::FromPrimitive};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use super::{
    TradstryMcp,
    common::{caller, internal, respond, tool_error, trade_brief, writes},
    plan_args::trade_error,
};
use crate::trades::{
    behavior::MarketRegime,
    labels::{self, LabelInput, LabelKind, LabelRef},
    notes::{self, NoteDocument},
    read::{self, TradeRow},
    service::{self, AnnotationInput, TradeError},
};

#[derive(Clone, Copy, Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Market {
    Trending,
    Choppy,
    Ranging,
    Volatile,
}

#[derive(Debug, Default, Deserialize, JsonSchema)]
pub struct JournalTradeArgs {
    /// The trade's id, from `find_trades`, `review_period` or `get_trade`.
    pub trade_id: String,
    /// Text to add at the end of the trade's note, dated. Existing text is kept.
    pub note: Option<String>,
    /// Edges to add, by name. New names become new labels.
    #[serde(default)]
    pub edges: Vec<String>,
    /// Entry tactics to add, by name.
    #[serde(default)]
    pub entry_tactics: Vec<String>,
    /// Tags to add, by name.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Mistakes to add, by name.
    #[serde(default)]
    pub mistakes: Vec<String>,
    /// Conviction before entry, 1 to 5.
    pub conviction: Option<i16>,
    pub market: Option<Market>,
    pub planned_pre_market: Option<bool>,
    pub revenge_trade: Option<bool>,
    pub broke_thirty_minute_rule: Option<bool>,
    /// How closely the trader followed their rules, 1 to 5.
    pub rule_adherence: Option<i16>,
    /// The stop price planned at entry.
    pub initial_stop: Option<f64>,
    /// Dollars at risk; takes the place of the stop for R.
    pub planned_risk: Option<f64>,
}

fn ids(labels: &[LabelRef]) -> Vec<Uuid> {
    labels
        .iter()
        .filter_map(|label| Uuid::parse_str(&label.id).ok())
        .collect()
}

fn add(ids: &mut Vec<Uuid>, more: Vec<Uuid>) {
    for id in more {
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
}

impl TradstryMcp {
    /// Label ids for these names, creating any the user doesn't have yet.
    async fn label_ids(
        &self,
        user_id: Uuid,
        kind: LabelKind,
        names: &[String],
    ) -> Result<Result<Vec<Uuid>, String>, ErrorData> {
        let existing = labels::list(&self.pool, user_id, Some(kind), false)
            .await
            .map_err(internal)?;
        let mut out = Vec::new();
        for name in names.iter().map(|n| n.trim()).filter(|n| !n.is_empty()) {
            if let Some(label) = existing.iter().find(|l| l.name.eq_ignore_ascii_case(name)) {
                out.push(label.id);
                continue;
            }
            let input = LabelInput {
                name: name.to_owned(),
                ..LabelInput::default()
            };
            match labels::create(&self.pool, user_id, kind, &input).await {
                Ok(label) => out.push(label.id),
                Err(TradeError::LabelExists(id)) => out.push(id),
                Err(error) => return trade_error(error).map(Err),
            }
        }
        Ok(Ok(out))
    }

    /// Applies `change` to the trade's journal entry and saves it, retrying
    /// once if the website saved a newer version in between.
    pub(super) async fn edit_entry(
        &self,
        user_id: Uuid,
        trade_id: &str,
        change: impl Fn(&TradeRow, &mut AnnotationInput),
    ) -> Result<Result<TradeRow, String>, ErrorData> {
        for _ in 0..2 {
            let rows = read::trades_by_id(&self.pool, user_id, &[trade_id.to_owned()])
                .await
                .map_err(internal)?;
            let Some(row) = rows.into_iter().next() else {
                return Ok(Err(format!(
                    "No trade with id \"{trade_id}\". Use find_trades to look it up."
                )));
            };
            let mut input = AnnotationInput {
                notes: row
                    .notes
                    .as_ref()
                    .map_or_else(NoteDocument::default, |note| NoteDocument(note.0.clone())),
                edge_ids: ids(&row.edges.0),
                entry_tactic_ids: ids(&row.entry_tactics.0),
                tag_ids: ids(&row.tags.0),
                mistake_ids: ids(&row.mistakes.0),
                initial_stop: row.initial_stop,
                planned_risk: row.planned_risk,
                behavior: row.behavior,
            };
            change(&row, &mut input);
            let version = row
                .annotation_id
                .map(|_| row.annotation_version.unwrap_or(1));
            match service::save_annotation(
                &self.pool,
                user_id,
                row.workspace_id,
                &row.id,
                version,
                &input,
            )
            .await
            {
                Ok(_) => {
                    let saved =
                        read::trades_by_id(&self.pool, user_id, std::slice::from_ref(&row.id))
                            .await
                            .map_err(internal)?;
                    return Ok(saved
                        .into_iter()
                        .next()
                        .ok_or_else(|| "The trade disappeared.".to_owned()));
                }
                Err(TradeError::Conflict) => continue,
                Err(error) => return trade_error(error).map(Err),
            }
        }
        Ok(Err(
            "The entry kept changing on another device. Try again.".into()
        ))
    }
}

#[tool_router(router = journal_trade_router, vis = "pub(super)")]
impl TradstryMcp {
    /// Add to a trade's journal entry: append a note, add edges, entry
    /// tactics, tags and mistakes by name (new names are created), and record
    /// behavior answers, the initial stop or planned risk. Fields left out
    /// stay as they are; existing note text and labels are never removed.
    #[tool(
        name = "journal_trade",
        meta = writes(),
        annotations(
            title = "Journal a trade",
            read_only_hint = false,
            destructive_hint = false,
            idempotent_hint = false,
            open_world_hint = false
        )
    )]
    async fn journal_trade(
        &self,
        Parameters(args): Parameters<JournalTradeArgs>,
        Extension(parts): Extension<Parts>,
    ) -> Result<CallToolResult, ErrorData> {
        let caller = caller(&parts)?;
        if let Some(refused) = self.require_write(caller) {
            return Ok(refused);
        }
        let note = args
            .note
            .as_deref()
            .map(str::trim)
            .filter(|n| !n.is_empty());
        let nothing = note.is_none()
            && [&args.edges, &args.entry_tactics, &args.tags, &args.mistakes]
                .iter()
                .all(|names| names.is_empty())
            && args.conviction.is_none()
            && args.market.is_none()
            && args.planned_pre_market.is_none()
            && args.revenge_trade.is_none()
            && args.broke_thirty_minute_rule.is_none()
            && args.rule_adherence.is_none()
            && args.initial_stop.is_none()
            && args.planned_risk.is_none();
        if nothing {
            return Ok(tool_error(
                "Nothing to add. Give a note, labels, behavior answers, a stop or a planned risk.",
            ));
        }
        if [args.conviction, args.rule_adherence]
            .into_iter()
            .flatten()
            .any(|score| !(1..=5).contains(&score))
        {
            return Ok(tool_error("Conviction and rule adherence run from 1 to 5."));
        }
        let mut label_ids = Vec::new();
        for (kind, names) in [
            (LabelKind::Edge, &args.edges),
            (LabelKind::EntryTactic, &args.entry_tactics),
            (LabelKind::Tag, &args.tags),
            (LabelKind::Mistake, &args.mistakes),
        ] {
            match self.label_ids(caller.user_id, kind, names).await? {
                Ok(ids) => label_ids.push(ids),
                Err(message) => return Ok(tool_error(message)),
            }
        }
        let decimal = |value: Option<f64>| value.and_then(Decimal::from_f64).map(|d| d.round_dp(6));
        let stop = decimal(args.initial_stop);
        let risk = decimal(args.planned_risk);
        let dated = note.map(|text| {
            format!(
                "{} — {text}",
                Utc::now().with_timezone(&New_York).format("%b %-d, %Y")
            )
        });
        let edited = self
            .edit_entry(caller.user_id, args.trade_id.trim(), |_, input| {
                if let Some(text) = &dated {
                    input.notes = NoteDocument(notes::append_text(&input.notes.0, text));
                }
                add(&mut input.edge_ids, label_ids[0].clone());
                add(&mut input.entry_tactic_ids, label_ids[1].clone());
                add(&mut input.tag_ids, label_ids[2].clone());
                add(&mut input.mistake_ids, label_ids[3].clone());
                let behavior = &mut input.behavior;
                behavior.conviction = args.conviction.or(behavior.conviction);
                behavior.market_regime = args
                    .market
                    .map(|market| match market {
                        Market::Trending => MarketRegime::Trending,
                        Market::Choppy => MarketRegime::Choppy,
                        Market::Ranging => MarketRegime::Ranging,
                        Market::Volatile => MarketRegime::Volatile,
                    })
                    .or(behavior.market_regime);
                behavior.planned_pre_market =
                    args.planned_pre_market.or(behavior.planned_pre_market);
                behavior.revenge_trade = args.revenge_trade.or(behavior.revenge_trade);
                behavior.broke_thirty_minute_rule = args
                    .broke_thirty_minute_rule
                    .or(behavior.broke_thirty_minute_rule);
                behavior.rule_adherence = args.rule_adherence.or(behavior.rule_adherence);
                input.initial_stop = stop.or(input.initial_stop);
                input.planned_risk = risk.or(input.planned_risk);
            })
            .await?;
        match edited {
            Ok(row) => Ok(respond(
                format!(
                    "Saved to the {} journal entry. It shows in the app right away.",
                    row.symbol
                ),
                json!({ "trade": trade_brief(&row), "note": row.notes.as_ref().map(|n| notes::plain_text(&n.0)) }),
            )),
            Err(message) => Ok(tool_error(message)),
        }
    }
}
