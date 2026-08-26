use chrono::{DateTime, Utc};
use pgvector::HalfVector;
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

use super::AgentStore;
use crate::service::agents::{
    AgentActor, AgentError, AgentMemoryJob, AgentMemoryKind, AgentMemoryRecord, AgentMemoryStatus,
    AgentResult,
};

#[derive(Clone, Debug)]
pub struct ActivateAgentMemory {
    pub workspace_id: Option<String>,
    pub kind: AgentMemoryKind,
    pub subject_key: String,
    pub text: String,
    pub source_conversation_id: String,
    pub source_message_id: String,
    pub provenance_excerpt: String,
    pub confidence: f64,
    pub extraction_version: String,
    pub status: AgentMemoryStatus,
}

impl AgentStore {
    pub async fn claim_memory_job(
        &self,
        lease_owner: &str,
        lease_seconds: u64,
    ) -> AgentResult<Option<AgentMemoryJob>> {
        let mut tx = self.pool().begin().await?;
        let stale_before = Utc::now() - chrono::Duration::seconds(lease_seconds as i64);
        let row = sqlx::query(
            "SELECT * FROM agent_memory_jobs WHERE attempt_count < max_attempts
             AND (status = 'queued' OR (status = 'running' AND COALESCE(heartbeat_at, leased_at) < $1))
             ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED",
        )
        .bind(stale_before)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(None);
        };
        let id: String = row.try_get("id")?;
        let row = sqlx::query(
            "UPDATE agent_memory_jobs SET status='running', lease_owner=$1, leased_at=now(),
             heartbeat_at=now(), attempt_count=attempt_count+1, updated_at=now()
             WHERE id=$2 RETURNING *",
        )
        .bind(lease_owner)
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(Some(memory_job_from_row(&row)?))
    }

    pub async fn complete_memory_job(&self, id: &str, lease_owner: &str) -> AgentResult<bool> {
        let result = sqlx::query(
            "UPDATE agent_memory_jobs SET status='completed', completed_at=now(), updated_at=now(),
             lease_owner=NULL, leased_at=NULL, heartbeat_at=NULL
             WHERE id=$1 AND lease_owner=$2 AND status='running'",
        )
        .bind(id)
        .bind(lease_owner)
        .execute(self.pool())
        .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn fail_memory_job(
        &self,
        id: &str,
        lease_owner: &str,
        error_code: &str,
        retryable: bool,
    ) -> AgentResult<bool> {
        let result = sqlx::query(
            "UPDATE agent_memory_jobs SET
             status=CASE WHEN $4 AND attempt_count < max_attempts THEN 'queued' ELSE 'failed' END,
             error_code=$3, lease_owner=NULL, leased_at=NULL, heartbeat_at=NULL, updated_at=now()
             WHERE id=$1 AND lease_owner=$2 AND status='running'",
        )
        .bind(id)
        .bind(lease_owner)
        .bind(error_code)
        .bind(retryable)
        .execute(self.pool())
        .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn activate_memory(
        &self,
        actor: &AgentActor,
        input: &ActivateAgentMemory,
    ) -> AgentResult<AgentMemoryRecord> {
        validate_input(input)?;
        let normalized_hash = normalized_hash(&input.text);
        let mut tx = self.pool().begin().await?;
        let source_owned: bool = sqlx::query_scalar(
            "SELECT EXISTS(
               SELECT 1 FROM agent_messages m JOIN agent_conversations c ON c.id = m.conversation_id
               WHERE m.id = $1 AND m.role = 'user' AND c.id = $2 AND c.user_id = $3
                 AND ($4::text IS NULL OR c.workspace_id = $4)
             )",
        )
        .bind(&input.source_message_id)
        .bind(&input.source_conversation_id)
        .bind(&actor.user_id)
        .bind(&input.workspace_id)
        .fetch_one(&mut *tx)
        .await?;
        if !source_owned {
            return Err(AgentError::NotFound);
        }
        if let Some(row) = sqlx::query(
            "SELECT * FROM agent_memories WHERE user_id = $1
             AND workspace_id IS NOT DISTINCT FROM $2 AND kind = $3 AND subject_key = $4
             AND status = 'active' AND normalized_hash = $5 FOR UPDATE",
        )
        .bind(&actor.user_id)
        .bind(&input.workspace_id)
        .bind(input.kind.as_str())
        .bind(input.subject_key.trim())
        .bind(&normalized_hash)
        .fetch_optional(&mut *tx)
        .await?
        {
            let id: String = row.try_get("id")?;
            let row = sqlx::query(
                "UPDATE agent_memories SET use_count = use_count + 1, last_used_at = now(),
                 updated_at = now() WHERE id = $1 RETURNING *",
            )
            .bind(id)
            .fetch_one(&mut *tx)
            .await?;
            tx.commit().await?;
            return memory_from_row(&row);
        }
        let id = Uuid::new_v4().to_string();
        let initial_status = if input.status == AgentMemoryStatus::Active {
            AgentMemoryStatus::PendingReview
        } else {
            input.status
        };
        let inserted = sqlx::query(
            "INSERT INTO agent_memories
             (id,user_id,workspace_id,kind,subject_key,text,status,pinned,
              source_conversation_id,source_message_id,provenance_excerpt,confidence,
              extraction_version,normalized_hash)
             VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (source_message_id, normalized_hash) DO NOTHING RETURNING *",
        )
        .bind(&id)
        .bind(&actor.user_id)
        .bind(&input.workspace_id)
        .bind(input.kind.as_str())
        .bind(input.subject_key.trim())
        .bind(input.text.trim())
        .bind(initial_status.as_str())
        .bind(&input.source_conversation_id)
        .bind(&input.source_message_id)
        .bind(
            input
                .provenance_excerpt
                .chars()
                .take(500)
                .collect::<String>(),
        )
        .bind(input.confidence)
        .bind(input.extraction_version.trim())
        .bind(&normalized_hash)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(mut row) = inserted else {
            let row = sqlx::query(
                "SELECT * FROM agent_memories WHERE source_message_id = $1 AND normalized_hash = $2",
            )
            .bind(&input.source_message_id)
            .bind(&normalized_hash)
            .fetch_one(&mut *tx)
            .await?;
            tx.commit().await?;
            return memory_from_row(&row);
        };
        if input.status == AgentMemoryStatus::Active {
            sqlx::query(
                "UPDATE agent_memories SET status = 'superseded', superseded_by = $5,
                 updated_at = now() WHERE user_id = $1 AND workspace_id IS NOT DISTINCT FROM $2
                 AND kind = $3 AND subject_key = $4 AND status = 'active' AND id <> $5",
            )
            .bind(&actor.user_id)
            .bind(&input.workspace_id)
            .bind(input.kind.as_str())
            .bind(input.subject_key.trim())
            .bind(&id)
            .execute(&mut *tx)
            .await?;
            row = sqlx::query(
                "UPDATE agent_memories SET status = 'active', updated_at = now()
                 WHERE id = $1 RETURNING *",
            )
            .bind(&id)
            .fetch_one(&mut *tx)
            .await?;
        }
        tx.commit().await?;
        memory_from_row(&row)
    }

    pub async fn list_memories(
        &self,
        actor: &AgentActor,
        workspace_id: Option<&str>,
        include_inactive: bool,
        limit: i64,
    ) -> AgentResult<Vec<AgentMemoryRecord>> {
        let rows = sqlx::query(
            "SELECT * FROM agent_memories WHERE user_id = $1
             AND (workspace_id IS NULL OR workspace_id = $2)
             AND ($3 OR status IN ('active','pending_review'))
             ORDER BY pinned DESC, updated_at DESC, id LIMIT $4",
        )
        .bind(&actor.user_id)
        .bind(workspace_id)
        .bind(include_inactive)
        .bind(limit.clamp(1, 200))
        .fetch_all(self.pool())
        .await?;
        rows.iter().map(memory_from_row).collect()
    }

    pub async fn recall_memories(
        &self,
        actor: &AgentActor,
        workspace_id: &str,
        query: &str,
        embedding: Option<&[f32]>,
        limit: i64,
    ) -> AgentResult<Vec<AgentMemoryRecord>> {
        let rows = if let Some(embedding) = embedding {
            sqlx::query(
                "SELECT *, (CASE WHEN pinned THEN 10 ELSE 0 END
                    + ts_rank_cd(search_vector, websearch_to_tsquery('english', $3))
                    + CASE WHEN embedding IS NULL THEN 0 ELSE 1 - (embedding <=> $4) END) AS recall_score
                 FROM agent_memories WHERE user_id=$1 AND (workspace_id IS NULL OR workspace_id=$2)
                   AND status='active'
                 ORDER BY pinned DESC, recall_score DESC, updated_at DESC, id LIMIT $5",
            )
            .bind(&actor.user_id)
            .bind(workspace_id)
            .bind(query)
            .bind(HalfVector::from_f32_slice(embedding))
            .bind(limit.clamp(1, 20))
            .fetch_all(self.pool())
            .await?
        } else {
            sqlx::query(
                "SELECT * FROM agent_memories WHERE user_id=$1
                   AND (workspace_id IS NULL OR workspace_id=$2) AND status='active'
                 ORDER BY pinned DESC,
                   ts_rank_cd(search_vector, websearch_to_tsquery('english', $3)) DESC,
                   updated_at DESC, id LIMIT $4",
            )
            .bind(&actor.user_id)
            .bind(workspace_id)
            .bind(query)
            .bind(limit.clamp(1, 20))
            .fetch_all(self.pool())
            .await?
        };
        let memories = rows
            .iter()
            .map(memory_from_row)
            .collect::<AgentResult<Vec<_>>>()?;
        if !memories.is_empty() {
            let ids = memories
                .iter()
                .map(|memory| memory.id.clone())
                .collect::<Vec<_>>();
            sqlx::query(
                "UPDATE agent_memories SET use_count=use_count+1,last_used_at=now()
                 WHERE user_id=$1 AND id=ANY($2)",
            )
            .bind(&actor.user_id)
            .bind(ids)
            .execute(self.pool())
            .await?;
        }
        Ok(memories)
    }

    pub async fn update_memory_text(
        &self,
        actor: &AgentActor,
        id: &str,
        text: &str,
    ) -> AgentResult<AgentMemoryRecord> {
        let text = text.trim();
        if text.is_empty() || text.chars().count() > 2_000 {
            return Err(AgentError::Validation(
                "memory text must contain 1 to 2000 characters".into(),
            ));
        }
        let row = sqlx::query(
            "UPDATE agent_memories SET text = $1, normalized_hash = $2, embedding = NULL,
             user_edited = true, updated_at = now() WHERE id = $3 AND user_id = $4
             AND status <> 'deleted' RETURNING *",
        )
        .bind(text)
        .bind(normalized_hash(text))
        .bind(id)
        .bind(&actor.user_id)
        .fetch_optional(self.pool())
        .await?;
        row.as_ref()
            .map(memory_from_row)
            .transpose()?
            .ok_or(AgentError::NotFound)
    }

    pub async fn set_memory_pinned(
        &self,
        actor: &AgentActor,
        id: &str,
        pinned: bool,
    ) -> AgentResult<AgentMemoryRecord> {
        let row = sqlx::query(
            "UPDATE agent_memories SET pinned = $1, updated_at = now()
             WHERE id = $2 AND user_id = $3 AND status <> 'deleted' RETURNING *",
        )
        .bind(pinned)
        .bind(id)
        .bind(&actor.user_id)
        .fetch_optional(self.pool())
        .await?;
        row.as_ref()
            .map(memory_from_row)
            .transpose()?
            .ok_or(AgentError::NotFound)
    }

    pub async fn forget_memory(&self, actor: &AgentActor, id: &str) -> AgentResult<bool> {
        let result = sqlx::query(
            "UPDATE agent_memories SET status = 'deleted', embedding = NULL, pinned = false,
             deleted_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2
             AND status <> 'deleted'",
        )
        .bind(id)
        .bind(&actor.user_id)
        .execute(self.pool())
        .await?;
        Ok(result.rows_affected() == 1)
    }
}

