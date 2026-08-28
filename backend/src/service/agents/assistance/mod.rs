mod autocomplete;
mod market_report;
mod rewrite;
mod types;

use std::sync::Arc;

use tinyagents::harness::context::RunConfig;
use tinyagents::harness::limits::RunLimits;
use tinyagents::harness::message::Message;
use tinyagents::harness::model::ResponseFormat;
use tinyagents::harness::runtime::AgentHarness;

pub use autocomplete::complete;
pub use market_report::synthesize_market_report;
pub use rewrite::rewrite;
pub use types::RewriteAction;

use crate::service::agents::runtime::{AgentRuntimeState, ModelRole, build_run_policy};
use crate::service::agents::{
    AgentActor, AgentError, AgentMessageContext, AgentResult, AgentScope, AgentService,
};
use crate::service::db::Db;

struct TextInvocation<'a> {
    workload: &'a str,
    role: ModelRole,
    system: &'a str,
    prompt: String,
    max_output_tokens: u32,
    timeout_ms: u64,
}

async fn invoke_text(
    service: &AgentService,
    actor: &AgentActor,
    invocation: TextInvocation<'_>,
) -> AgentResult<String> {
    let request_id = uuid::Uuid::new_v4().to_string();
    service
        .budget()
        .reserve_assistance_action(actor, invocation.workload, &request_id)
        .await?;
    let models = service.models().ok_or(AgentError::ProviderUnavailable)?;
    let mut harness = AgentHarness::new();
    harness
        .register_model("assistance", models.primary(invocation.role))
        .set_default_model("assistance");
    let mut policy = build_run_policy();
    policy.limits = RunLimits::default()
        .with_max_model_calls(1)
        .with_max_tool_calls(0)
        .with_max_wall_clock_ms(Some(invocation.timeout_ms))
        .with_max_depth(0);
    policy.default_response_format = Some(ResponseFormat::Text);
    policy.truncated_empty_retries = 0;
    harness.with_policy(policy);
    let state = AgentRuntimeState {
        db: Arc::new(Db::from_pool(service.store().pool().clone())),
        store: service.store().clone(),
        r2: None,
        knowledge: None,
        actor: actor.clone(),
        scope: AgentScope {
            workspace_id: String::new(),
        },
        message_context: AgentMessageContext::default(),
        run_id: request_id.clone(),
        cancellation: tinyagents::CancellationToken::new(),
    };
    let result = harness
        .invoke(
            &state,
            (),
            RunConfig::new(&request_id)
                .with_timeout_ms(invocation.timeout_ms)
                .with_max_model_calls(1)
                .with_max_tool_calls(0)
                .with_max_turn_output_tokens(invocation.max_output_tokens),
            vec![
                Message::system(invocation.system),
                Message::user(invocation.prompt),
            ],
        )
        .await;
    match result {
        Ok(result) => {
            service
                .budget()
                .finish_assistance_action(actor, &request_id, result.usage, None)
                .await?;
            Ok(result.text().unwrap_or_default().to_string())
        }
        Err(error) => {
            let error = crate::service::agents::runtime::provider_failure::model_error(
                error,
                crate::service::agents::runtime::provider_failure::ModelCallContext {
                    stage: invocation.workload,
                    role: invocation.role.as_str(),
                    schema_name: None,
                },
            );
            let error_code = match &error {
                AgentError::Provider(failure) => failure.error_code.as_str(),
                AgentError::Cancelled => "cancelled",
                _ => "assistance_failed",
            };
            service
                .budget()
                .finish_assistance_action(
                    actor,
                    &request_id,
                    tinyagents::harness::usage::UsageTotals::default(),
                    Some(error_code),
                )
                .await?;
            Err(error)
        }
    }
}
