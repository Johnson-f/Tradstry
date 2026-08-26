use chrono::{DateTime, Duration, Utc};
use serde_json::Value;
use sqlx::Row;
use uuid::Uuid;

use super::AgentStore;
use crate::service::agents::{
    AgentActionExecutionJob, AgentActionPayload, AgentActionPreview, AgentActionProposal,
    AgentActor, AgentError, AgentResult,
};

impl AgentStore {
    pub async fn claim_action_execution(
        &self,
        lease_owner: &str,
        lease_seconds: u64,
    ) -> AgentResult<Option<AgentActionExecutionJob>> {
        let stale_before = Utc::now() - Duration::seconds(lease_seconds as i64);
        let mut tx = self.pool().begin().await?;
        let row = sqlx::query(
            "SELECT e.id AS execution_id,e.attempt_count,p.* FROM agent_action_executions e
             JOIN agent_action_proposals p ON p.id=e.proposal_id
             WHERE e.attempt_count<e.max_attempts AND
               (e.status='queued' OR (e.status='running' AND COALESCE(e.heartbeat_at,e.leased_at)<$1))
             ORDER BY e.created_at,e.id LIMIT 1 FOR UPDATE OF e SKIP LOCKED",
        ).bind(stale_before).fetch_optional(&mut *tx).await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(None);
        };
        let execution_id: String = row.try_get("execution_id")?;
        let attempt_count: i32 = row.try_get("attempt_count")?;
        sqlx::query(
            "UPDATE agent_action_executions SET status='running',lease_owner=$1,leased_at=now(),
             heartbeat_at=now(),attempt_count=attempt_count+1,updated_at=now() WHERE id=$2",
        )
        .bind(lease_owner)
        .bind(&execution_id)
        .execute(&mut *tx)
        .await?;
        let proposal = proposal_from_row(&row)?;
        tx.commit().await?;
        Ok(Some(AgentActionExecutionJob {
            id: execution_id,
            proposal,
            attempt_count: attempt_count + 1,
        }))
    }

    pub async fn fail_action_execution(
        &self,
        execution_id: &str,
        lease_owner: &str,
        error_code: &str,
    ) -> AgentResult<bool> {
        let mut tx = self.pool().begin().await?;
        let proposal_id: Option<String> = sqlx::query_scalar(
            "UPDATE agent_action_executions SET status='failed',error_code=$3,completed_at=now(),
             updated_at=now(),lease_owner=NULL,leased_at=NULL,heartbeat_at=NULL
             WHERE id=$1 AND lease_owner=$2 AND status='running' RETURNING proposal_id",
        )
        .bind(execution_id)
        .bind(lease_owner)
        .bind(error_code)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(proposal_id) = proposal_id else {
            tx.commit().await?;
            return Ok(false);
        };
        sqlx::query("UPDATE agent_action_proposals SET status='failed',error_code=$2,updated_at=now() WHERE id=$1")
            .bind(proposal_id).bind(error_code).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn create_action_proposal(
        &self,
        actor: &AgentActor,
        run_id: &str,
        payload: &AgentActionPayload,
        preview: &AgentActionPreview,
        ttl_minutes: i64,
    ) -> AgentResult<AgentActionProposal> {
        let ttl_minutes = ttl_minutes.clamp(1, 60);
        let row = sqlx::query(
            "INSERT INTO agent_action_proposals
             (id,run_id,conversation_id,user_id,workspace_id,kind,payload_json,preview_json,
              expected_versions_json,expires_at)
             SELECT $1,r.id,r.conversation_id,r.user_id,r.workspace_id,$4,$5,$6,$7,$8
             FROM agent_runs r WHERE r.id=$2 AND r.user_id=$3 RETURNING *",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(&actor.user_id)
        .bind(payload.kind())
        .bind(serde_json::to_value(payload).map_err(|_| AgentError::Internal)?)
        .bind(serde_json::to_value(preview).map_err(|_| AgentError::Internal)?)
        .bind(expected_versions(payload))
        .bind(Utc::now() + Duration::minutes(ttl_minutes))
        .fetch_optional(self.pool())
        .await?;
        row.as_ref()
            .map(proposal_from_row)
            .transpose()?
            .ok_or(AgentError::NotFound)
    }

    pub async fn approve_action_proposal(
        &self,
        actor: &AgentActor,
        proposal_id: &str,
        idempotency_key: &str,
    ) -> AgentResult<AgentActionProposal> {
        if idempotency_key.trim().is_empty() || idempotency_key.len() > 200 {
            return Err(AgentError::Validation(
                "invalid action idempotency key".into(),
            ));
        }
        let mut tx = self.pool().begin().await?;
        let row = sqlx::query(
            "SELECT * FROM agent_action_proposals WHERE id=$1 AND user_id=$2 FOR UPDATE",
        )
        .bind(proposal_id)
        .bind(&actor.user_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(mut row) = row else {
            return Err(AgentError::NotFound);
        };
        let status: String = row.try_get("status")?;
        let expires_at: DateTime<Utc> = row.try_get("expires_at")?;
        if status != "pending" {
            let same_key: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM agent_action_executions
                 WHERE proposal_id=$1 AND user_id=$2 AND idempotency_key=$3)",
            )
            .bind(proposal_id)
            .bind(&actor.user_id)
            .bind(idempotency_key.trim())
            .fetch_one(&mut *tx)
            .await?;
            if same_key {
                tx.commit().await?;
                return proposal_from_row(&row);
            }
            return Err(AgentError::Conflict);
        }
        if expires_at <= Utc::now() {
            sqlx::query(
                "UPDATE agent_action_proposals SET status='expired',updated_at=now() WHERE id=$1",
            )
            .bind(proposal_id)
            .execute(&mut *tx)
            .await?;
            tx.commit().await?;
            return Err(AgentError::Conflict);
        }
        sqlx::query(
            "INSERT INTO agent_action_executions
             (id,proposal_id,user_id,workspace_id,idempotency_key)
             VALUES ($1,$2,$3,$4,$5)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(proposal_id)
        .bind(&actor.user_id)
        .bind(row.try_get::<String, _>("workspace_id")?)
        .bind(idempotency_key.trim())
        .execute(&mut *tx)
        .await
        .map_err(|_| AgentError::Conflict)?;
        row = sqlx::query(
            "UPDATE agent_action_proposals SET status='approved',approved_by_user_id=$1,
             approved_by_clerk_id=$2,approved_at=now(),updated_at=now() WHERE id=$3 RETURNING *",
        )
        .bind(&actor.user_id)
        .bind(&actor.clerk_id)
        .bind(proposal_id)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        proposal_from_row(&row)
    }

    pub async fn reject_action_proposal(
        &self,
        actor: &AgentActor,
        proposal_id: &str,
    ) -> AgentResult<AgentActionProposal> {
        let row = sqlx::query(
            "UPDATE agent_action_proposals SET status='rejected',rejected_at=now(),updated_at=now()
             WHERE id=$1 AND user_id=$2 AND status='pending' AND expires_at>now() RETURNING *",
        )
        .bind(proposal_id)
        .bind(&actor.user_id)
        .fetch_optional(self.pool())
        .await?;
        row.as_ref()
            .map(proposal_from_row)
            .transpose()?
            .ok_or(AgentError::Conflict)
    }

    pub async fn get_action_proposal(
        &self,
        actor: &AgentActor,
        proposal_id: &str,
    ) -> AgentResult<AgentActionProposal> {
        let row = sqlx::query("SELECT * FROM agent_action_proposals WHERE id=$1 AND user_id=$2")
            .bind(proposal_id)
            .bind(&actor.user_id)
            .fetch_optional(self.pool())
            .await?;
        row.as_ref()
            .map(proposal_from_row)
            .transpose()?
            .ok_or(AgentError::NotFound)
    }
}

fn expected_versions(payload: &AgentActionPayload) -> Value {
    match payload {
        AgentActionPayload::UpdatePlaybook(input) => {
            serde_json::json!({"playbook": input.expected_version})
        }
        AgentActionPayload::AddTradeTag(input) | AgentActionPayload::RemoveTradeTag(input) => {
            serde_json::json!({"trade": input.expected_trade_version})
        }
        AgentActionPayload::CreateNotebookNote(_) => serde_json::json!({}),
    }
}

fn proposal_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentActionProposal> {
    let expires_at: DateTime<Utc> = row.try_get("expires_at")?;
    let created_at: DateTime<Utc> = row.try_get("created_at")?;
    let updated_at: DateTime<Utc> = row.try_get("updated_at")?;
    Ok(AgentActionProposal {
        id: row.try_get("id")?,
        run_id: row.try_get("run_id")?,
        conversation_id: row.try_get("conversation_id")?,
        user_id: row.try_get("user_id")?,
        workspace_id: row.try_get("workspace_id")?,
        kind: row.try_get("kind")?,
        payload: serde_json::from_value(row.try_get("payload_json")?)
            .map_err(|_| AgentError::Internal)?,
        preview: serde_json::from_value(row.try_get("preview_json")?)
            .map_err(|_| AgentError::Internal)?,
        status: row.try_get("status")?,
        expires_at: expires_at.to_rfc3339(),
        created_at: created_at.to_rfc3339(),
        updated_at: updated_at.to_rfc3339(),
    })
}
