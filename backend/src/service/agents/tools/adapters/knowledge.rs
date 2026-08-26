use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use tinyagents::harness::tool::{
    Tool, ToolCall, ToolErrorPolicy, ToolPolicy, ToolResult, ToolSchema,
};

use super::super::{ToolScopeApplied, persist_tool_result};
use crate::service::agents::knowledge::KnowledgeSearchRequest;
use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::agents::{AgentDateRange, NewAgentEvidence};

pub struct KnowledgeSearchTool;

#[derive(Debug, Deserialize)]
struct KnowledgeArgs {
    query: String,
    date_from: Option<String>,
    date_to: Option<String>,
    symbols: Option<Vec<String>>,
    limit: Option<usize>,
}

#[async_trait]
impl Tool<AgentRuntimeState> for KnowledgeSearchTool {
    fn name(&self) -> &str {
        "knowledge_search"
    }
    fn description(&self) -> &str {
        "Searches authenticated Tradstry notes, journal entries, and playbooks with exact relationship filters."
    }
    fn schema(&self) -> ToolSchema {
        ToolSchema::new(
            self.name(),
            self.description(),
            json!({
                "type":"object","properties":{
                    "query":{"type":"string","minLength":1,"maxLength":4000},
                    "date_from":{"type":"string"},"date_to":{"type":"string"},
                    "symbols":{"type":"array","items":{"type":"string"},"maxItems":20},
                    "limit":{"type":"integer","minimum":1,"maximum":20}
                },"required":["query"]
            }),
        )
    }
    fn policy(&self) -> ToolPolicy {
        ToolPolicy::read_only()
    }
    fn error_policy(&self) -> ToolErrorPolicy {
        ToolErrorPolicy::Message("Tradstry knowledge search is temporarily unavailable.".into())
    }
    async fn call(
        &self,
        state: &AgentRuntimeState,
        call: ToolCall,
    ) -> tinyagents::Result<ToolResult> {
        let args: KnowledgeArgs = serde_json::from_value(call.arguments.clone())
            .map_err(|error| tinyagents::TinyAgentsError::Validation(error.to_string()))?;
        let service = state.knowledge.as_ref().ok_or_else(|| {
            tinyagents::TinyAgentsError::Tool("knowledge search is not configured".into())
        })?;
        let date_range = match (args.date_from, args.date_to) {
            (Some(from), Some(to)) => Some(AgentDateRange { from, to }),
            (None, None) => state.message_context.date_range.clone(),
            _ => {
                return Err(tinyagents::TinyAgentsError::Validation(
                    "date_from and date_to must be supplied together".into(),
                ));
            }
        };
        let symbols = state
            .message_context
            .market_symbol
            .clone()
            .map(|symbol| vec![symbol])
            .unwrap_or_else(|| args.symbols.unwrap_or_default());
        let hits = service
            .search(
                &state.actor,
                KnowledgeSearchRequest {
                    workspace_id: state.scope.workspace_id.clone(),
                    query: args.query,
                    date_range: date_range.clone(),
                    symbols: symbols.clone(),
                    trade_ids: state.message_context.trade_ids.clone(),
                    playbook_ids: state.message_context.playbook_ids.clone(),
                    note_ids: Vec::new(),
                    limit: args.limit.unwrap_or(8).min(20),
                },
            )
            .await
            .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?;
        let evidence = hits
            .iter()
            .map(|hit| NewAgentEvidence {
                tool_call_id: None,
                source_type: hit.source_type.as_str().into(),
                source_id: hit.source_id.clone(),
                source_version: hit.source_version.0.clone(),
                title: hit.title.clone(),
                excerpt: hit.excerpt.clone(),
                source_url: None,
                freshness: "canonical".into(),
                payload: serde_json::to_value(hit).unwrap_or_default(),
            })
            .collect();
        let summary = format!("Found {} fresh canonical knowledge sources.", hits.len());
        persist_tool_result(
            state,
            &call,
            hits,
            ToolScopeApplied {
                workspace_id: state.scope.workspace_id.clone(),
                date_range,
                symbols,
                trade_ids: state.message_context.trade_ids.clone(),
                playbook_ids: state.message_context.playbook_ids.clone(),
            },
            evidence,
            Vec::new(),
            summary,
        )
        .await
    }
}
