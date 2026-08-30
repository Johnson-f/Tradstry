use async_trait::async_trait;
use serde_json::json;
use tinyagents::harness::tool::{
    Tool, ToolCall, ToolErrorPolicy, ToolPolicy, ToolResult, ToolSchema,
};

use super::super::{ToolScopeApplied, persist_tool_result};
use crate::service::agents::NewAgentEvidence;
use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::db::schema::tables::notebook::images;

pub struct NotebookMediaTool;

#[async_trait]
impl Tool<AgentRuntimeState> for NotebookMediaTool {
    fn name(&self) -> &str {
        "notebook_media"
    }
    fn description(&self) -> &str {
        "Returns authenticated metadata for notebook images or videos explicitly attached to this request."
    }
    fn schema(&self) -> ToolSchema {
        ToolSchema::new(
            self.name(),
            self.description(),
            json!({"type":"object","properties":{}}),
        )
    }
    fn policy(&self) -> ToolPolicy {
        ToolPolicy::read_only()
    }
    fn error_policy(&self) -> ToolErrorPolicy {
        ToolErrorPolicy::Message("Notebook media is temporarily unavailable.".into())
    }
    async fn call(
        &self,
        state: &AgentRuntimeState,
        call: ToolCall,
    ) -> tinyagents::Result<ToolResult> {
        let mut values = Vec::new();
        for id in state.message_context.media_ids.iter().take(5) {
            let media = images::find_notebook_image(state.store.pool(), id, &state.actor.user_id)
                .await
                .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?
                .filter(|media| media.workspace_id == state.scope.workspace_id)
                .ok_or_else(|| {
                    tinyagents::TinyAgentsError::Validation(
                        "attached media is not owned in this workspace".into(),
                    )
                })?;
            values.push(media);
        }
        let evidence = values
            .iter()
            .map(|media| NewAgentEvidence {
                tool_call_id: None,
                source_type: "notebook_media".into(),
                source_id: media.id.clone(),
                source_version: media.content_hash.clone(),
                title: media.original_filename.clone(),
                excerpt: format!(
                    "Owned {} media, type {}, {} bytes.",
                    media.media_type, media.content_type, media.bytes
                ),
                source_url: None,
                freshness: "canonical".into(),
                payload: json!({"id":media.id,"noteId":media.note_id,"mediaType":media.media_type,
                "contentType":media.content_type,"width":media.width,"height":media.height,
                "durationSeconds":media.duration_seconds,"bytes":media.bytes}),
            })
            .collect();
        let warnings = Vec::new();
        let summary = format!(
            "Loaded metadata for {} owned notebook media items.",
            values.len()
        );
        persist_tool_result(
            state,
            &call,
            values,
            ToolScopeApplied {
                workspace_id: state.scope.workspace_id.clone(),
                ..Default::default()
            },
            evidence,
            warnings,
            summary,
        )
        .await
    }
}
