use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::Row;

use super::AgentStore;
use crate::service::agents::{
    AgentActor, AgentConversation, AgentError, AgentMessage, AgentResult, AgentScope,
};

fn timestamp(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(chrono::SecondsFormat::Micros, true)
}

fn conversation_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentConversation> {
    Ok(AgentConversation {
        id: row.try_get("id")?,
        user_id: row.try_get("user_id")?,
        workspace_id: row.try_get("workspace_id")?,
        title: row.try_get("title")?,
        summary_text: row.try_get("summary_text")?,
        summarized_through_sequence: row.try_get("summarized_through_sequence")?,
        summary_version: row.try_get("summary_version")?,
        created_at: timestamp(row.try_get("created_at")?),
        updated_at: timestamp(row.try_get("updated_at")?),
    })
}

pub(super) fn message_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentMessage> {
    Ok(AgentMessage {
        id: row.try_get("id")?,
        conversation_id: row.try_get("conversation_id")?,
        user_id: row.try_get("user_id")?,
        workspace_id: row.try_get("workspace_id")?,
        sequence: row.try_get("sequence")?,
        role: row.try_get("role")?,
        content: row.try_get("content_json")?,
        created_at: timestamp(row.try_get("created_at")?),
    })
}

impl AgentStore {
    pub async fn get_message_internal(&self, message_id: &str) -> AgentResult<AgentMessage> {
        let row = sqlx::query("SELECT * FROM agent_messages WHERE id = $1")
            .bind(message_id)
            .fetch_optional(&self.pool)
            .await?;
        match row {
            Some(row) => message_from_row(&row),
            None => Err(AgentError::NotFound),
        }
    }

    pub async fn create_conversation(
        &self,
        actor: &AgentActor,
        scope: &AgentScope,
    ) -> AgentResult<AgentConversation> {
        let id = crate::ids::new_uuid_v7().to_string();
        let row = sqlx::query(
            "INSERT INTO agent_conversations (id, user_id, workspace_id)
             SELECT $1, $2, w.id FROM workspaces w
             WHERE w.id = $3 AND w.user_id = $2
             RETURNING *",
        )
        .bind(&id)
        .bind(&actor.user_id)
        .bind(&scope.workspace_id)
        .fetch_optional(&self.pool)
        .await?;
        match row {
            Some(row) => conversation_from_row(&row),
            None => Err(AgentError::NotFound),
        }
    }

    pub async fn get_conversation(
        &self,
        actor: &AgentActor,
        conversation_id: &str,
    ) -> AgentResult<AgentConversation> {
        let row = sqlx::query("SELECT * FROM agent_conversations WHERE id = $1 AND user_id = $2")
            .bind(conversation_id)
            .bind(&actor.user_id)
            .fetch_optional(&self.pool)
            .await?;
        match row {
            Some(row) => conversation_from_row(&row),
            None => Err(AgentError::NotFound),
        }
    }

    pub async fn list_conversations(
        &self,
        actor: &AgentActor,
        scope: &AgentScope,
        limit: i64,
    ) -> AgentResult<Vec<AgentConversation>> {
        let rows = sqlx::query(
            "SELECT * FROM agent_conversations
             WHERE user_id = $1 AND workspace_id = $2
             ORDER BY updated_at DESC, id DESC LIMIT $3",
        )
        .bind(&actor.user_id)
        .bind(&scope.workspace_id)
        .bind(limit.clamp(1, 100))
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(conversation_from_row).collect()
    }

    pub async fn rename_conversation(
        &self,
        actor: &AgentActor,
        conversation_id: &str,
        title: &str,
    ) -> AgentResult<AgentConversation> {
        let title = title.trim();
        if title.is_empty() || title.chars().count() > 120 {
            return Err(AgentError::Validation(
                "conversation title must contain 1 to 120 characters".into(),
            ));
        }
        let row = sqlx::query(
            "UPDATE agent_conversations SET title = $1, updated_at = now()
             WHERE id = $2 AND user_id = $3 RETURNING *",
        )
        .bind(title)
        .bind(conversation_id)
        .bind(&actor.user_id)
        .fetch_optional(&self.pool)
        .await?;
        match row {
            Some(row) => conversation_from_row(&row),
            None => Err(AgentError::NotFound),
        }
    }

    pub async fn delete_conversation(
        &self,
        actor: &AgentActor,
        conversation_id: &str,
    ) -> AgentResult<bool> {
        let result = sqlx::query("DELETE FROM agent_conversations WHERE id = $1 AND user_id = $2")
            .bind(conversation_id)
            .bind(&actor.user_id)
            .execute(&self.pool)
            .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn append_message(
        &self,
        actor: &AgentActor,
        conversation_id: &str,
        role: &str,
        content: &Value,
    ) -> AgentResult<AgentMessage> {
        if !matches!(role, "user" | "assistant" | "system" | "action") {
            return Err(AgentError::Validation("invalid agent message role".into()));
        }
        let mut tx = self.pool.begin().await?;
        let conversation = sqlx::query(
            "SELECT workspace_id FROM agent_conversations
             WHERE id = $1 AND user_id = $2 FOR UPDATE",
        )
        .bind(conversation_id)
        .bind(&actor.user_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(conversation) = conversation else {
            return Err(AgentError::NotFound);
        };
        let workspace_id: String = conversation.try_get("workspace_id")?;
        let sequence: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM agent_messages WHERE conversation_id = $1",
        )
        .bind(conversation_id)
        .fetch_one(&mut *tx)
        .await?;
        let id = crate::ids::new_uuid_v7().to_string();
        let row = sqlx::query(
            "INSERT INTO agent_messages
             (id, conversation_id, user_id, workspace_id, sequence, role, content_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        )
        .bind(&id)
        .bind(conversation_id)
        .bind(&actor.user_id)
        .bind(&workspace_id)
        .bind(sequence)
        .bind(role)
        .bind(content)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query("UPDATE agent_conversations SET updated_at = now() WHERE id = $1")
            .bind(conversation_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        message_from_row(&row)
    }

    pub async fn list_messages(
        &self,
        actor: &AgentActor,
        conversation_id: &str,
        limit: i64,
    ) -> AgentResult<Vec<AgentMessage>> {
        self.get_conversation(actor, conversation_id).await?;
        let rows = sqlx::query(
            "SELECT * FROM (
                SELECT * FROM agent_messages WHERE conversation_id = $1
                ORDER BY sequence DESC LIMIT $2
             ) recent ORDER BY sequence ASC",
        )
        .bind(conversation_id)
        .bind(limit.clamp(1, 200))
        .fetch_all(&self.pool)
        .await?;
        rows.iter().map(message_from_row).collect()
    }
}
