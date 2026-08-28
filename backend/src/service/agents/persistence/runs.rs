use chrono::{DateTime, Duration, Utc};
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use super::AgentStore;
use crate::service::agents::runtime::provider_failure::ProviderFailure;
use crate::service::agents::{AgentActor, AgentError, AgentResult, AgentRun, AgentRunStatus};
use tinyagents::harness::usage::UsageTotals;

#[derive(Clone, Debug)]
pub struct CreateAgentRun {
    pub conversation_id: String,
    pub parent_run_id: Option<String>,
    pub input_message_id: Option<String>,
    pub idempotency_key: String,
}

fn status(value: &str) -> AgentResult<AgentRunStatus> {
    match value {
        "queued" => Ok(AgentRunStatus::Queued),
        "running" => Ok(AgentRunStatus::Running),
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
        output_message_id: row.try_get("output_message_id")?,
        status: status(row.try_get::<String, _>("status")?.as_str())?,
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
    pub async fn create_subagent_run(
        &self,
        parent_run_id: &str,
        child_run_id: &str,
        role: &str,
        call_id: &str,
    ) -> AgentResult<()> {
        let mut tx = self.pool().begin().await?;
        sqlx::query(
            "DELETE FROM agent_runs
             WHERE id=$1 AND parent_run_id=$2 AND status IN ('failed','cancelled')",
        )
        .bind(child_run_id)
        .bind(parent_run_id)
        .execute(&mut *tx)
        .await?;
        let inserted = sqlx::query(
            "INSERT INTO agent_runs
             (id,conversation_id,user_id,workspace_id,parent_run_id,input_message_id,status,
              idempotency_key,lease_owner,leased_at,heartbeat_at,attempt_count)
             SELECT $1,conversation_id,user_id,workspace_id,id,input_message_id,'running',
                    $2,lease_owner,now(),now(),1
             FROM agent_runs WHERE id=$3 AND status='running'
             ON CONFLICT (id) DO NOTHING",
        )
        .bind(child_run_id)
        .bind(format!("subagent:{parent_run_id}:{role}:{call_id}"))
        .bind(parent_run_id)
        .execute(&mut *tx)
        .await?;
        if inserted.rows_affected() != 1 {
            return Err(AgentError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn record_subagent_usage(
        &self,
        parent_run_id: &str,
        child_run_id: &str,
        usage: UsageTotals,
    ) -> AgentResult<()> {
        let calls = i64::try_from(usage.calls).map_err(|_| AgentError::Internal)?;
        let input = i64::try_from(usage.usage.input_tokens).map_err(|_| AgentError::Internal)?;
        let output = i64::try_from(usage.usage.output_tokens).map_err(|_| AgentError::Internal)?;
        let cached =
            i64::try_from(usage.usage.cache_read_tokens).map_err(|_| AgentError::Internal)?;
        let updated = sqlx::query(
            "UPDATE agent_runs SET model_calls=model_calls+$1,input_tokens=input_tokens+$2,
             output_tokens=output_tokens+$3,cached_input_tokens=cached_input_tokens+$4,
             updated_at=now() WHERE id=ANY($5) AND status='running'",
        )
        .bind(calls)
        .bind(input)
        .bind(output)
        .bind(cached)
        .bind(vec![parent_run_id, child_run_id])
        .execute(self.pool())
        .await?;
        if updated.rows_affected() != 2 {
            return Err(AgentError::Conflict);
        }
        Ok(())
    }

    pub async fn complete_subagent_run(&self, child_run_id: &str) -> AgentResult<()> {
        terminal_subagent_run(self, child_run_id, "completed", None).await
    }

    pub async fn fail_subagent_run(&self, child_run_id: &str, error_code: &str) -> AgentResult<()> {
        terminal_subagent_run(self, child_run_id, "failed", Some(error_code)).await
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
              status, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *",
        )
        .bind(&id)
        .bind(&input.conversation_id)
        .bind(&actor.user_id)
        .bind(&workspace_id)
        .bind(&input.parent_run_id)
        .bind(&input.input_message_id)
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
        sqlx::query(
            "UPDATE agent_runs SET status='failed', error_code='parent_lease_expired',
             completed_at=now(), updated_at=now()
             WHERE parent_run_id=$1 AND status='running'",
        )
        .bind(&id)
        .execute(&mut *tx)
        .await?;
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

    pub async fn fail_claimed_run_with_provider_failure(
        &self,
        run_id: &str,
        lease_owner: &str,
        failure: &ProviderFailure,
    ) -> AgentResult<bool> {
        terminal_claimed_run(
            self,
            run_id,
            lease_owner,
            "failed",
            "run_failed",
            Some(&failure.error_code),
            &failure.event_payload(),
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

async fn terminal_subagent_run(
    store: &AgentStore,
    child_run_id: &str,
    status: &str,
    error_code: Option<&str>,
) -> AgentResult<()> {
    let mut tx = store.pool().begin().await?;
    let row = sqlx::query(
        "UPDATE agent_runs SET status=$1,error_code=$2,completed_at=now(),updated_at=now(),
         next_event_sequence=next_event_sequence+1,lease_owner=NULL
         WHERE id=$3 AND parent_run_id IS NOT NULL AND status='running'
         RETURNING user_id,workspace_id,next_event_sequence-1 AS event_sequence",
    )
    .bind(status)
    .bind(error_code)
    .bind(child_run_id)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(row) = row else {
        return Err(AgentError::Conflict);
    };
    sqlx::query(
        "INSERT INTO agent_run_events
         (id,run_id,user_id,workspace_id,sequence,kind,payload_json)
         VALUES($1,$2,$3,$4,$5,$6,$7)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(child_run_id)
    .bind(row.try_get::<String, _>("user_id")?)
    .bind(row.try_get::<String, _>("workspace_id")?)
    .bind(row.try_get::<i64, _>("event_sequence")?)
    .bind(if status == "completed" {
        "run_completed"
    } else {
        "run_failed"
    })
    .bind(error_code.map_or_else(|| json!({}), |code| json!({"errorCode": code})))
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
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
    let (child_status, child_event, child_error) = if terminal_status == "cancelled" {
        ("cancelled", "run_cancelled", None)
    } else {
        ("failed", "run_failed", Some("parent_run_failed"))
    };
    let children = sqlx::query(
        "UPDATE agent_runs SET status = $1, error_code = $2,
         completed_at = now(), updated_at = now(), next_event_sequence = next_event_sequence + 1
         WHERE parent_run_id = $3 AND status = 'running'
         RETURNING id, user_id, workspace_id, next_event_sequence - 1 AS event_sequence",
    )
    .bind(child_status)
    .bind(child_error)
    .bind(run_id)
    .fetch_all(&mut *tx)
    .await?;
    for child in children {
        let child_payload = child_error
            .map(|code| json!({ "errorCode": code }))
            .unwrap_or_else(|| json!({}));
        sqlx::query(
            "INSERT INTO agent_run_events
             (id, run_id, user_id, workspace_id, sequence, kind, payload_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(child.try_get::<String, _>("id")?)
        .bind(child.try_get::<String, _>("user_id")?)
        .bind(child.try_get::<String, _>("workspace_id")?)
        .bind(child.try_get::<i64, _>("event_sequence")?)
        .bind(child_event)
        .bind(child_payload)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(true)
}