fn memory_job_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentMemoryJob> {
    Ok(AgentMemoryJob {
        id: row.try_get("id")?,
        user_id: row.try_get("user_id")?,
        workspace_id: row.try_get("workspace_id")?,
        source_conversation_id: row.try_get("source_conversation_id")?,
        source_message_id: row.try_get("source_message_id")?,
        run_id: row.try_get("run_id")?,
        extraction_version: row.try_get("extraction_version")?,
        attempt_count: row.try_get("attempt_count")?,
    })
}

fn validate_input(input: &ActivateAgentMemory) -> AgentResult<()> {
    if input.subject_key.trim().is_empty()
        || input.subject_key.len() > 120
        || input.text.trim().is_empty()
        || input.text.chars().count() > 2_000
        || input.provenance_excerpt.trim().is_empty()
        || input.extraction_version.trim().is_empty()
        || !(0.0..=1.0).contains(&input.confidence)
        || !matches!(
            input.status,
            AgentMemoryStatus::Active | AgentMemoryStatus::PendingReview
        )
    {
        return Err(AgentError::Validation(
            "invalid durable memory candidate".into(),
        ));
    }
    Ok(())
}

pub fn normalized_hash(text: &str) -> String {
    let normalized = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    format!("{:x}", Sha256::digest(normalized.as_bytes()))
}

