use std::sync::Arc;

use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use tinyagents::harness::context::{RunConfig, RunContext};
use tinyagents::harness::runtime::AgentHarness;
use tinyagents::harness::tool::{
    Tool, ToolCall, ToolErrorPolicy, ToolExecutionContext, ToolPolicy, ToolResult, ToolSchema,
};

use crate::service::agents::runtime::{AgentRuntimeState, build_specialist_harness};
use crate::service::agents::specialists::{SpecialistKind, SpecialistRegistry};
use crate::service::agents::turn::TurnJournalMiddleware;
use crate::service::agents::{AgentError, AgentModelRegistry, AgentResult};

#[derive(Deserialize)]
struct DelegationArgs {
    task: String,
}

struct DomainSubagentTool {
    name: String,
    description: String,
    system_prompt: &'static str,
    harness: Arc<AgentHarness<AgentRuntimeState>>,
    concurrency: Arc<tokio::sync::Semaphore>,
}

pub fn build_tools(
    models: &AgentModelRegistry,
    uses_media: bool,
) -> AgentResult<Vec<Arc<dyn Tool<AgentRuntimeState>>>> {
    let concurrency = Arc::new(tokio::sync::Semaphore::new(3));
    [
        SpecialistKind::Performance,
        SpecialistKind::TradeReview,
        SpecialistKind::MarketResearch,
        SpecialistKind::Knowledge,
    ]
    .into_iter()
    .map(|kind| {
        let definition = SpecialistRegistry::definition(
            kind,
            kind == SpecialistKind::Knowledge && uses_media,
        );
        let mut harness = build_specialist_harness(models, &definition)?;
        harness.push_middleware(Arc::new(TurnJournalMiddleware));
        Ok(Arc::new(DomainSubagentTool {
            name: format!("delegate_{}", kind.as_str()),
            description: format!(
                "Delegate a genuinely complex bounded task to the {}. Use direct domain tools for simple lookups.",
                definition.display_name
            ),
            system_prompt: definition.prompt,
            harness: Arc::new(harness),
            concurrency: Arc::clone(&concurrency),
        }) as Arc<dyn Tool<AgentRuntimeState>>)
    })
    .collect()
}

#[async_trait]
impl Tool<AgentRuntimeState> for DomainSubagentTool {
    fn name(&self) -> &str {
        &self.name
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn schema(&self) -> ToolSchema {
        ToolSchema::new(
            self.name(),
            self.description(),
            json!({
                "type":"object",
                "properties":{"task":{"type":"string","minLength":1,"maxLength":4000}},
                "required":["task"]
            }),
        )
    }

    fn policy(&self) -> ToolPolicy {
        ToolPolicy::read_only()
    }

    fn error_policy(&self) -> ToolErrorPolicy {
        ToolErrorPolicy::Message("The delegated research task could not finish.".into())
    }

    async fn call(
        &self,
        _state: &AgentRuntimeState,
        _call: ToolCall,
    ) -> tinyagents::Result<ToolResult> {
        Err(tinyagents::TinyAgentsError::Tool(
            "subagent tools require live caller context".into(),
        ))
    }

    async fn call_with_context(
        &self,
        state: &AgentRuntimeState,
        call: ToolCall,
        context: ToolExecutionContext,
    ) -> tinyagents::Result<ToolResult> {
        let _permit = self.concurrency.acquire().await.map_err(|_| {
            tinyagents::TinyAgentsError::Tool("subagent concurrency is unavailable".into())
        })?;
        let args: DelegationArgs = serde_json::from_value(call.arguments.clone())
            .map_err(|error| tinyagents::TinyAgentsError::Validation(error.to_string()))?;
        let parent_run_id = context.run_id.as_str();
        let child_id = state
            .store
            .create_subagent_run(parent_run_id, &self.name, &call.id)
            .await
            .map_err(agent_error)?;
        let mut child_state = state.clone();
        child_state.run_id.clone_from(&child_id);
        child_state.cancellation = context.cancellation.clone();
        let child_context = RunContext::new(
            RunConfig::new(&child_id)
                .with_thread(
                    context
                        .thread_id
                        .as_ref()
                        .map(|thread| thread.as_str())
                        .unwrap_or(parent_run_id),
                )
                .with_depth(context.depth + 1)
                .with_max_depth(1)
                .with_max_model_calls(6)
                .with_max_tool_calls(8)
                .with_timeout_ms(90_000),
            (),
        )
        .with_events(context.events)
        .with_cancellation(context.cancellation);
        let run = self
            .harness
            .invoke_streaming_in_context(
                &child_state,
                child_context,
                vec![
                    tinyagents::harness::message::Message::system(self.system_prompt),
                    tinyagents::harness::message::Message::user(args.task),
                ],
            )
            .await;
        match run {
            Ok(run) => {
                state
                    .store
                    .record_subagent_usage(parent_run_id, &child_id, run.usage)
                    .await
                    .map_err(agent_error)?;
                state
                    .store
                    .complete_subagent_run(&child_id)
                    .await
                    .map_err(agent_error)?;
                let content = run
                    .structured
                    .as_ref()
                    .map(|value| value.to_string())
                    .or_else(|| run.text())
                    .unwrap_or_else(|| "The delegated task returned no finding.".into());
                Ok(ToolResult::text(call.id, self.name(), content))
            }
            Err(error) => {
                let _ = state
                    .store
                    .fail_subagent_run(&child_id, "subagent_execution_failed")
                    .await;
                Err(error)
            }
        }
    }
}

fn agent_error(error: AgentError) -> tinyagents::TinyAgentsError {
    tinyagents::TinyAgentsError::Tool(error.to_string())
}
