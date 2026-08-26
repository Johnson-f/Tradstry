use chrono::{DateTime, Duration, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use super::AgentStore;
use crate::service::agents::execution::stages::DeepStageTransition;
use crate::service::agents::{
    AgentActor, AgentError, AgentLane, AgentResult, AgentRun, AgentRunStatus,
};
use sha2::{Digest, Sha256};
use tinyagents::harness::usage::UsageTotals;

#[derive(Clone, Debug)]
pub struct CreateAgentRun {
    pub conversation_id: String,
    pub lane: AgentLane,
    pub parent_run_id: Option<String>,
    pub input_message_id: Option<String>,
    pub idempotency_key: String,
}

fn lane(value: &str) -> AgentResult<AgentLane> {
    match value {
        "instant" => Ok(AgentLane::Instant),
        "fast_ai" => Ok(AgentLane::FastAi),
        "deep" => Ok(AgentLane::Deep),
        _ => Err(AgentError::Internal),
    }
}

fn status(value: &str) -> AgentResult<AgentRunStatus> {
    match value {
        "queued" => Ok(AgentRunStatus::Queued),
        "running" => Ok(AgentRunStatus::Running),
        "waiting_for_approval" => Ok(AgentRunStatus::WaitingForApproval),
        "completed" => Ok(AgentRunStatus::Completed),
        "failed" => Ok(AgentRunStatus::Failed),
        "cancelled" => Ok(AgentRunStatus::Cancelled),
        _ => Err(AgentError::Internal),
    }
}

fn optional_timestamp(value: Option<DateTime<Utc>>) -> Option<String> {
    value.map(|value| value.to_rfc3339_opts(chrono::SecondsFormat::Micros, true))
}

pub(super) fn run_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentRun> {
    let created_at: DateTime<Utc> = row.try_get("created_at")?;
    let updated_at: DateTime<Utc> = row.try_get("updated_at")?;
    Ok(AgentRun {
        id: row.try_get("id")?,
        conversation_id: row.try_get("conversation_id")?,
        user_id: row.try_get("user_id")?,
        workspace_id: row.try_get("workspace_id")?,
        parent_run_id: row.try_get("parent_run_id")?,
        input_message_id: row.try_get("input_message_id")?,
        lane: lane(row.try_get::<String, _>("lane")?.as_str())?,
        status: status(row.try_get::<String, _>("status")?.as_str())?,
        stage: row.try_get("stage")?,
        model_calls: row.try_get("model_calls")?,
        tool_calls: row.try_get("tool_calls")?,
        input_tokens: row.try_get("input_tokens")?,
        output_tokens: row.try_get("output_tokens")?,
        cached_input_tokens: row.try_get("cached_input_tokens")?,
        estimated_cost_micros: row.try_get("estimated_cost_micros")?,
        error_code: row.try_get("error_code")?,
        created_at: created_at.to_rfc3339_opts(chrono::SecondsFormat::Micros, true),
        updated_at: updated_at.to_rfc3339_opts(chrono::SecondsFormat::Micros, true),
        completed_at: optional_timestamp(row.try_get("completed_at")?),
    })
}

impl AgentStore {
    pub async fn advance_deep_stage(
        &self,
        run_id: &str,
        lease_owner: &str,
        transition: DeepStageTransition<'_>,
    ) -> AgentResult<bool> {
        if !transition.expected.can_advance_to(transition.next)
            || transition.event_kind.trim().is_empty()
        {
            return Err(AgentError::Validation(
                "deep-run stages must advance exactly one step with a named event".into(),
            ));
        }
        let mut tx = self.pool().begin().await?;
        let row = sqlx::query(
            "SELECT user_id, workspace_id, next_event_sequence FROM agent_runs
             WHERE id = $1 AND lease_owner = $2 AND status = 'running' AND stage = $3
             FOR UPDATE",
        )
        .bind(run_id)
        .bind(lease_owner)
        .bind(transition.expected.as_str())
        .fetch_optional(&mut *tx)
        .await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(false);
        };
        let sequence: i64 = row.try_get("next_event_sequence")?;
        let user_id: String = row.try_get("user_id")?;
        let workspace_id: String = row.try_get("workspace_id")?;
        sqlx::query(
            "INSERT INTO agent_checkpoints
             (id, run_id, user_id, workspace_id, stage, sequence, state_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (run_id, stage) DO NOTHING",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(&user_id)
        .bind(&workspace_id)
        .bind(transition.next.as_str())
        .bind(sequence)
        .bind(transition.checkpoint)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO agent_run_events
             (id, run_id, user_id, workspace_id, sequence, kind, payload_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(&user_id)
        .bind(&workspace_id)
        .bind(sequence)
        .bind(transition.event_kind.trim())
        .bind(transition.event_payload)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE agent_runs SET stage = $1, next_event_sequence = next_event_sequence + 1,
             updated_at = now() WHERE id = $2",
        )
        .bind(transition.next.as_str())
        .bind(run_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn record_claimed_model_usage(
        &self,
        run_id: &str,
        lease_owner: &str,
        usage: UsageTotals,
    ) -> AgentResult<bool> {
        let result = sqlx::query(
            "UPDATE agent_runs SET model_calls = model_calls + $1,
             input_tokens = input_tokens + $2,
             output_tokens = output_tokens + $3,
             cached_input_tokens = cached_input_tokens + $4,
             updated_at = now()
             WHERE id = $5 AND lease_owner = $6 AND status = 'running'",
        )
        .bind(i64::try_from(usage.calls).map_err(|_| AgentError::Internal)?)
        .bind(i64::try_from(usage.usage.input_tokens).map_err(|_| AgentError::Internal)?)
        .bind(i64::try_from(usage.usage.output_tokens).map_err(|_| AgentError::Internal)?)
        .bind(i64::try_from(usage.usage.cache_read_tokens).map_err(|_| AgentError::Internal)?)
        .bind(run_id)
        .bind(lease_owner)
        .execute(self.pool())
        .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn route_claimed_run(
        &self,
        run_id: &str,
        lease_owner: &str,
        lane: AgentLane,
    ) -> AgentResult<bool> {
        let mut tx = self.pool().begin().await?;
        let row = sqlx::query(
            "SELECT user_id, workspace_id, next_event_sequence FROM agent_runs
             WHERE id = $1 AND lease_owner = $2 AND status = 'running' AND stage = 'queued'
             FOR UPDATE",
        )
        .bind(run_id)
        .bind(lease_owner)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(false);
        };
        let sequence: i64 = row.try_get("next_event_sequence")?;
        sqlx::query(
            "UPDATE agent_runs SET lane = $1, stage = 'routed',
             next_event_sequence = next_event_sequence + 1, updated_at = now()
             WHERE id = $2",
        )
        .bind(lane.as_str())
        .bind(run_id)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO agent_run_events
             (id, run_id, user_id, workspace_id, sequence, kind, payload_json)
             VALUES ($1, $2, $3, $4, $5, 'route_selected', $6)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(row.try_get::<String, _>("user_id")?)
        .bind(row.try_get::<String, _>("workspace_id")?)
        .bind(sequence)
        .bind(json!({ "lane": lane.as_str() }))
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn create_run(
        &self,
        actor: &AgentActor,
        input: &CreateAgentRun,
    ) -> AgentResult<AgentRun> {
        if input.idempotency_key.trim().is_empty() || input.idempotency_key.len() > 200 {
            return Err(AgentError::Validation(
                "run idempotency key must contain 1 to 200 bytes".into(),
            ));
        }
        let mut tx = self.pool().begin().await?;
        let conversation = sqlx::query(
            "SELECT workspace_id FROM agent_conversations
             WHERE id = $1 AND user_id = $2 FOR UPDATE",
        )
        .bind(&input.conversation_id)
        .bind(&actor.user_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(conversation) = conversation else {
            return Err(AgentError::NotFound);
        };
        let workspace_id: String = conversation.try_get("workspace_id")?;
        if let Some(parent_run_id) = &input.parent_run_id {
            let parent_is_owned: bool = sqlx::query_scalar(
                "SELECT EXISTS (
                    SELECT 1 FROM agent_runs WHERE id = $1 AND user_id = $2
                    AND conversation_id = $3
                 )",
            )
            .bind(parent_run_id)
            .bind(&actor.user_id)
            .bind(&input.conversation_id)
            .fetch_one(&mut *tx)
            .await?;
            if !parent_is_owned {
                return Err(AgentError::NotFound);
            }
        }
        let id = Uuid::new_v4().to_string();
        let inserted = sqlx::query(
            "INSERT INTO agent_runs
             (id, conversation_id, user_id, workspace_id, parent_run_id, input_message_id,
              lane, status, stage, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', 'queued', $8)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *",
        )
        .bind(&id)
        .bind(&input.conversation_id)
        .bind(&actor.user_id)
        .bind(&workspace_id)
        .bind(&input.parent_run_id)
        .bind(&input.input_message_id)
        .bind(input.lane.as_str())
        .bind(input.idempotency_key.trim())
        .fetch_optional(&mut *tx)
        .await?;
        let row = match inserted {
            Some(row) => row,
            None => {
                let row = sqlx::query(
                    "SELECT * FROM agent_runs WHERE user_id = $1 AND idempotency_key = $2",
                )
                .bind(&actor.user_id)
                .bind(input.idempotency_key.trim())
                .fetch_one(&mut *tx)
                .await?;
                let existing_conversation: String = row.try_get("conversation_id")?;
                if existing_conversation != input.conversation_id {
                    return Err(AgentError::Conflict);
                }
                row
            }
        };
        tx.commit().await?;
        run_from_row(&row)
    }

    pub async fn get_run(&self, actor: &AgentActor, run_id: &str) -> AgentResult<AgentRun> {
        let row = sqlx::query("SELECT * FROM agent_runs WHERE id = $1 AND user_id = $2")
            .bind(run_id)
            .bind(&actor.user_id)
            .fetch_optional(self.pool())
            .await?;
        match row {
            Some(row) => run_from_row(&row),
            None => Err(AgentError::NotFound),
        }
    }

    pub async fn claim_run(
        &self,
        lease_owner: &str,
        lease_seconds: u64,
    ) -> AgentResult<Option<AgentRun>> {
        let mut tx = self.pool().begin().await?;
        let stale_before = Utc::now() - Duration::seconds(lease_seconds as i64);
        let row = sqlx::query(
            "SELECT * FROM agent_runs
             WHERE attempt_count < max_attempts
               AND parent_run_id IS NULL
               AND cancel_requested_at IS NULL
               AND (
                   status = 'queued'
                   OR (status = 'running' AND COALESCE(heartbeat_at, leased_at) < $1)
               )
             ORDER BY created_at ASC
             LIMIT 1 FOR UPDATE SKIP LOCKED",
        )
        .bind(stale_before)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(None);
        };
        let id: String = row.try_get("id")?;
        let updated = sqlx::query(
            "UPDATE agent_runs SET status = 'running', lease_owner = $1,
             leased_at = now(), heartbeat_at = now(), attempt_count = attempt_count + 1,
             updated_at = now() WHERE id = $2 RETURNING *",
        )
        .bind(lease_owner)
        .bind(&id)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        run_from_row(&updated).map(Some)
    }

    pub async fn get_or_claim_specialist_child(
        &self,
        parent_run_id: &str,
        parent_lease_owner: &str,
        specialist: &str,
        corrective_round: u8,
    ) -> AgentResult<AgentRun> {
        let mut tx = self.pool().begin().await?;
        let parent = sqlx::query(
            "SELECT conversation_id, user_id, workspace_id, input_message_id
             FROM agent_runs WHERE id = $1 AND lease_owner = $2 AND status = 'running'
             FOR UPDATE",
        )
        .bind(parent_run_id)
        .bind(parent_lease_owner)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(AgentError::Conflict)?;
        let digest = Sha256::digest(format!("{parent_run_id}:{specialist}:{corrective_round}"));
        let child_id = format!("specialist-{}", hex::encode(&digest[..16]));
        let idempotency_key = format!("specialist:{parent_run_id}:{specialist}:{corrective_round}");
        sqlx::query(
            "INSERT INTO agent_runs
             (id, conversation_id, user_id, workspace_id, parent_run_id, input_message_id,
              lane, status, stage, idempotency_key, lease_owner, leased_at, heartbeat_at,
              attempt_count)
             VALUES ($1, $2, $3, $4, $5, $6, 'deep', 'running', 'specialist_running',
                     $7, $8, now(), now(), 1)
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(&child_id)
        .bind(parent.try_get::<String, _>("conversation_id")?)
        .bind(parent.try_get::<String, _>("user_id")?)
        .bind(parent.try_get::<String, _>("workspace_id")?)
        .bind(parent_run_id)
        .bind(parent.try_get::<Option<String>, _>("input_message_id")?)
        .bind(idempotency_key)
        .bind(parent_lease_owner)
        .execute(&mut *tx)
        .await?;
        let row = sqlx::query("SELECT * FROM agent_runs WHERE id = $1 FOR UPDATE")
            .bind(&child_id)
            .fetch_one(&mut *tx)
            .await?;
        let child_status: String = row.try_get("status")?;
        let row = if child_status == "running" {
            sqlx::query(
                "UPDATE agent_runs SET lease_owner = $1, leased_at = now(), heartbeat_at = now(),
                 attempt_count = CASE WHEN lease_owner IS DISTINCT FROM $1
                                      THEN attempt_count + 1 ELSE attempt_count END,
                 updated_at = now() WHERE id = $2 RETURNING *",
            )
            .bind(parent_lease_owner)
            .bind(&child_id)
            .fetch_one(&mut *tx)
            .await?
        } else {
            row
        };
        tx.commit().await?;
        run_from_row(&row)
    }

    pub async fn complete_specialist_child(
        &self,
        child_run_id: &str,
        lease_owner: &str,
        finding: &Value,
    ) -> AgentResult<bool> {
        let mut tx = self.pool().begin().await?;
        let row = sqlx::query(
            "SELECT user_id, workspace_id, next_event_sequence FROM agent_runs
             WHERE id = $1 AND parent_run_id IS NOT NULL AND lease_owner = $2
               AND status = 'running' FOR UPDATE",
        )
        .bind(child_run_id)
        .bind(lease_owner)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(false);
        };
        let sequence: i64 = row.try_get("next_event_sequence")?;
        let user_id: String = row.try_get("user_id")?;
        let workspace_id: String = row.try_get("workspace_id")?;
        sqlx::query(
            "INSERT INTO agent_checkpoints
             (id, run_id, user_id, workspace_id, stage, sequence, state_json)
             VALUES ($1, $2, $3, $4, 'specialist_completed', $5, $6)
             ON CONFLICT (run_id, stage) DO UPDATE SET state_json = EXCLUDED.state_json,
                 sequence = EXCLUDED.sequence, updated_at = now()",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(child_run_id)
        .bind(&user_id)
        .bind(&workspace_id)
        .bind(sequence)
        .bind(finding)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "INSERT INTO agent_run_events
             (id, run_id, user_id, workspace_id, sequence, kind, payload_json)
             VALUES ($1, $2, $3, $4, $5, 'specialist_completed', '{}')",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(child_run_id)
        .bind(&user_id)
        .bind(&workspace_id)
        .bind(sequence)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE agent_runs SET status = 'completed', stage = 'specialist_completed',
             next_event_sequence = next_event_sequence + 1, completed_at = now(),
             updated_at = now() WHERE id = $1",
        )
        .bind(child_run_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn completed_specialist_finding(
        &self,
        child_run_id: &str,
        parent_run_id: &str,
    ) -> AgentResult<Option<Value>> {
        sqlx::query_scalar(
            "SELECT c.state_json FROM agent_checkpoints c
             JOIN agent_runs r ON r.id = c.run_id
             WHERE r.id = $1 AND r.parent_run_id = $2 AND r.status = 'completed'
               AND c.stage = 'specialist_completed'",
        )
        .bind(child_run_id)
        .bind(parent_run_id)
        .fetch_optional(self.pool())
        .await
        .map_err(Into::into)
    }

    pub async fn evidence_ids_for_run_tree(&self, parent_run_id: &str) -> AgentResult<Vec<String>> {
        sqlx::query_scalar(
            "SELECT e.id FROM agent_evidence e
             JOIN agent_runs r ON r.id = e.run_id
             WHERE r.id = $1 OR r.parent_run_id = $1
             ORDER BY e.created_at, e.id",
        )
        .bind(parent_run_id)
        .fetch_all(self.pool())
        .await
        .map_err(Into::into)
    }

    pub async fn heartbeat(&self, run_id: &str, lease_owner: &str) -> AgentResult<bool> {
        let result = sqlx::query(
            "UPDATE agent_runs SET heartbeat_at = now(), updated_at = now()
             WHERE id = $1 AND lease_owner = $2 AND status = 'running'",
        )
        .bind(run_id)
        .bind(lease_owner)
        .execute(self.pool())
        .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn claimed_run_cancel_requested(
        &self,
        run_id: &str,
        lease_owner: &str,
    ) -> AgentResult<bool> {
        Ok(sqlx::query_scalar(
            "SELECT cancel_requested_at IS NOT NULL FROM agent_runs
             WHERE id=$1 AND lease_owner=$2 AND status='running'",
        )
        .bind(run_id)
        .bind(lease_owner)
        .fetch_optional(self.pool())
        .await?
        .unwrap_or(true))
    }

    pub async fn request_cancel(&self, actor: &AgentActor, run_id: &str) -> AgentResult<bool> {
        let mut tx = self.pool().begin().await?;
        let row = sqlx::query(
            "SELECT status, cancel_requested_at, user_id, workspace_id, next_event_sequence
             FROM agent_runs WHERE id = $1 AND user_id = $2 FOR UPDATE",
        )
        .bind(run_id)
        .bind(&actor.user_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(row) = row else {
            return Err(AgentError::NotFound);
        };
        let current_status: String = row.try_get("status")?;
        if current_status == "cancelled"
            || row
                .try_get::<Option<DateTime<Utc>>, _>("cancel_requested_at")?
                .is_some()
        {
            tx.commit().await?;
            return Ok(true);
        }
        if matches!(current_status.as_str(), "completed" | "failed") {
            tx.commit().await?;
            return Ok(false);
        }
        let terminal = current_status == "queued";
        sqlx::query(
            "UPDATE agent_runs SET cancel_requested_at = now(),
             status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
             completed_at = CASE WHEN status = 'queued' THEN now() ELSE completed_at END,
             updated_at = now() WHERE id = $1",
        )
        .bind(run_id)
        .execute(&mut *tx)
        .await?;
        let sequence: i64 = row.try_get("next_event_sequence")?;
        sqlx::query(
            "INSERT INTO agent_run_events
             (id, run_id, user_id, workspace_id, sequence, kind, payload_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(row.try_get::<String, _>("user_id")?)
        .bind(row.try_get::<String, _>("workspace_id")?)
        .bind(sequence)
        .bind(if terminal {
            "run_cancelled"
        } else {
            "cancel_requested"
        })
        .bind(json!({}))
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE agent_runs SET next_event_sequence = next_event_sequence + 1 WHERE id = $1",
        )
        .bind(run_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn fail_claimed_run(
        &self,
        run_id: &str,
        lease_owner: &str,
        error_code: &str,
    ) -> AgentResult<bool> {
        terminal_claimed_run(
            self,
            run_id,
            lease_owner,
            "failed",
            "run_failed",
            Some(error_code),
            &json!({ "errorCode": error_code }),
        )
        .await
    }

    pub async fn cancel_claimed_run(&self, run_id: &str, lease_owner: &str) -> AgentResult<bool> {
        terminal_claimed_run(
            self,
            run_id,
            lease_owner,
            "cancelled",
            "run_cancelled",
            None,
            &json!({}),
        )
        .await
    }
}

async fn terminal_claimed_run(
    store: &AgentStore,
    run_id: &str,
    lease_owner: &str,
    terminal_status: &str,
    event_kind: &str,
    error_code: Option<&str>,
    payload: &Value,
) -> AgentResult<bool> {
    let mut tx = store.pool().begin().await?;
    let row = sqlx::query(
        "SELECT user_id, workspace_id, next_event_sequence FROM agent_runs
         WHERE id = $1 AND lease_owner = $2 AND status = 'running' FOR UPDATE",
    )
    .bind(run_id)
    .bind(lease_owner)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(row) = row else {
        tx.commit().await?;
        return Ok(false);
    };
    let sequence: i64 = row.try_get("next_event_sequence")?;
    sqlx::query(
        "UPDATE agent_runs SET status = $1, error_code = $2, completed_at = now(),
         updated_at = now(), next_event_sequence = next_event_sequence + 1 WHERE id = $3",
    )
    .bind(terminal_status)
    .bind(error_code)
    .bind(run_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "INSERT INTO agent_run_events
         (id, run_id, user_id, workspace_id, sequence, kind, payload_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(run_id)
    .bind(row.try_get::<String, _>("user_id")?)
    .bind(row.try_get::<String, _>("workspace_id")?)
    .bind(sequence)
    .bind(event_kind)
    .bind(payload)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(true)
}
