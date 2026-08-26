use chrono::{Duration, Utc};
use sqlx::Row;

use super::AgentStore;
use crate::service::agents::AgentResult;

#[derive(Clone, Debug)]
pub struct ConversationSummaryJob {
    pub id: String,
    pub conversation_id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub target_sequence: i64,
    pub summary_version: String,
}

impl AgentStore {
    pub async fn claim_summary_job(
        &self,
        owner: &str,
        lease_seconds: u64,
    ) -> AgentResult<Option<ConversationSummaryJob>> {
        let stale = Utc::now() - Duration::seconds(lease_seconds as i64);
        let mut tx = self.pool().begin().await?;
        let row = sqlx::query(
            "SELECT * FROM agent_conversation_summary_jobs WHERE attempt_count<max_attempts AND
             (status='queued' OR (status='running' AND COALESCE(heartbeat_at,leased_at)<$1))
             ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
        )
        .bind(stale)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(row) = row else {
            tx.commit().await?;
            return Ok(None);
        };
        let id: String = row.try_get("id")?;
        let row=sqlx::query(
            "UPDATE agent_conversation_summary_jobs SET status='running',lease_owner=$1,leased_at=now(),
             heartbeat_at=now(),attempt_count=attempt_count+1,updated_at=now() WHERE id=$2 RETURNING *",
        ).bind(owner).bind(id).fetch_one(&mut *tx).await?;
        tx.commit().await?;
        Ok(Some(ConversationSummaryJob {
            id: row.try_get("id")?,
            conversation_id: row.try_get("conversation_id")?,
            user_id: row.try_get("user_id")?,
            workspace_id: row.try_get("workspace_id")?,
            target_sequence: row.try_get("target_sequence")?,
            summary_version: row.try_get("summary_version")?,
        }))
    }

    pub async fn summary_input(
        &self,
        job: &ConversationSummaryJob,
    ) -> AgentResult<(Option<String>, Vec<(String, String)>)> {
        let prior: Option<String> = sqlx::query_scalar(
            "SELECT summary_text FROM agent_conversations WHERE id=$1 AND user_id=$2",
        )
        .bind(&job.conversation_id)
        .bind(&job.user_id)
        .fetch_optional(self.pool())
        .await?
        .flatten();
        let rows=sqlx::query(
            "SELECT role,content_json FROM agent_messages WHERE conversation_id=$1 AND sequence<= $2
             AND role IN ('user','assistant') ORDER BY sequence",
        ).bind(&job.conversation_id).bind(job.target_sequence).fetch_all(self.pool()).await?;
        let mut messages = Vec::new();
        for row in rows {
            let role: String = row.try_get("role")?;
            let value: serde_json::Value = row.try_get("content_json")?;
            let text = value
                .get("text")
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
                .unwrap_or_else(|| value.to_string());
            messages.push((role, text));
        }
        Ok((prior, messages))
    }

    pub async fn complete_summary_job(
        &self,
        job: &ConversationSummaryJob,
        owner: &str,
        summary: &str,
    ) -> AgentResult<bool> {
        let mut tx = self.pool().begin().await?;
        let claimed:bool=sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM agent_conversation_summary_jobs WHERE id=$1 AND lease_owner=$2 AND status='running' FOR UPDATE)",
        ).bind(&job.id).bind(owner).fetch_one(&mut *tx).await?;
        if !claimed {
            return Ok(false);
        }
        sqlx::query(
            "UPDATE agent_conversations SET summary_text=$1,summarized_through_sequence=GREATEST(summarized_through_sequence,$2),
             summary_version=$3,updated_at=now() WHERE id=$4 AND user_id=$5",
        ).bind(summary).bind(job.target_sequence).bind(&job.summary_version)
         .bind(&job.conversation_id).bind(&job.user_id).execute(&mut *tx).await?;
        sqlx::query(
            "UPDATE agent_conversation_summary_jobs SET status='completed',completed_at=now(),updated_at=now(),
             lease_owner=NULL,leased_at=NULL,heartbeat_at=NULL WHERE id=$1",
        ).bind(&job.id).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn fail_summary_job(&self, id: &str, owner: &str) -> AgentResult<()> {
        sqlx::query(
            "UPDATE agent_conversation_summary_jobs SET status=CASE WHEN attempt_count<max_attempts THEN 'queued' ELSE 'failed' END,
             error_code='summary_failed',lease_owner=NULL,leased_at=NULL,heartbeat_at=NULL,updated_at=now()
             WHERE id=$1 AND lease_owner=$2",
        ).bind(id).bind(owner).execute(self.pool()).await?;
        Ok(())
    }
}
