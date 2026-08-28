use std::sync::Arc;

use serde_json::json;
use tinyagents::harness::context::{RunConfig, RunContext};
use tinyagents::harness::retry::FallbackPolicy;
use tinyagents::harness::runtime::AgentHarness;

use super::{context, direct, events};
use crate::service::agents::runtime::provider_failure::{ModelCallContext, model_error};
use crate::service::agents::runtime::{
    AgentRuntimeState, ModelRole, build_run_policy,
    schemas::{AgentSchema, decode_answer},
};
use crate::service::agents::tools::ToolCatalog;
use crate::service::agents::{
    AgentActor, AgentError, AgentMessageContext, AgentResult, AgentRun, AgentScope, AgentService,
};
use crate::service::db::Db;

pub struct AgentTurnRunner<'a> {
    service: &'a AgentService,
}

impl<'a> AgentTurnRunner<'a> {
    pub fn new(service: &'a AgentService) -> Self {
        Self { service }
    }

    pub async fn execute_claimed(
        &self,
        run: &AgentRun,
        lease_owner: &str,
        user_request: &str,
        message_context: AgentMessageContext,
        cancellation: tinyagents::CancellationToken,
    ) -> AgentResult<()> {
        if let Some(intent) = message_context.explicit_intent.clone()
            && direct::execute(
                self.service,
                run,
                lease_owner,
                message_context.clone(),
                intent,
                cancellation.clone(),
            )
            .await?
        {
            return Ok(());
        }
        let actor = AgentActor {
            user_id: run.user_id.clone(),
            clerk_id: String::new(),
        };
        self.service
            .budget()
            .reserve_user_action(&actor, &run.id, "turn")
            .await?;
        let state = AgentRuntimeState {
            db: Arc::new(Db::from_pool(self.service.store().pool().clone())),
            store: self.service.store().clone(),
            r2: self.service.r2().cloned(),
            knowledge: self.service.knowledge().cloned(),
            actor,
            scope: AgentScope {
                workspace_id: run.workspace_id.clone(),
            },
            message_context: message_context.clone(),
            run_id: run.id.clone(),
            cancellation: cancellation.clone(),
        };
        let role = if message_context.media_ids.is_empty() {
            ModelRole::Reasoning
        } else {
            ModelRole::Vision
        };
        let models = self
            .service
            .models()
            .ok_or(AgentError::ProviderUnavailable)?;
        let mut harness: AgentHarness<AgentRuntimeState> = AgentHarness::new();
        harness
            .register_model("turn-primary", models.primary(role))
            .set_default_model("turn-primary");
        let mut fallbacks = vec!["turn-primary".to_string()];
        if let Some(fallback) = models.fallback(role) {
            harness.register_model("turn-fallback", fallback);
            fallbacks.push("turn-fallback".into());
        }
        for tool in ToolCatalog::build_turn(!message_context.media_ids.is_empty())? {
            harness.register_tool(tool);
        }
        for tool in crate::service::agents::subagents::build_tools(
            models,
            !message_context.media_ids.is_empty(),
        )? {
            harness.register_tool(tool);
        }
        harness.push_middleware(Arc::new(super::journal::TurnJournalMiddleware));
        let mut policy = build_run_policy();
        policy.fallback = (fallbacks.len() > 1).then(|| FallbackPolicy::new(fallbacks));
        policy.default_response_format = Some(
            AgentSchema::Answer {
                name: "tradstry_answer",
            }
            .response_format(),
        );
        harness.with_policy(policy);
        let messages =
            context::build_messages(self.service, run, user_request, &message_context, &state)
                .await?;
        let (event_sink, mut event_rx) = events::event_channel(&run.id);
        let run_context = RunContext::new(
            RunConfig::new(&run.id)
                .with_thread(&run.conversation_id)
                .with_timeout_ms(120_000)
                .with_max_model_calls(12)
                .with_max_tool_calls(20)
                .with_max_depth(1),
            (),
        )
        .with_events(event_sink)
        .with_cancellation(cancellation);
        let mut invocation =
            Box::pin(harness.invoke_streaming_in_context(&state, run_context, messages));
        let result = loop {
            tokio::select! {
                result = &mut invocation => break result,
                event = event_rx.recv() => {
                    if let Some(event) = event {
                        events::persist_event(self.service, &run.id, event).await?;
                    }
                }
            }
        };
        while let Ok(event) = event_rx.try_recv() {
            events::persist_event(self.service, &run.id, event).await?;
        }
        let agent_run = result.map_err(|error| {
            model_error(
                error,
                ModelCallContext {
                    stage: "turn",
                    role: role.as_str(),
                    schema_name: Some("tradstry_answer"),
                },
            )
        })?;
        if !self
            .service
            .store()
            .record_claimed_model_usage(&run.id, lease_owner, agent_run.usage)
            .await?
        {
            return Err(AgentError::Conflict);
        }
        let mut answer = decode_answer(agent_run.structured.ok_or(AgentError::Internal)?)?;
        if matches!(
            self.service
                .store()
                .validate_answer_references(&run.id, &answer)
                .await,
            Err(AgentError::Validation(_))
        ) {
            self.service
                .store()
                .append_event(&run.id, "answer_repair_started", &json!({}))
                .await?;
            let mut repair_messages =
                context::build_messages(self.service, run, user_request, &message_context, &state)
                    .await?;
            repair_messages.push(tinyagents::harness::message::Message::system(
                "The previous answer contained an invalid evidence or action reference. Return a corrected final answer using only evidence IDs and proposal IDs already present in the transcript. Do not call tools.",
            ));
            let repair = harness
                .invoke(
                    &state,
                    (),
                    RunConfig::new(&run.id)
                        .with_thread(&run.conversation_id)
                        .with_timeout_ms(30_000)
                        .with_max_model_calls(1)
                        .with_max_tool_calls(0),
                    repair_messages,
                )
                .await
                .map_err(|error| {
                    model_error(
                        error,
                        ModelCallContext {
                            stage: "answer_repair",
                            role: role.as_str(),
                            schema_name: Some("tradstry_answer"),
                        },
                    )
                })?;
            if !self
                .service
                .store()
                .record_claimed_model_usage(&run.id, lease_owner, repair.usage)
                .await?
            {
                return Err(AgentError::Conflict);
            }
            answer = decode_answer(repair.structured.ok_or(AgentError::GroundingInvalid)?)?;
            self.service
                .store()
                .validate_answer_references(&run.id, &answer)
                .await
                .map_err(|_| AgentError::GroundingInvalid)?;
        }
        self.service
            .store()
            .complete_claimed_answer(&run.id, lease_owner, &answer)
            .await?;
        self.service.wake_handle().notify_waiters();
        Ok(())
    }
}
