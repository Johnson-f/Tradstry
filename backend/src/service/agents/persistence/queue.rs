use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use super::AgentStore;
use super::conversations::message_from_row;
use super::events::event_from_row;
use super::runs::run_from_row;
use crate::service::agents::{
    AgentActor, AgentError, AgentLane, AgentMessage, AgentResult, AgentRun, AgentRunEvent,
};

#[derive(Clone, Debug)]
pub struct EnqueuedAgentRun {
    pub message: AgentMessage,
    pub run: AgentRun,
    pub event: AgentRunEvent,
    pub created: bool,
}

impl AgentStore {
    pub async fn enqueue_message_run(
        &self,
        actor: &AgentActor,
        conversation_id: &str,
        content: &Value,
        lane: AgentLane,
        idempotency_key: &str,
    ) -> AgentResult<EnqueuedAgentRun> {
        let idempotency_key = idempotency_key.trim();
        if idempotency_key.is_empty() || idempotency_key.len() > 200 {
            return Err(AgentError::Validation(
                "run idempotency key must contain 1 to 200 bytes".into(),
            ));
        }
        let mut tx = self.pool().begin().await?;
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

        if let Some(existing_run) =
            sqlx::query("SELECT * FROM agent_runs WHERE user_id = $1 AND idempotency_key = $2")
                .bind(&actor.user_id)
                .bind(idempotency_key)
                .fetch_optional(&mut *tx)
                .await?
        {
            let existing_conversation: String = existing_run.try_get("conversation_id")?;
            if existing_conversation != conversation_id {
                return Err(AgentError::Conflict);
            }
            let input_message_id: String = existing_run
                .try_get::<Option<String>, _>("input_message_id")?
                .ok_or(AgentError::Internal)?;
            let message = sqlx::query("SELECT * FROM agent_messages WHERE id = $1")
                .bind(input_message_id)
                .fetch_one(&mut *tx)
                .await?;
            let event = sqlx::query(
                "SELECT * FROM agent_run_events WHERE run_id = $1 ORDER BY sequence ASC LIMIT 1",
            )
            .bind(existing_run.try_get::<String, _>("id")?)
            .fetch_one(&mut *tx)
            .await?;
            tx.commit().await?;
            return Ok(EnqueuedAgentRun {
                message: message_from_row(&message)?,
                run: run_from_row(&existing_run)?,
                event: event_from_row(&event)?,
                created: false,
            });
        }

        let message_sequence: i64 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM agent_messages WHERE conversation_id = $1",
        )
        .bind(conversation_id)
        .fetch_one(&mut *tx)
        .await?;
        let message_id = Uuid::new_v4().to_string();
        let message = sqlx::query(
            "INSERT INTO agent_messages
             (id, conversation_id, user_id, workspace_id, sequence, role, content_json)
             VALUES ($1, $2, $3, $4, $5, 'user', $6) RETURNING *",
        )
        .bind(&message_id)
        .bind(conversation_id)
        .bind(&actor.user_id)
        .bind(&workspace_id)
        .bind(message_sequence)
        .bind(content)
        .fetch_one(&mut *tx)
        .await?;

        let run_id = Uuid::new_v4().to_string();
        let run = sqlx::query(
            "INSERT INTO agent_runs
             (id, conversation_id, user_id, workspace_id, input_message_id,
              lane, status, stage, idempotency_key, next_event_sequence)
             VALUES ($1, $2, $3, $4, $5, $6, 'queued', 'queued', $7, 2)
             RETURNING *",
        )
        .bind(&run_id)
        .bind(conversation_id)
        .bind(&actor.user_id)
        .bind(&workspace_id)
        .bind(&message_id)
        .bind(lane.as_str())
        .bind(idempotency_key)
        .fetch_one(&mut *tx)
        .await?;
        let event = sqlx::query(
            "INSERT INTO agent_run_events
             (id, run_id, user_id, workspace_id, sequence, kind, payload_json)
             VALUES ($1, $2, $3, $4, 1, 'run_queued', $5) RETURNING *",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(&run_id)
        .bind(&actor.user_id)
        .bind(&workspace_id)
        .bind(json!({ "lane": lane.as_str() }))
        .fetch_one(&mut *tx)
        .await?;
        let title = content
            .get("text")
            .and_then(Value::as_str)
            .map(|text| {
                text.split_whitespace()
                    .take(5)
                    .collect::<Vec<_>>()
                    .join(" ")
                    .chars()
                    .take(80)
                    .collect::<String>()
            })
            .filter(|title| !title.is_empty());
        sqlx::query(
            "UPDATE agent_conversations SET title=COALESCE(title,$2),updated_at=now() WHERE id=$1",
        )
        .bind(conversation_id)
        .bind(title)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(EnqueuedAgentRun {
            message: message_from_row(&message)?,
            run: run_from_row(&run)?,
            event: event_from_row(&event)?,
            created: true,
        })
    }
}
