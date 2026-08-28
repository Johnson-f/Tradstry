pub mod adapters;
pub mod catalog;
pub mod proposals;
pub mod types;

use std::sync::Arc;

use async_trait::async_trait;
use tinyagents::harness::tool::{
    Tool, ToolCall, ToolErrorPolicy, ToolExecutionContext, ToolPolicy, ToolResult, ToolSchema,
};

use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::agents::{AgentEvidenceRef, NewAgentEvidence};

pub use catalog::{AgentToolKind, ToolCatalog};
pub use types::{ToolEnvelope, ToolScopeApplied, ToolUnavailable};

pub struct ContextualTool {
    inner: Arc<dyn Tool<AgentRuntimeState>>,
}

impl ContextualTool {
    pub fn new(inner: Arc<dyn Tool<AgentRuntimeState>>) -> Self {
        Self { inner }
    }
}

#[async_trait]
impl Tool<AgentRuntimeState> for ContextualTool {
    fn name(&self) -> &str {
        self.inner.name()
    }

    fn description(&self) -> &str {
        self.inner.description()
    }

    fn schema(&self) -> ToolSchema {
        self.inner.schema()
    }

    fn policy(&self) -> ToolPolicy {
        self.inner.policy()
    }

    fn error_policy(&self) -> ToolErrorPolicy {
        self.inner.error_policy()
    }

    async fn call(
        &self,
        state: &AgentRuntimeState,
        call: ToolCall,
    ) -> tinyagents::Result<ToolResult> {
        self.inner.call(state, call).await
    }

    async fn call_with_context(
        &self,
        state: &AgentRuntimeState,
        call: ToolCall,
        context: ToolExecutionContext,
    ) -> tinyagents::Result<ToolResult> {
        let mut scoped = state.clone();
        scoped.run_id = context.run_id.as_str().to_owned();
        scoped.cancellation = context.cancellation;
        self.inner.call(&scoped, call).await
    }
}

pub async fn persist_tool_result<T: serde::Serialize>(
    state: &AgentRuntimeState,
    call: &ToolCall,
    data: T,
    scope: ToolScopeApplied,
    evidence: Vec<NewAgentEvidence>,
    warnings: Vec<String>,
    summary: String,
) -> tinyagents::Result<ToolResult> {
    let stored_call = state
        .store
        .start_tool_call(&state.run_id, &call.id, &call.name, &call.arguments)
        .await
        .map_err(agent_error_as_tool)?;
    let evidence = evidence
        .into_iter()
        .map(|mut item| {
            item.tool_call_id = Some(stored_call.id.clone());
            item
        })
        .collect::<Vec<_>>();
    let refs = state
        .store
        .complete_tool_call_with_evidence(&state.run_id, &stored_call.id, &evidence, &summary)
        .await
        .map_err(agent_error_as_tool)?
        .into_iter()
        .map(|stored| AgentEvidenceRef {
            evidence_id: stored.id,
            source_type: stored.source_type,
            source_id: stored.source_id,
            source_version: stored.source_version,
        })
        .collect();
    let envelope = ToolEnvelope {
        ok: true,
        data: Some(data),
        scope,
        evidence: refs,
        warnings,
        unavailable: None,
    };
    let raw = serde_json::to_value(&envelope)
        .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?;
    let content = serde_json::to_string(&serde_json::json!({
        "summary": summary,
        "evidence": envelope.evidence,
        "warnings": envelope.warnings,
    }))
    .map_err(|error| tinyagents::TinyAgentsError::Tool(error.to_string()))?;
    Ok(ToolResult {
        call_id: call.id.clone(),
        name: call.name.clone(),
        content,
        raw: Some(raw),
        error: None,
        elapsed_ms: 0,
    })
}

fn agent_error_as_tool(error: crate::service::agents::AgentError) -> tinyagents::TinyAgentsError {
    log::error!("agent tool persistence failed: {error}");
    tinyagents::TinyAgentsError::Tool("Tradstry could not persist verified tool evidence".into())
}