fn memory_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentMemoryRecord> {
    let kind = match row.try_get::<String, _>("kind")?.as_str() {
        "preference" => AgentMemoryKind::Preference,
        "goal" => AgentMemoryKind::Goal,
        "routine" => AgentMemoryKind::Routine,
        "instruction" => AgentMemoryKind::Instruction,
        _ => return Err(AgentError::Internal),
    };
    let status = match row.try_get::<String, _>("status")?.as_str() {
        "pending_review" => AgentMemoryStatus::PendingReview,
        "active" => AgentMemoryStatus::Active,
        "superseded" => AgentMemoryStatus::Superseded,
        "deleted" => AgentMemoryStatus::Deleted,
        _ => return Err(AgentError::Internal),
    };
    let created_at: DateTime<Utc> = row.try_get("created_at")?;
    let updated_at: DateTime<Utc> = row.try_get("updated_at")?;
    Ok(AgentMemoryRecord {
        id: row.try_get("id")?,
        user_id: row.try_get("user_id")?,
        workspace_id: row.try_get("workspace_id")?,
        kind,
        subject_key: row.try_get("subject_key")?,
        text: row.try_get("text")?,
        status,
        pinned: row.try_get("pinned")?,
        source_conversation_id: row.try_get("source_conversation_id")?,
        source_message_id: row.try_get("source_message_id")?,
        provenance_excerpt: row.try_get("provenance_excerpt")?,
        confidence: row.try_get("confidence")?,
        extraction_version: row.try_get("extraction_version")?,
        user_edited: row.try_get("user_edited")?,
        superseded_by: row.try_get("superseded_by")?,
        created_at: created_at.to_rfc3339(),
        updated_at: updated_at.to_rfc3339(),
    })
}
