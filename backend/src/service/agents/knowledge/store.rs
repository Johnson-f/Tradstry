use chrono::{Duration, Utc};
use pgvector::HalfVector;
use sqlx::Row;

use super::{KnowledgeOutboxRecord, KnowledgePassage, KnowledgeSourceType};
use crate::service::agents::{AgentError, AgentResult};

#[derive(Clone)]
pub struct KnowledgeStore {
    pool: sqlx::PgPool,
}

impl KnowledgeStore {
    pub fn new(pool: sqlx::PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &sqlx::PgPool {
        &self.pool
    }

    pub async fn claim(
        &self,
        lease_owner: &str,
        lease_seconds: u64,
    ) -> AgentResult<Option<KnowledgeOutboxRecord>> {
        let mut tx = self.pool.begin().await?;
        let stale_before = Utc::now() - Duration::seconds(lease_seconds as i64);
        let row = sqlx::query(
            "SELECT * FROM agent_index_outbox
             WHERE attempt_count < max_attempts AND available_at <= now()
               AND (status = 'queued' OR
                    (status = 'running' AND COALESCE(heartbeat_at, leased_at) < $1))
             ORDER BY created_at, id LIMIT 1 FOR UPDATE SKIP LOCKED",
        )
        .bind(stale_before)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(None);
        };
        let id: i64 = row.try_get("id")?;
        let row = sqlx::query(
            "UPDATE agent_index_outbox SET status = 'running', lease_owner = $1,
             leased_at = now(), heartbeat_at = now(), attempt_count = attempt_count + 1,
             updated_at = now() WHERE id = $2 RETURNING *",
        )
        .bind(lease_owner)
        .bind(id)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(Some(outbox_from_row(&row)?))
    }

