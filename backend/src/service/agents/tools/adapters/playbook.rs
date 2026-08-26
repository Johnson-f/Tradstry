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
use crate::service::read_service::playbook;

pub struct PlaybookContextTool;

#[derive(Debug, Default, Deserialize)]
struct PlaybookArgs {
    playbook_ids: Option<Vec<String>>,
}

#[async_trait]
impl Tool<AgentRuntimeState> for PlaybookContextTool {
    fn name(&self) -> &str {
        "playbook_context"
    }

    fn description(&self) -> &str {
        "Returns canonical rules and separately calculated statistics for playbooks available in the authenticated Tradstry workspace."
    }

    fn schema(&self) -> ToolSchema {
        ToolSchema::new(
            self.name(),
            self.description(),
            json!({
                "type": "object",
                "properties": {
                    "playbook_ids": {"type": "array", "items": {"type": "string"}, "maxItems": 20}
                }
            }),
        )
    }

    fn policy(&self) -> ToolPolicy {
        ToolPolicy::read_only()
    }

    fn error_policy(&self) -> ToolErrorPolicy {
        ToolErrorPolicy::Message("Playbook context is temporarily unavailable.".into())
    }

    async fn call(
        &self,
        state: &AgentRuntimeState,
        call: ToolCall,
    ) -> tinyagents::Result<ToolResult> {
        let mut args: PlaybookArgs = serde_json::from_value(call.arguments.clone())
            .map_err(|error| tinyagents::TinyAgentsError::Validation(error.to_string()))?;
        if !state.message_context.playbook_ids.is_empty() {
            args.playbook_ids = Some(state.message_context.playbook_ids.clone());
        }
        let user_db = state.db.get_user_db(&state.actor.user_id);
        let mut values = playbook::list_playbooks(&user_db, &state.scope.workspace_id)
            .await
            .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?;
        if let Some(ids) = args.playbook_ids.as_ref().filter(|ids| !ids.is_empty()) {
            values.retain(|value| ids.iter().any(|id| id == &value.id));
        }
        values.truncate(20);
        let evidence = values
            .iter()
            .map(|value| {
                let serialized = serde_json::to_vec(value).unwrap_or_default();
                NewAgentEvidence {
                    tool_call_id: None,
                    source_type: "playbook".into(),
                    source_id: value.id.clone(),
                    source_version: format!("{:x}", Sha256::digest(serialized)),
                    title: value.name.clone(),
                    excerpt: format!(
                        "{}: canonical entry, exit, position sizing, and additional rules; {} linked trades.",
                        value.edge_name, value.trade_count
                    ),
                    source_url: None,
                    freshness: "canonical".into(),
                    payload: serde_json::to_value(value).unwrap_or_default(),
                }
            })
            .collect();
        let applied_ids = values.iter().map(|value| value.id.clone()).collect();
        let summary = format!("Loaded {} canonical playbooks.", values.len());
        persist_tool_result(
            state,
            &call,
            values,
            ToolScopeApplied {
                workspace_id: state.scope.workspace_id.clone(),
                playbook_ids: applied_ids,
                ..Default::default()
            },
            evidence,
            Vec::new(),
            summary,
        )
        .await
    }
}
