pub mod adapters;
pub mod catalog;
pub mod types;

use tinyagents::harness::tool::{ToolCall, ToolResult};

use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::agents::{AgentEvidenceRef, NewAgentEvidence};

pub use catalog::{AgentToolKind, ToolCatalog};
pub use types::{ToolEnvelope, ToolScopeApplied, ToolUnavailable};

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
    let mut refs = Vec::with_capacity(evidence.len());
    for mut item in evidence {
        item.tool_call_id = Some(stored_call.id.clone());
        let stored = state
            .store
            .record_evidence(&state.run_id, &item)
            .await
            .map_err(agent_error_as_tool)?;
        refs.push(AgentEvidenceRef {
            evidence_id: stored.id,
            source_type: stored.source_type,
            source_id: stored.source_id,
            source_version: stored.source_version,
        });
    }
    state
        .store
        .finish_tool_call(&stored_call.id, "completed", Some(&summary), None)
        .await
        .map_err(agent_error_as_tool)?;
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
