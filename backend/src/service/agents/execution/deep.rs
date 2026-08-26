use std::sync::Arc;

use serde_json::json;

use super::stages::{DeepStage, DeepStageTransition};
use super::{corrective_requests, run_specialists, synthesize, verify};
use crate::service::agents::runtime::AgentRuntimeState;
use crate::service::agents::specialists::VerificationDecision;
use crate::service::agents::{
    AgentActor, AgentError, AgentMessageContext, AgentResult, AgentRun, AgentScope, AgentService,
};
use crate::service::db::Db;

pub async fn execute_deep(
    service: &AgentService,
    run: &AgentRun,
    lease_owner: &str,
    user_request: &str,
    context: AgentMessageContext,
) -> AgentResult<()> {
    let models = service.models().ok_or(AgentError::ProviderUnavailable)?;
    let state = parent_state(service, run, context.clone());
    let conversation_context = super::load_bounded_context(
        service.store(),
        &run.conversation_id,
        run.input_message_id
            .as_deref()
            .ok_or(AgentError::Internal)?,
    )
    .await?;
    let mut stage = if run.stage == "queued" {
        DeepStage::Routed
    } else {
        DeepStage::parse(&run.stage)?
    };
    service
        .budget()
        .reserve_user_action(&state.actor, &run.id, "deep")
        .await?;
    let plan = if stage == DeepStage::Routed {
        service
            .store()
            .append_event(&run.id, "supervisor_started", &json!({}))
            .await?;
        let (plan, usage) = crate::service::agents::routing::supervisor::plan(
            models,
            &state,
            &run.conversation_id,
            user_request,
            &context,
            &conversation_context,
        )
        .await?;
        record_usage(service, run, lease_owner, usage).await?;
        if !service
            .store()
            .advance_deep_stage(
                &run.id,
                lease_owner,
                DeepStageTransition {
                    expected: DeepStage::Routed,
                    next: DeepStage::SpecialistsSelected,
                    checkpoint: &serde_json::to_value(&plan).map_err(|_| AgentError::Internal)?,
                    event_kind: "specialists_selected",
                    event_payload: &json!({"specialists": plan.requests.iter().map(|r| r.specialist.as_str()).collect::<Vec<_>>() }),
                },
            )
            .await?
        {
            return Err(AgentError::Conflict);
        }
        stage = DeepStage::SpecialistsSelected;
        plan
    } else {
        serde_json::from_value(
            checkpoint_value(service, &run.id, DeepStage::SpecialistsSelected).await?,
        )
        .map_err(|_| AgentError::Internal)?
    };
    let mut findings = if stage == DeepStage::SpecialistsSelected {
        let findings =
            run_specialists(service, run, lease_owner, &context, &plan.requests, 0).await?;
        if !service
            .store()
            .advance_deep_stage(
                &run.id,
                lease_owner,
                DeepStageTransition {
                    expected: DeepStage::SpecialistsSelected,
                    next: DeepStage::SpecialistsCompleted,
                    checkpoint: &json!({"findings": findings}),
                    event_kind: "all_specialists_completed",
                    event_payload: &json!({"count": findings.len()}),
                },
            )
            .await?
        {
            return Err(AgentError::Conflict);
        }
        stage = DeepStage::SpecialistsCompleted;
        findings
    } else {
        serde_json::from_value(
            checkpoint_value(service, &run.id, DeepStage::SpecialistsCompleted)
                .await?
                .get("findings")
                .cloned()
                .ok_or(AgentError::Internal)?,
        )
        .map_err(|_| AgentError::Internal)?
    };

    let mut evidence = service.store().evidence_for_run_tree(&run.id).await?;
    let mut evidence_ids = evidence
        .iter()
        .map(|item| item.id.clone())
        .collect::<Vec<_>>();
    let mut answer = if stage == DeepStage::SpecialistsCompleted {
        let (answer, usage) = synthesize(
            models,
            &state,
            &run.conversation_id,
            user_request,
            &findings,
            &evidence_ids,
            &conversation_context,
        )
        .await?;
        record_usage(service, run, lease_owner, usage).await?;
        if !service
            .store()
            .advance_deep_stage(
                &run.id,
                lease_owner,
                DeepStageTransition {
                    expected: DeepStage::SpecialistsCompleted,
                    next: DeepStage::Synthesized,
                    checkpoint: &json!({"answer": answer}),
                    event_kind: "answer_synthesized",
                    event_payload: &json!({"claimCount": answer.claims.len()}),
                },
            )
            .await?
        {
            return Err(AgentError::Conflict);
        }
        stage = DeepStage::Synthesized;
        answer
    } else {
        serde_json::from_value(
            checkpoint_value(service, &run.id, stage)
                .await?
                .get("answer")
                .cloned()
                .ok_or(AgentError::Internal)?,
        )
        .map_err(|_| AgentError::Internal)?
    };

    if stage == DeepStage::Verified {
        complete_verified(service, run, lease_owner, &answer).await?;
        return Ok(());
    }

    service
        .store()
        .append_event(&run.id, "verification_started", &json!({}))
        .await?;
    let (mut decision, verifier_usage) = verify(
        models,
        &state,
        &run.conversation_id,
        &answer,
        &findings,
        &evidence,
    )
    .await?;
    if let Some(usage) = verifier_usage {
        record_usage(service, run, lease_owner, usage).await?;
    }
    if let VerificationDecision::Correct { requests } = decision {
        let requests = corrective_requests(requests);
        if requests.is_empty() {
            return Err(AgentError::Validation(
                "verifier requested an invalid correction".into(),
            ));
        }
        service
            .store()
            .append_event(
                &run.id,
                "corrective_round_started",
                &json!({"specialists": requests.iter().map(|r| r.specialist.as_str()).collect::<Vec<_>>() }),
            )
            .await?;
        let corrections =
            run_specialists(service, run, lease_owner, &context, &requests, 1).await?;
        findings.extend(corrections);
        evidence = service.store().evidence_for_run_tree(&run.id).await?;
        evidence_ids = evidence.iter().map(|item| item.id.clone()).collect();
        let (corrected_answer, corrected_usage) = synthesize(
            models,
            &state,
            &run.conversation_id,
            user_request,
            &findings,
            &evidence_ids,
            &conversation_context,
        )
        .await?;
        record_usage(service, run, lease_owner, corrected_usage).await?;
        answer = corrected_answer;
        let (corrected_decision, corrected_verifier_usage) = verify(
            models,
            &state,
            &run.conversation_id,
            &answer,
            &findings,
            &evidence,
        )
        .await?;
        if let Some(usage) = corrected_verifier_usage {
            record_usage(service, run, lease_owner, usage).await?;
        }
        if matches!(corrected_decision, VerificationDecision::Correct { .. }) {
            return Err(AgentError::Validation(
                "deep answer still lacked evidence after one corrective round".into(),
            ));
        }
        decision = corrected_decision;
    }
    match &decision {
        VerificationDecision::Approved => {}
        VerificationDecision::Rejected { reason } => {
            log::warn!("agent verifier rejected run {}: {reason}", run.id);
            return Err(AgentError::Validation(
                "the answer could not be verified".into(),
            ));
        }
        VerificationDecision::Correct { .. } => unreachable!("correction handled above"),
    }
    if crate::service::agents::specialists::action::is_action_request(user_request) {
        let (payload, usage) = crate::service::agents::specialists::action::propose(
            models,
            &state,
            &run.conversation_id,
            user_request,
            &context,
        )
        .await?;
        record_usage(service, run, lease_owner, usage).await?;
        let proposal = service
            .propose_action(&state.actor, &run.id, payload)
            .await?;
        answer
            .blocks
            .push(crate::service::agents::AnswerBlock::ActionProposal {
                proposal_id: proposal.id,
            });
    }
    if !service
        .store()
        .advance_deep_stage(
            &run.id,
            lease_owner,
            DeepStageTransition {
                expected: DeepStage::Synthesized,
                next: DeepStage::Verified,
                checkpoint: &json!({"answer": answer, "decision": decision}),
                event_kind: "answer_verified",
                event_payload: &json!({"correctiveRoundUsed": findings.len() > plan.requests.len()}),
            },
        )
        .await?
    {
        return Err(AgentError::Conflict);
    }
    service
        .store()
        .complete_claimed_answer(
            &run.id,
            lease_owner,
            &answer,
            &json!({"answer": answer, "verified": true}),
        )
        .await?;
    service.wake_handle().notify_waiters();
    Ok(())
}

