use async_trait::async_trait;
use serde_json::json;
use tinyagents::harness::tool::{
    Tool, ToolAccess, ToolCall, ToolErrorPolicy, ToolPolicy, ToolResult, ToolRuntime, ToolSchema,
};

use crate::service::agents::actions;
use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::agents::runtime::schemas::{AgentSchema, decode_action};

pub struct ActionProposalTool;

#[async_trait]
impl Tool<AgentRuntimeState> for ActionProposalTool {
    fn name(&self) -> &str {
        "propose_action"
    }

    fn description(&self) -> &str {
        "Creates a preview-only Tradstry action proposal. It never executes the domain change; the user must approve it separately."
    }

    fn schema(&self) -> ToolSchema {
        ToolSchema::new(
            self.name(),
            self.description(),
            AgentSchema::ActionProposal.schema(),
        )
    }

    fn policy(&self) -> ToolPolicy {
        ToolPolicy::classified()
            .with_runtime(ToolRuntime {
                idempotent: true,
                cancelable: true,
                ..Default::default()
            })
            .with_access(ToolAccess {
                background_safe: true,
                ..Default::default()
            })
    }

    fn error_policy(&self) -> ToolErrorPolicy {
        ToolErrorPolicy::Message("Tradstry could not create that action proposal.".into())
    }

    async fn call(
        &self,
        state: &AgentRuntimeState,
        call: ToolCall,
    ) -> tinyagents::Result<ToolResult> {
        let stored_call = state
            .store
            .start_tool_call(&state.run_id, &call.id, self.name(), &call.arguments)
            .await
            .map_err(agent_error)?;
        let result = async {
            let payload = decode_action(call.arguments.clone())?;
            let payload = actions::validation::hydrate_expected_versions(
                state.store.pool(),
                &state.actor,
                &state.scope.workspace_id,
                payload,
            )
            .await?;
            let (payload, preview) = actions::validation::validate_and_preview(
                state.store.pool(),
                &state.actor,
                &state.scope.workspace_id,
                payload,
            )
            .await?;
            state
                .store
                .create_action_proposal_from_tool(
                    &state.actor,
                    &state.run_id,
                    &stored_call.id,
                    &payload,
                    &preview,
                    15,
                )
                .await
        }
        .await;
        match result {
            Ok(proposal) => {
                state
                    .store
                    .complete_tool_call_with_evidence(
                        &state.run_id,
                        &stored_call.id,
                        &[],
                        "Created a pending action proposal.",
                    )
                    .await
                    .map_err(agent_error)?;
                let raw = json!({
                    "proposalId": proposal.id,
                    "kind": proposal.kind,
                    "status": proposal.status,
                    "preview": proposal.preview,
                });
                Ok(ToolResult {
                    call_id: call.id,
                    name: self.name().into(),
                    content: raw.to_string(),
                    raw: Some(raw),
                    error: None,
                    elapsed_ms: 0,
                })
            }
            Err(error) => {
                let _ = state
                    .store
                    .finish_tool_call(
                        &stored_call.id,
                        "failed",
                        None,
                        Some("action_proposal_invalid"),
                    )
                    .await;
                Err(agent_error(error))
            }
        }
    }
}

fn agent_error(error: crate::service::agents::AgentError) -> tinyagents::TinyAgentsError {
    tinyagents::TinyAgentsError::Tool(error.to_string())
}
