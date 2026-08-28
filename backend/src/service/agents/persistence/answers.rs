use std::collections::HashSet;

use serde_json::json;
use sqlx::Row;
use uuid::Uuid;

use super::AgentStore;
use super::conversations::message_from_row;
use crate::service::agents::{AgentError, AgentMessage, AgentResult, AnswerBlock, AnswerDraft};

#[derive(Clone, Debug)]
pub struct CompletedAgentAnswer {
    pub message: AgentMessage,
    pub terminal_event_sequence: i64,
}

impl AgentStore {
    pub async fn validate_answer_references(
        &self,
        run_id: &str,
        answer: &AnswerDraft,
    ) -> AgentResult<()> {
        validate_claims(answer)?;
        for proposal_id in answer.blocks.iter().filter_map(|block| match block {
            AnswerBlock::ActionProposal { proposal_id } => Some(proposal_id),
            _ => None,
        }) {
            let owned: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM agent_action_proposals WHERE id=$1 AND run_id=$2)",
            )
            .bind(proposal_id)
            .bind(run_id)
            .fetch_one(self.pool())
            .await?;
            if !owned {
                return Err(AgentError::Validation(
                    "answer referenced an action proposal outside the current run".into(),
                ));
            }
        }
        for claim in &answer.claims {
            let count: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM agent_evidence e
                 JOIN agent_runs source_run ON source_run.id=e.run_id
                 WHERE (source_run.id=$1 OR source_run.parent_run_id=$1)
                   AND e.id=ANY($2)",
            )
            .bind(run_id)
            .bind(&claim.evidence_ids)
            .fetch_one(self.pool())
            .await?;
            if count != claim.evidence_ids.len() as i64 {
                return Err(AgentError::Validation(
                    "answer cited evidence outside the current run".into(),
                ));
            }
        }
        Ok(())
    }

    pub async fn complete_claimed_answer(
        &self,
        run_id: &str,
        lease_owner: &str,
        answer: &AnswerDraft,
    ) -> AgentResult<CompletedAgentAnswer> {
        validate_claims(answer)?;
        let mut tx = self.pool().begin().await?;
        let run = sqlx::query(
            "SELECT conversation_id, user_id, workspace_id, input_message_id, next_event_sequence
             FROM agent_runs WHERE id = $1 AND lease_owner = $2 AND status = 'running'
             FOR UPDATE",
        )
        .bind(run_id)
        .bind(lease_owner)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(run) = run else {
            return Err(AgentError::Conflict);
        };
        let conversation_id: String = run.try_get("conversation_id")?;
        let user_id: String = run.try_get("user_id")?;
        let workspace_id: String = run.try_get("workspace_id")?;
        let input_message_id: Option<String> = run.try_get("input_message_id")?;
        for proposal_id in answer.blocks.iter().filter_map(|block| match block {
            AnswerBlock::ActionProposal { proposal_id } => Some(proposal_id),
            _ => None,
        }) {
            let owned: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM agent_action_proposals
                 WHERE id=$1 AND run_id=$2 AND user_id=$3)",
            )
            .bind(proposal_id)
            .bind(run_id)
            .bind(&user_id)
            .fetch_one(&mut *tx)
            .await?;
            if !owned {
                return Err(AgentError::Validation(
                    "answer referenced an action proposal outside the current run".into(),
                ));
            }
        }
        sqlx::query("SELECT id FROM agent_conversations WHERE id = $1 FOR UPDATE")
            .bind(&conversation_id)
            .fetch_one(&mut *tx)
            .await?;
        let sequence: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM agent_messages WHERE conversation_id = $1",
        )
        .bind(&conversation_id)
        .fetch_one(&mut *tx)
        .await?;
        let message_id = Uuid::new_v4().to_string();
        let message = sqlx::query(
            "INSERT INTO agent_messages
             (id, conversation_id, user_id, workspace_id, sequence, role, content_json)
             VALUES ($1, $2, $3, $4, $5, 'assistant', $6) RETURNING *",
        )
        .bind(&message_id)
        .bind(&conversation_id)
        .bind(&user_id)
        .bind(&workspace_id)
        .bind(sequence)
        .bind(serde_json::to_value(answer).map_err(|_| AgentError::Internal)?)
        .fetch_one(&mut *tx)
        .await?;

        for claim in &answer.claims {
            let count: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM agent_evidence e
                 JOIN agent_runs source_run ON source_run.id = e.run_id
                 WHERE (source_run.id = $1 OR source_run.parent_run_id = $1)
                   AND e.id = ANY($2)",
            )
            .bind(run_id)
            .bind(&claim.evidence_ids)
            .fetch_one(&mut *tx)
            .await?;
            if count != claim.evidence_ids.len() as i64 {
                return Err(AgentError::Validation(
                    "answer cited evidence outside the current run".into(),
                ));
            }
            let claim_row_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO agent_claims
                 (id, run_id, message_id, user_id, workspace_id, claim_key, claim_text)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)",
            )
            .bind(&claim_row_id)
            .bind(run_id)
            .bind(&message_id)
            .bind(&user_id)
            .bind(&workspace_id)
            .bind(claim.claim_id.trim())
            .bind(claim.text.trim())
            .execute(&mut *tx)
            .await?;
            for (ordinal, evidence_id) in claim.evidence_ids.iter().enumerate() {
                sqlx::query(
                    "INSERT INTO agent_claim_evidence (claim_id, evidence_id, ordinal)
                     VALUES ($1, $2, $3)",
                )
                .bind(&claim_row_id)
                .bind(evidence_id)
                .bind(ordinal as i32)
                .execute(&mut *tx)
                .await?;
            }
        }

        let event_sequence: i64 = run.try_get("next_event_sequence")?;
        sqlx::query(
            "INSERT INTO agent_run_events
             (id, run_id, user_id, workspace_id, sequence, kind, payload_json)
             VALUES ($1, $2, $3, $4, $5, 'run_completed', $6)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(&user_id)
        .bind(&workspace_id)
        .bind(event_sequence)
        .bind(json!({ "messageId": message_id }))
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE agent_runs SET status = 'completed',
             output_message_id = $2,
             next_event_sequence = next_event_sequence + 1, completed_at = now(),
             updated_at = now() WHERE id = $1",
        )
        .bind(run_id)
        .bind(&message_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE agent_conversations SET updated_at = now() WHERE id = $1")
            .bind(&conversation_id)
            .execute(&mut *tx)
            .await?;
        if let Some(input_message_id) = input_message_id {
            sqlx::query(
                "INSERT INTO agent_memory_jobs
                 (id,user_id,workspace_id,source_conversation_id,source_message_id,run_id,extraction_version)
                 VALUES ($1,$2,$3,$4,$5,$6,'memory-v1')
                 ON CONFLICT (source_message_id, extraction_version) DO NOTHING",
            )
            .bind(Uuid::new_v4().to_string())
            .bind(&user_id)
            .bind(&workspace_id)
            .bind(&conversation_id)
            .bind(input_message_id)
            .bind(run_id)
            .execute(&mut *tx)
                .await?;
        }
        if sequence > 50 {
            sqlx::query(
                "INSERT INTO agent_conversation_summary_jobs
                 (id,conversation_id,user_id,workspace_id,target_sequence,summary_version)
                 VALUES($1,$2,$3,$4,$5,'summary-v1')
                 ON CONFLICT (conversation_id) WHERE status='queued' DO UPDATE SET
                   target_sequence=GREATEST(agent_conversation_summary_jobs.target_sequence,EXCLUDED.target_sequence),
                   updated_at=now()",
            ).bind(Uuid::new_v4().to_string()).bind(&conversation_id).bind(&user_id).bind(&workspace_id)
             .bind(sequence-20).execute(&mut *tx).await?;
        }
        crate::service::notifications::outbox::record(
            &mut *tx,
            &user_id,
            &crate::service::notifications::NotificationEvent::AgentRunReady {
                workspace_id: workspace_id.clone(),
                conversation_id: conversation_id.clone(),
                run_id: run_id.to_string(),
            },
            chrono::Utc::now().date_naive(),
        )
        .await
        .map_err(|error| {
            log::error!("failed to record agent completion notification: {error:#}");
            AgentError::Internal
        })?;
        tx.commit().await?;
        Ok(CompletedAgentAnswer {
            message: message_from_row(&message)?,
            terminal_event_sequence: event_sequence,
        })
    }
}

fn validate_claims(answer: &AnswerDraft) -> AgentResult<()> {
    let mut claim_ids = HashSet::new();
    for claim in &answer.claims {
        if claim.claim_id.trim().is_empty()
            || claim.text.trim().is_empty()
            || !(1..=5).contains(&claim.evidence_ids.len())
            || !claim_ids.insert(claim.claim_id.as_str())
        {
            return Err(AgentError::Validation(
                "factual claims require a unique id, text, and 1 to 5 evidence records".into(),
            ));
        }
        if claim.evidence_ids.iter().collect::<HashSet<_>>().len() != claim.evidence_ids.len() {
            return Err(AgentError::Validation(
                "claim evidence cannot contain duplicates".into(),
            ));
        }
    }
    Ok(())
}
