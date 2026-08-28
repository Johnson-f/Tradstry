use chrono::DateTime;
use sqlx::Row;

use super::AgentStore;
use super::runs::run_from_row;
use crate::service::agents::{
    AgentActivityEntry, AgentActivityStatus, AgentActivitySummary, AgentActor, AgentError,
    AgentMessageActivity, AgentResult, projected_entries,
};

impl AgentStore {
    pub async fn activity_for_message(
        &self,
        actor: &AgentActor,
        message_id: &str,
    ) -> AgentResult<Option<AgentMessageActivity>> {
        let row = sqlx::query(
            "SELECT r.*,
                (SELECT count(*) FROM agent_runs child WHERE child.parent_run_id=r.id) AS subagent_count,
                (SELECT count(*) FROM agent_evidence evidence
                 JOIN agent_runs evidence_run ON evidence_run.id=evidence.run_id
                 WHERE evidence_run.id=r.id OR evidence_run.parent_run_id=r.id) AS source_count
             FROM agent_runs r
             JOIN agent_messages message ON message.id=r.output_message_id
             WHERE r.output_message_id=$1 AND r.user_id=$2 AND message.user_id=$2",
        )
        .bind(message_id)
        .bind(&actor.user_id)
        .fetch_optional(self.pool())
        .await?;
        let Some(row) = row else {
            let owns_message: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM agent_messages WHERE id=$1 AND user_id=$2)",
            )
            .bind(message_id)
            .bind(&actor.user_id)
            .fetch_one(self.pool())
            .await?;
            return if owns_message {
                Ok(None)
            } else {
                Err(AgentError::NotFound)
            };
        };
        let run = run_from_row(&row)?;
        let events = self.events_after(actor, &run.id, 0).await?;
        let entries = projected_entries(&events, &run.status);
        Ok(Some(AgentMessageActivity {
            summary: summary_from_row(&row, &entries)?,
            entries,
        }))
    }

    pub async fn activity_summaries(
        &self,
        actor: &AgentActor,
        message_ids: &[String],
    ) -> AgentResult<Vec<AgentActivitySummary>> {
        if message_ids.len() > 100 {
            return Err(AgentError::Validation(
                "activity summaries are limited to 100 messages".into(),
            ));
        }
        if message_ids.is_empty() {
            return Ok(Vec::new());
        }
        let rows = sqlx::query(
            "SELECT r.*,
                (SELECT count(*) FROM agent_runs child WHERE child.parent_run_id=r.id) AS subagent_count,
                (SELECT count(*) FROM agent_evidence evidence
                 JOIN agent_runs evidence_run ON evidence_run.id=evidence.run_id
                 WHERE evidence_run.id=r.id OR evidence_run.parent_run_id=r.id) AS source_count,
                EXISTS(
                    SELECT 1 FROM agent_run_events event
                    WHERE event.run_id=r.id
                      AND event.kind IN ('run_failed','tool_failed','model_failed','provider_failed')
                ) AS has_activity_failures
             FROM agent_runs r
             JOIN agent_messages message ON message.id=r.output_message_id
             WHERE r.output_message_id=ANY($1) AND r.user_id=$2 AND message.user_id=$2
             ORDER BY array_position($1::text[], r.output_message_id)",
        )
        .bind(message_ids)
        .bind(&actor.user_id)
        .fetch_all(self.pool())
        .await?;
        rows.iter()
            .map(|row| {
                let has_activity_failures: bool = row.try_get("has_activity_failures")?;
                summary_from_row_with_failures(row, has_activity_failures)
            })
            .collect()
    }
}

fn summary_from_row(
    row: &sqlx::postgres::PgRow,
    entries: &[AgentActivityEntry],
) -> AgentResult<AgentActivitySummary> {
    let has_failures = entries.iter().any(|entry| {
        matches!(
            entry.status,
            AgentActivityStatus::Failed | AgentActivityStatus::Interrupted
        )
    });
    summary_from_row_with_failures(row, has_failures)
}

fn summary_from_row_with_failures(
    row: &sqlx::postgres::PgRow,
    has_activity_failures: bool,
) -> AgentResult<AgentActivitySummary> {
    let run = run_from_row(row)?;
    let duration_ms = match (&run.completed_at, &run.created_at) {
        (Some(completed), created) => {
            let completed =
                DateTime::parse_from_rfc3339(completed).map_err(|_| AgentError::Internal)?;
            let created =
                DateTime::parse_from_rfc3339(created).map_err(|_| AgentError::Internal)?;
            Some((completed - created).num_milliseconds().max(0))
        }
        _ => None,
    };
    Ok(AgentActivitySummary {
        message_id: run.output_message_id.ok_or(AgentError::Internal)?,
        has_failures: has_activity_failures || run.error_code.is_some(),
        status: run.status,
        duration_ms,
        model_calls: run.model_calls,
        tool_calls: run.tool_calls,
        subagent_count: row.try_get("subagent_count")?,
        source_count: row.try_get("source_count")?,
    })
}
