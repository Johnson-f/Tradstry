use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::Row;
use uuid::Uuid;

use super::AgentStore;
use crate::service::agents::{AgentActor, AgentError, AgentResult};

#[derive(Clone, Debug, PartialEq)]
pub struct AgentCheckpoint {
    pub run_id: String,
    pub stage: String,
    pub sequence: i64,
    pub state: Value,
    pub updated_at: String,
}

fn checkpoint_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentCheckpoint> {
    let updated_at: DateTime<Utc> = row.try_get("updated_at")?;
    Ok(AgentCheckpoint {
        run_id: row.try_get("run_id")?,
        stage: row.try_get("stage")?,
        sequence: row.try_get("sequence")?,
        state: row.try_get("state_json")?,
        updated_at: updated_at.to_rfc3339_opts(chrono::SecondsFormat::Micros, true),
    })
}

impl AgentStore {
    pub async fn save_checkpoint(
        &self,
        run_id: &str,
        stage: &str,
        sequence: i64,
        state: &Value,
    ) -> AgentResult<AgentCheckpoint> {
        if stage.trim().is_empty() || sequence < 0 {
            return Err(AgentError::Validation(
                "checkpoint stage must be non-blank and sequence non-negative".into(),
            ));
        }
        let row = sqlx::query(
            "INSERT INTO agent_checkpoints
             (id, run_id, user_id, workspace_id, stage, sequence, state_json)
             SELECT $1, r.id, r.user_id, r.workspace_id, $3, $4, $5
             FROM agent_runs r WHERE r.id = $2
             ON CONFLICT (run_id, stage) DO UPDATE SET
                sequence = EXCLUDED.sequence,
                state_json = EXCLUDED.state_json,
                updated_at = now()
             WHERE agent_checkpoints.sequence <= EXCLUDED.sequence
             RETURNING *",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(stage.trim())
        .bind(sequence)
        .bind(state)
        .fetch_optional(self.pool())
        .await?;
        match row {
            Some(row) => checkpoint_from_row(&row),
            None => Err(AgentError::Conflict),
        }
    }

    pub async fn latest_checkpoint(
        &self,
        actor: &AgentActor,
        run_id: &str,
    ) -> AgentResult<Option<AgentCheckpoint>> {
        let row = sqlx::query(
            "SELECT c.* FROM agent_checkpoints c
             JOIN agent_runs r ON r.id = c.run_id
             WHERE c.run_id = $1 AND r.user_id = $2
             ORDER BY c.sequence DESC LIMIT 1",
        )
        .bind(run_id)
        .bind(&actor.user_id)
        .fetch_optional(self.pool())
        .await?;
        row.as_ref().map(checkpoint_from_row).transpose()
    }

    pub async fn checkpoint_for_stage(
        &self,
        run_id: &str,
        stage: &str,
    ) -> AgentResult<Option<AgentCheckpoint>> {
        let row = sqlx::query("SELECT * FROM agent_checkpoints WHERE run_id = $1 AND stage = $2")
            .bind(run_id)
            .bind(stage)
            .fetch_optional(self.pool())
            .await?;
        row.as_ref().map(checkpoint_from_row).transpose()
    }
}