    pub async fn heartbeat(&self, id: i64, lease_owner: &str) -> AgentResult<bool> {
        let result = sqlx::query(
            "UPDATE agent_index_outbox SET heartbeat_at = now(), updated_at = now()
             WHERE id = $1 AND lease_owner = $2 AND status = 'running'",
        )
        .bind(id)
        .bind(lease_owner)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn complete_delete(
        &self,
        record: &KnowledgeOutboxRecord,
        lease_owner: &str,
    ) -> AgentResult<bool> {
        let mut tx = self.pool.begin().await?;
        let locked: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM agent_index_outbox
             WHERE id = $1 AND lease_owner = $2 AND status = 'running' FOR UPDATE)",
        )
        .bind(record.id)
        .bind(lease_owner)
        .fetch_one(&mut *tx)
        .await?;
        if !locked {
            tx.commit().await?;
            return Ok(false);
        }
        sqlx::query(
            "DELETE FROM agent_knowledge_passages
             WHERE user_id = $1 AND workspace_id = $2 AND source_type = $3 AND source_id = $4",
        )
        .bind(&record.user_id)
        .bind(&record.workspace_id)
        .bind(record.source_type.as_str())
        .bind(&record.source_id)
        .execute(&mut *tx)
        .await?;
        complete_outbox(&mut tx, record.id).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn complete_noop(&self, id: i64, lease_owner: &str) -> AgentResult<bool> {
        let result = sqlx::query(
            "UPDATE agent_index_outbox SET status = 'completed', completed_at = now(),
             updated_at = now(), lease_owner = NULL, leased_at = NULL, heartbeat_at = NULL
             WHERE id = $1 AND lease_owner = $2 AND status = 'running'",
        )
        .bind(id)
        .bind(lease_owner)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn replace_projection(
        &self,
        record: &KnowledgeOutboxRecord,
        lease_owner: &str,
        passages: &[KnowledgePassage],
    ) -> AgentResult<bool> {
        if passages.iter().any(|passage| {
            passage.user_id != record.user_id
                || passage.workspace_id != record.workspace_id
                || passage.source_type != record.source_type
                || passage.source_id != record.source_id
                || passage.embedding.as_ref().is_some_and(|vector| {
                    vector.len() != 2048 || vector.iter().any(|value| !value.is_finite())
                })
        }) {
            return Err(AgentError::Validation(
                "knowledge projection scope or embedding is invalid".into(),
            ));
        }
        let mut tx = self.pool.begin().await?;
        let locked: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM agent_index_outbox
             WHERE id = $1 AND lease_owner = $2 AND status = 'running' FOR UPDATE)",
        )
        .bind(record.id)
        .bind(lease_owner)
        .fetch_one(&mut *tx)
        .await?;
        if !locked {
            tx.commit().await?;
            return Ok(false);
        }
        let stored_version: Option<String> = sqlx::query_scalar(
            "SELECT max(source_version) FROM agent_knowledge_passages
             WHERE user_id = $1 AND workspace_id = $2 AND source_type = $3 AND source_id = $4",
        )
        .bind(&record.user_id)
        .bind(&record.workspace_id)
        .bind(record.source_type.as_str())
        .bind(&record.source_id)
        .fetch_one(&mut *tx)
        .await?;
        let incoming_version = passages
            .first()
            .map(|passage| passage.source_version.0.as_str());
        if stored_version
            .as_deref()
            .zip(incoming_version)
            .is_some_and(|(stored, incoming)| stored > incoming)
        {
            complete_outbox(&mut tx, record.id).await?;
            tx.commit().await?;
            return Ok(true);
        }
        sqlx::query(
            "DELETE FROM agent_knowledge_passages
             WHERE user_id = $1 AND workspace_id = $2 AND source_type = $3 AND source_id = $4",
        )
        .bind(&record.user_id)
        .bind(&record.workspace_id)
        .bind(record.source_type.as_str())
        .bind(&record.source_id)
        .execute(&mut *tx)
        .await?;
        for passage in passages {
            let embedding = passage
                .embedding
                .as_ref()
                .map(|vector| HalfVector::from_f32_slice(vector));
            sqlx::query(
                "INSERT INTO agent_knowledge_passages
                 (id, user_id, workspace_id, source_type, source_id, source_version,
                  chunk_index, title, excerpt, search_text, embedding, trade_ids,
                  playbook_ids, note_ids, symbols, effective_from, effective_to, content_hash)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
                         $16::timestamptz,$17::timestamptz,$18)",
            )
            .bind(&passage.id)
            .bind(&passage.user_id)
            .bind(&passage.workspace_id)
            .bind(passage.source_type.as_str())
            .bind(&passage.source_id)
            .bind(&passage.source_version.0)
            .bind(passage.chunk_index)
            .bind(&passage.title)
            .bind(&passage.excerpt)
            .bind(&passage.search_text)
            .bind(embedding)
            .bind(&passage.relationships.trade_ids)
            .bind(&passage.relationships.playbook_ids)
            .bind(&passage.relationships.note_ids)
            .bind(&passage.relationships.symbols)
            .bind(&passage.effective_from)
            .bind(&passage.effective_to)
            .bind(&passage.content_hash)
            .execute(&mut *tx)
            .await?;
        }
        complete_outbox(&mut tx, record.id).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn fail(
        &self,
        id: i64,
        lease_owner: &str,
        error_code: &str,
        retryable: bool,
    ) -> AgentResult<bool> {
        let result = sqlx::query(
            "UPDATE agent_index_outbox SET
               status = CASE WHEN $4 AND attempt_count < max_attempts THEN 'queued' ELSE 'failed' END,
               available_at = CASE WHEN $4 THEN now() + interval '30 seconds' ELSE available_at END,
               lease_owner = NULL, leased_at = NULL, heartbeat_at = NULL,
               error_code = $3, updated_at = now()
             WHERE id = $1 AND lease_owner = $2 AND status = 'running'",
        )
        .bind(id)
        .bind(lease_owner)
        .bind(error_code)
        .bind(retryable)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }
}

async fn complete_outbox(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    id: i64,
) -> AgentResult<()> {
    sqlx::query(
        "UPDATE agent_index_outbox SET status = 'completed', completed_at = now(),
         updated_at = now(), lease_owner = NULL, leased_at = NULL, heartbeat_at = NULL
         WHERE id = $1",
    )
    .bind(id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

fn outbox_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<KnowledgeOutboxRecord> {
    Ok(KnowledgeOutboxRecord {
        id: row.try_get("id")?,
        user_id: row.try_get("user_id")?,
        workspace_id: row.try_get("workspace_id")?,
        source_type: KnowledgeSourceType::parse(row.try_get::<String, _>("source_type")?.as_str())
            .ok_or(AgentError::Internal)?,
        source_id: row.try_get("source_id")?,
        operation: row.try_get("operation")?,
        status: row.try_get("status")?,
        attempt_count: row.try_get("attempt_count")?,
    })
}
