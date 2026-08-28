use std::sync::Arc;

use serde_json::json;
use tinyagents::harness::context::{RunConfig, RunContext};
use tinyagents::harness::retry::FallbackPolicy;
use tinyagents::harness::runtime::AgentHarness;

use super::{context, direct, events};
use crate::service::agents::runtime::provider_failure::{ModelCallContext, model_error};
use crate::service::agents::runtime::{
    AgentRuntimeState, ModelRole, build_run_policy,
    schemas::{AgentSchema, AnswerValidationIssue, decode_answer},
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
        harness.push_model_middleware(models.rate_limit_middleware());
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
        let answer_schema = AgentSchema::Answer;
        let schema_identity = answer_schema.identity()?;
        policy.default_response_format = Some(answer_schema.response_format());
        harness.with_policy(policy);
        let messages =
            context::build_messages(self.service, run, user_request, &message_context, &state)
                .await?;
        let (event_sink, mut event_rx) = events::event_channel(&run.id);
        self.service
            .store()
            .append_event(
                &run.id,
                "answer_contract_selected",
                &json!({
                    "schemaName": schema_identity.name,
                    "schemaVersion": schema_identity.version,
                    "schemaHash": schema_identity.hash,
                }),
            )
            .await?;
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
        let (agent_run, extraction_issues) = match result {
            Ok(agent_run) => (Some(agent_run), None),
            Err(tinyagents::TinyAgentsError::StructuredOutput(_)) => {
                if !self
                    .service
                    .store()
                    .record_claimed_model_usage(
                        &run.id,
                        lease_owner,
                        tinyagents::harness::usage::UsageTotals {
                            calls: 1,
                            ..Default::default()
                        },
                    )
                    .await?
                {
                    return Err(AgentError::Conflict);
                }
                (
                    None,
                    Some(vec![AnswerValidationIssue {
                        code: "answer_schema_invalid",
                        path: "/".into(),
                    }]),
                )
            }
            Err(error) => {
                return Err(model_error(
                    error,
                    ModelCallContext {
                        stage: "turn",
                        role: role.as_str(),
                        schema_name: Some(schema_identity.name),
                        schema_version: Some(schema_identity.version),
                        schema_hash: Some(&schema_identity.hash),
                    },
                ));
            }
        };
        if let Some(agent_run) = &agent_run
            && !self
                .service
                .store()
                .record_claimed_model_usage(&run.id, lease_owner, agent_run.usage)
                .await?
        {
            return Err(AgentError::Conflict);
        }
        let decoded = agent_run.and_then(|agent_run| agent_run.structured.map(decode_answer));
        let (mut answer, repair_issues) = if let Some(issues) = extraction_issues {
            (None, Some(issues))
        } else {
            match decoded {
                None => (
                    None,
                    Some(vec![AnswerValidationIssue {
                        code: "answer_missing",
                        path: "/".into(),
                    }]),
                ),
                Some(Ok(answer)) => match self
                    .service
                    .store()
                    .validate_answer_references(&run.id, &answer)
                    .await
                {
                    Ok(()) => (Some(answer), None),
                    Err(AgentError::Validation(_)) => (
                        Some(answer),
                        Some(vec![AnswerValidationIssue {
                            code: "answer_reference_invalid",
                            path: "/claims_or_action_proposals".into(),
                        }]),
                    ),
                    Err(error) => return Err(error),
                },
                Some(Err(error)) => (None, Some(error.issues)),
            }
        };
        if let Some(repair_issues) = repair_issues {
            let failure_payload = json!({
                "schemaName": schema_identity.name,
                "schemaVersion": schema_identity.version,
                "schemaHash": schema_identity.hash,
                "issues": repair_issues,
            });
            self.service
                .store()
                .append_event(&run.id, "answer_validation_failed", &failure_payload)
                .await?;
            self.service
                .store()
                .append_event(&run.id, "answer_repair_started", &failure_payload)
                .await?;
            let mut repair_messages =
                context::build_messages(self.service, run, user_request, &message_context, &state)
                    .await?;
            repair_messages.push(tinyagents::harness::message::Message::system(
                format!(
                    "The previous structured answer failed validation at these safe code/path pairs: {}. Return one corrected {name} answer with schema_version \"2\" and all required arrays. Put each paragraph, metric, list, warning, or action proposal only in its matching array, give every visible item a unique non-negative order, and use only evidence IDs and proposal IDs already present in the transcript. Do not call tools.",
                    serde_json::to_string(&repair_issues).unwrap_or_else(|_| "[]".into()),
                    name = schema_identity.name,
                ),
            ));
            let repair_result = harness
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
                .await;
            let repair = match repair_result {
                Ok(repair) => repair,
                Err(tinyagents::TinyAgentsError::StructuredOutput(_)) => {
                    if !self
                        .service
                        .store()
                        .record_claimed_model_usage(
                            &run.id,
                            lease_owner,
                            tinyagents::harness::usage::UsageTotals {
                                calls: 1,
                                ..Default::default()
                            },
                        )
                        .await?
                    {
                        return Err(AgentError::Conflict);
                    }
                    self.service
                        .store()
                        .append_event(
                            &run.id,
                            "answer_repair_exhausted",
                            &json!({
                                "schemaName": schema_identity.name,
                                "schemaVersion": schema_identity.version,
                                "schemaHash": schema_identity.hash,
                            }),
                        )
                        .await?;
                    return Err(AgentError::AnswerRepairExhausted);
                }
                Err(error) => {
                    return Err(model_error(
                        error,
                        ModelCallContext {
                            stage: "answer_repair",
                            role: role.as_str(),
                            schema_name: Some(schema_identity.name),
                            schema_version: Some(schema_identity.version),
                            schema_hash: Some(&schema_identity.hash),
                        },
                    ));
                }
            };
            if !self
                .service
                .store()
                .record_claimed_model_usage(&run.id, lease_owner, repair.usage)
                .await?
            {
                return Err(AgentError::Conflict);
            }
            let repaired = repair
                .structured
                .and_then(|value| decode_answer(value).ok());
            let repaired = match repaired {
                Some(answer) => match self
                    .service
                    .store()
                    .validate_answer_references(&run.id, &answer)
                    .await
                {
                    Ok(()) => answer,
                    Err(_) => {
                        self.service
                            .store()
                            .append_event(
                                &run.id,
                                "answer_repair_exhausted",
                                &json!({
                                    "schemaName": schema_identity.name,
                                    "schemaVersion": schema_identity.version,
                                    "schemaHash": schema_identity.hash,
                                }),
                            )
                            .await?;
                        return Err(AgentError::AnswerRepairExhausted);
                    }
                },
                None => {
                    self.service
                        .store()
                        .append_event(
                            &run.id,
                            "answer_repair_exhausted",
                            &json!({
                                "schemaName": schema_identity.name,
                                "schemaVersion": schema_identity.version,
                                "schemaHash": schema_identity.hash,
                            }),
                        )
                        .await?;
                    return Err(AgentError::AnswerRepairExhausted);
                }
            };
            self.service
                .store()
                .append_event(
                    &run.id,
                    "answer_repair_completed",
                    &json!({
                        "schemaName": schema_identity.name,
                        "schemaVersion": schema_identity.version,
                        "schemaHash": schema_identity.hash,
                    }),
                )
                .await?;
            answer = Some(repaired);
        }
        let answer = answer.ok_or(AgentError::AnswerRepairExhausted)?;
        self.service
            .store()
            .complete_claimed_answer(&run.id, lease_owner, &answer)
            .await?;
        self.service.wake_handle().notify_waiters();
        Ok(())
    }
}
