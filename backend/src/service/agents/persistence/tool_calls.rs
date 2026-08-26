use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::Row;
use uuid::Uuid;

use super::AgentStore;
use crate::service::agents::{AgentError, AgentResult};

#[derive(Clone, Debug, PartialEq)]
pub struct AgentToolCall {
    pub id: String,
    pub run_id: String,
    pub call_id: String,
    pub tool_name: String,
    pub arguments: Value,
    pub status: String,
    pub result_summary: Option<String>,
    pub error_code: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

fn tool_call_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentToolCall> {
    let started_at: DateTime<Utc> = row.try_get("started_at")?;
    let completed_at: Option<DateTime<Utc>> = row.try_get("completed_at")?;
    Ok(AgentToolCall {
        id: row.try_get("id")?,
        run_id: row.try_get("run_id")?,
        call_id: row.try_get("call_id")?,
        tool_name: row.try_get("tool_name")?,
        arguments: row.try_get("arguments_json")?,
        status: row.try_get("status")?,
        result_summary: row.try_get("result_summary")?,
        error_code: row.try_get("error_code")?,
        started_at: started_at.to_rfc3339_opts(chrono::SecondsFormat::Micros, true),
        completed_at: completed_at
            .map(|value| value.to_rfc3339_opts(chrono::SecondsFormat::Micros, true)),
    })
}

impl AgentStore {
    pub async fn start_tool_call(
        &self,
        run_id: &str,
        call_id: &str,
        tool_name: &str,
        arguments: &Value,
    ) -> AgentResult<AgentToolCall> {
        if call_id.trim().is_empty() || tool_name.trim().is_empty() {
            return Err(AgentError::Validation(
                "tool call id and name cannot be blank".into(),
            ));
        }
        let row = sqlx::query(
            "INSERT INTO agent_tool_calls
             (id, run_id, user_id, workspace_id, call_id, tool_name, arguments_json, status)
             SELECT $1, r.id, r.user_id, r.workspace_id, $3, $4, $5, 'running'
             FROM agent_runs r WHERE r.id = $2
             ON CONFLICT (run_id, call_id) DO UPDATE SET call_id = EXCLUDED.call_id
             RETURNING *",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(run_id)
        .bind(call_id.trim())
        .bind(tool_name.trim())
        .bind(arguments)
        .fetch_optional(self.pool())
        .await?;
        match row {
            Some(row) => tool_call_from_row(&row),
            None => Err(AgentError::NotFound),
        }
    }

    pub async fn finish_tool_call(
        &self,
        tool_call_id: &str,
        status: &str,
        result_summary: Option<&str>,
        error_code: Option<&str>,
    ) -> AgentResult<AgentToolCall> {
        if !matches!(status, "completed" | "failed" | "cancelled") {
            return Err(AgentError::Validation(
                "invalid terminal tool-call status".into(),
            ));
        }
        let mut tx = self.pool().begin().await?;
        let row = sqlx::query(
            "UPDATE agent_tool_calls SET status = $1, result_summary = $2,
             error_code = $3, completed_at = now()
             WHERE id = $4 AND status = 'running' RETURNING *",
        )
        .bind(status)
        .bind(result_summary.map(|value| value.chars().take(1_000).collect::<String>()))
        .bind(error_code)
        .bind(tool_call_id)
        .fetch_optional(&mut *tx)
        .await?;
        match row {
            Some(row) => {
                sqlx::query(
                    "UPDATE agent_runs SET tool_calls = tool_calls + 1, updated_at = now()
                     WHERE id = $1",
                )
                .bind(row.try_get::<String, _>("run_id")?)
                .execute(&mut *tx)
                .await?;
                tx.commit().await?;
                tool_call_from_row(&row)
            }
            None => Err(AgentError::Conflict),
        }
    }
}
