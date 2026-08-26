use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::Row;
use uuid::Uuid;

use super::AgentStore;
use crate::service::agents::{AgentActor, AgentError, AgentResult, AgentRunEvent};

pub(super) fn event_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentRunEvent> {
    let created_at: DateTime<Utc> = row.try_get("created_at")?;
    Ok(AgentRunEvent {
        run_id: row.try_get("run_id")?,
        sequence: row.try_get("sequence")?,
        kind: row.try_get("kind")?,
        payload: row.try_get("payload_json")?,
        created_at: created_at.to_rfc3339_opts(chrono::SecondsFormat::Micros, true),
    })
}

impl AgentStore {
    pub async fn append_event(
        &self,
        run_id: &str,
        kind: &str,
        payload: &Value,
    ) -> AgentResult<AgentRunEvent> {
        if kind.trim().is_empty() {
            return Err(AgentError::Validation("event kind cannot be blank".into()));
        }
        let mut tx = self.pool().begin().await?;
        let run = sqlx::query(
            "SELECT user_id, workspace_id, next_event_sequence
             FROM agent_runs WHERE id = $1 FOR UPDATE",
        )
        .bind(run_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(run) = run else {
            return Err(AgentError::NotFound);
        };
        let user_id: String = run.try_get("user_id")?;
        let workspace_id: String = run.try_get("workspace_id")?;
        let sequence: i64 = run.try_get("next_event_sequence")?;
        let row = sqlx::query(
            "INSERT INTO agent_run_events
             (id, run_id, user_id, workspace_id, sequence, kind, payload_json)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(&user_id)
        .bind(&workspace_id)
        .bind(sequence)
        .bind(kind)
        .bind(payload)
        .fetch_one(&mut *tx)
        .await?;
        sqlx::query(
            "UPDATE agent_runs SET next_event_sequence = next_event_sequence + 1,
             updated_at = now() WHERE id = $1",
        )
        .bind(run_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        event_from_row(&row)
    }

    pub async fn events_after(
        &self,
        actor: &AgentActor,
        run_id: &str,
        after_sequence: i64,
    ) -> AgentResult<Vec<AgentRunEvent>> {
        if after_sequence < 0 {
            return Err(AgentError::Validation(
                "event sequence cannot be negative".into(),
            ));
        }
        let rows = sqlx::query(
            "SELECT e.* FROM agent_run_events e
             JOIN agent_runs r ON r.id = e.run_id
             WHERE e.run_id = $1 AND r.user_id = $2 AND e.sequence > $3
             ORDER BY e.sequence ASC",
        )
        .bind(run_id)
        .bind(&actor.user_id)
        .bind(after_sequence)
        .fetch_all(self.pool())
        .await?;
        if rows.is_empty() {
            let owns: bool = sqlx::query_scalar(
                "SELECT EXISTS (SELECT 1 FROM agent_runs WHERE id = $1 AND user_id = $2)",
            )
            .bind(run_id)
            .bind(&actor.user_id)
            .fetch_one(self.pool())
            .await?;
            if !owns {
                return Err(AgentError::NotFound);
            }
        }
        rows.iter().map(event_from_row).collect()
    }
}