async fn checkpoint_value(
    service: &AgentService,
    run_id: &str,
    stage: DeepStage,
) -> AgentResult<serde_json::Value> {
    service
        .store()
        .checkpoint_for_stage(run_id, stage.as_str())
        .await?
        .map(|checkpoint| checkpoint.state)
        .ok_or(AgentError::Internal)
}

async fn complete_verified(
    service: &AgentService,
    run: &AgentRun,
    lease_owner: &str,
    answer: &crate::service::agents::AnswerDraft,
) -> AgentResult<()> {
    service
        .store()
        .complete_claimed_answer(
            &run.id,
            lease_owner,
            answer,
            &json!({"answer": answer, "verified": true}),
        )
        .await?;
    service.wake_handle().notify_waiters();
    Ok(())
}

fn parent_state(
    service: &AgentService,
    run: &AgentRun,
    context: AgentMessageContext,
) -> AgentRuntimeState {
    AgentRuntimeState {
        db: Arc::new(Db::from_pool(service.store().pool().clone())),
        store: service.store().clone(),
        r2: service.r2().cloned(),
        knowledge: service.knowledge().cloned(),
        actor: AgentActor {
            user_id: run.user_id.clone(),
            clerk_id: String::new(),
        },
        scope: AgentScope {
            workspace_id: run.workspace_id.clone(),
        },
        message_context: context,
        run_id: run.id.clone(),
        cancellation: tinyagents::CancellationToken::new(),
    }
}

async fn record_usage(
    service: &AgentService,
    run: &AgentRun,
    lease_owner: &str,
    usage: tinyagents::harness::usage::UsageTotals,
) -> AgentResult<()> {
    if service
        .store()
        .record_claimed_model_usage(&run.id, lease_owner, usage)
        .await?
    {
        Ok(())
    } else {
        Err(AgentError::Conflict)
    }
}
