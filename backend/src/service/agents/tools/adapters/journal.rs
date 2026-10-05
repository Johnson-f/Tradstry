use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use tinyagents::harness::tool::{
    Tool, ToolCall, ToolErrorPolicy, ToolPolicy, ToolResult, ToolSchema,
};

use super::super::{ToolScopeApplied, persist_tool_result};
use crate::service::agents::NewAgentEvidence;
use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::read_service::journal::{self, JournalFilter};

pub struct JournalRecordsTool;

#[derive(Debug, Default, Deserialize)]
struct JournalArgs {
    trade_ids: Option<Vec<String>>,
    symbol: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
    limit: Option<u32>,
}

#[async_trait]
impl Tool<AgentRuntimeState> for JournalRecordsTool {
    fn name(&self) -> &str {
        "journal_records"
    }

    fn description(&self) -> &str {
        "Returns canonical journal records for exact authenticated Tradstry scope."
    }

    fn schema(&self) -> ToolSchema {
        ToolSchema::new(
            self.name(),
            self.description(),
            json!({
                "type": "object",
                "properties": {
                    "trade_ids": {"type": "array", "items": {"type": "string"}, "maxItems": 50},
                    "symbol": {"type": "string"},
                    "date_from": {"type": "string"},
                    "date_to": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50}
                }
            }),
        )
    }

    fn policy(&self) -> ToolPolicy {
        ToolPolicy::read_only()
    }

    fn error_policy(&self) -> ToolErrorPolicy {
        ToolErrorPolicy::Message("Journal records are temporarily unavailable.".into())
    }

    async fn call(
        &self,
        state: &AgentRuntimeState,
        call: ToolCall,
    ) -> tinyagents::Result<ToolResult> {
        let mut args: JournalArgs = serde_json::from_value(call.arguments.clone())
            .map_err(|error| tinyagents::TinyAgentsError::Validation(error.to_string()))?;
        if !state.message_context.trade_ids.is_empty() {
            args.trade_ids = Some(state.message_context.trade_ids.clone());
            args.symbol = None;
            args.date_from = None;
            args.date_to = None;
        }
        let user_db = state.db.get_user_db(&state.actor.user_id);
        if crate::service::trade_review::journal_flow::is_enabled(
            user_db.pool(),
            user_db.user_id(),
            &state.scope.workspace_id,
        )
        .await
        .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?
        {
            let records = crate::service::trade_review::journal_flow::list_trades(
                user_db.pool(),
                user_db.user_id(),
                &state.scope.workspace_id,
            )
            .await
            .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?;
            let values = records
                .into_iter()
                .filter(|entry| {
                    let date = entry
                        .close_date
                        .as_deref()
                        .or(entry.open_date.as_deref())
                        .unwrap_or("");
                    args.trade_ids
                        .as_ref()
                        .is_none_or(|ids| ids.contains(&entry.id))
                        && args
                            .symbol
                            .as_ref()
                            .is_none_or(|symbol| entry.symbol.eq_ignore_ascii_case(symbol))
                        && args
                            .date_from
                            .as_ref()
                            .is_none_or(|from| date >= from.as_str())
                        && args
                            .date_to
                            .as_ref()
                            .is_none_or(|to| date.get(..10).unwrap_or(date) <= to.as_str())
                })
                .take(args.limit.unwrap_or(20).min(50) as usize)
                .collect::<Vec<_>>();
            let evidence=values.iter().map(|entry| {
                let payload=serde_json::to_value(entry).unwrap_or_default();
                NewAgentEvidence {tool_call_id:None,source_type:"journal_entry".into(),source_id:entry.id.clone(),source_version:entry.materialized_revision.to_string(),title:format!("{} trade",entry.symbol),excerpt:format!("{} {} trade; review state {}. Realized net {} {}. Unknown values are not zero.",entry.symbol,entry.lifecycle_state,entry.review_state,entry.realized_net.as_deref().unwrap_or("unknown"),entry.currency.as_deref().unwrap_or("currency unknown")),source_url:None,freshness:"canonical".into(),payload}
            }).collect();
            let summary = format!(
                "Loaded {} journal records. Recording, lifecycle, and review are separate; realized_net is money, not a percentage.",
                values.len()
            );
            return persist_tool_result(
                state,
                &call,
                values,
                ToolScopeApplied {
                    workspace_id: state.scope.workspace_id.clone(),
                    date_range: match (&args.date_from, &args.date_to) {
                        (Some(from), Some(to)) => Some(crate::service::agents::AgentDateRange {
                            from: from.clone(),
                            to: to.clone(),
                        }),
                        _ => None,
                    },
                    symbols: args.symbol.into_iter().collect(),
                    trade_ids: args.trade_ids.unwrap_or_default(),
                    playbook_ids: Vec::new(),
                },
                evidence,
                Vec::new(),
                summary,
            )
            .await;
        }
        let mut values = if let Some(ids) = args.trade_ids.as_ref().filter(|ids| !ids.is_empty()) {
            let mut entries = Vec::new();
            for id in ids.iter().take(50) {
                if let Some(entry) = journal::get_journal_entry(&user_db, id)
                    .await
                    .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?
                    && entry.workspace_id == state.scope.workspace_id
                {
                    entries.push(entry);
                }
            }
            entries
        } else {
            journal::list_journal_entries_filtered(
                &user_db,
                &JournalFilter {
                    workspace_id: Some(state.scope.workspace_id.clone()),
                    symbol: args.symbol.clone(),
                    date_from: args.date_from.clone(),
                    date_to: args.date_to.clone(),
                    limit: Some(args.limit.unwrap_or(20).min(50)),
                    ..Default::default()
                },
            )
            .await
            .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?
        };
        values.truncate(args.limit.unwrap_or(20).min(50) as usize);

        let mut evidence = Vec::with_capacity(values.len());
        for entry in &values {
            let serialized = serde_json::to_vec(entry)
                .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?;
            let version = format!("{:x}", Sha256::digest(serialized));
            evidence.push(NewAgentEvidence {
                tool_call_id: None,
                source_type: "journal_entry".into(),
                source_id: entry.id.clone(),
                source_version: version,
                title: format!("{} trade", entry.symbol),
                excerpt: format!(
                    "{} {} trade closed {} with {:.2}% P&L.",
                    entry.symbol, entry.trade_type, entry.close_date, entry.total_pl
                ),
                source_url: None,
                freshness: "canonical".into(),
                payload: serde_json::to_value(entry).unwrap_or_default(),
            });
        }
        let summary = format!("Loaded {} canonical journal records.", values.len());
        persist_tool_result(
            state,
            &call,
            values,
            ToolScopeApplied {
                workspace_id: state.scope.workspace_id.clone(),
                date_range: match (&args.date_from, &args.date_to) {
                    (Some(from), Some(to)) => Some(crate::service::agents::AgentDateRange {
                        from: from.clone(),
                        to: to.clone(),
                    }),
                    _ => None,
                },
                symbols: args.symbol.into_iter().collect(),
                trade_ids: args.trade_ids.unwrap_or_default(),
                playbook_ids: Vec::new(),
            },
            evidence,
            Vec::new(),
            summary,
        )
        .await
    }
}
