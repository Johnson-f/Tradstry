use std::collections::HashSet;

use chrono::{DateTime, Utc};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

use super::AgentStore;
use crate::service::agents::{AgentActor, AgentClaim, AgentError, AgentResult};

#[derive(Clone, Debug, PartialEq)]
pub struct AgentEvidence {
    pub id: String,
    pub run_id: String,
    pub tool_call_id: Option<String>,
    pub source_type: String,
    pub source_id: String,
    pub source_version: String,
    pub title: String,
    pub excerpt: String,
    pub source_url: Option<String>,
    pub freshness: String,
    pub payload: Value,
    pub created_at: String,
}

#[derive(Clone, Debug)]
pub struct NewAgentEvidence {
    pub tool_call_id: Option<String>,
    pub source_type: String,
    pub source_id: String,
    pub source_version: String,
    pub title: String,
    pub excerpt: String,
    pub source_url: Option<String>,
    pub freshness: String,
    pub payload: Value,
}

fn evidence_from_row(row: &sqlx::postgres::PgRow) -> AgentResult<AgentEvidence> {
    let created_at: DateTime<Utc> = row.try_get("created_at")?;
    Ok(AgentEvidence {
        id: row.try_get("id")?,
        run_id: row.try_get("run_id")?,
        tool_call_id: row.try_get("tool_call_id")?,
        source_type: row.try_get("source_type")?,
        source_id: row.try_get("source_id")?,
        source_version: row.try_get("source_version")?,
        title: row.try_get("title")?,
        excerpt: row.try_get("excerpt")?,
        source_url: row.try_get("source_url")?,
        freshness: row.try_get("freshness")?,
        payload: row.try_get("payload_json")?,
        created_at: created_at.to_rfc3339_opts(chrono::SecondsFormat::Micros, true),
    })
}

impl AgentStore {
    pub async fn record_evidence(
        &self,
        run_id: &str,
        input: &NewAgentEvidence,
    ) -> AgentResult<AgentEvidence> {
        if input.source_type.trim().is_empty()
            || input.source_id.trim().is_empty()
            || input.source_version.trim().is_empty()
            || input.title.trim().is_empty()
        {
            return Err(AgentError::Validation(
                "evidence source identity and title cannot be blank".into(),
            ));
        }
        if !matches!(
            input.freshness.as_str(),
            "canonical" | "fresh" | "stale" | "external"
        ) {
            return Err(AgentError::Validation("invalid evidence freshness".into()));
        }
        let idempotency_key = input.tool_call_id.as_ref().map(|tool_call_id| {
            evidence_idempotency_key(
                tool_call_id,
                &input.source_type,
                &input.source_id,
                &input.source_version,
            )
        });
        let id = idempotency_key.as_ref().map_or_else(
            || Uuid::new_v4().to_string(),
            |key| {
                Uuid::new_v5(&Uuid::NAMESPACE_URL, format!("{run_id}:{key}").as_bytes()).to_string()
            },
        );
        let row = sqlx::query(
            "INSERT INTO agent_evidence
             (id, run_id, tool_call_id, user_id, workspace_id, source_type, source_id,
              source_version, title, excerpt, source_url, freshness, payload_json, idempotency_key)
             SELECT $1, r.id, $3, r.user_id, r.workspace_id, $4, $5, $6, $7, $8, $9, $10, $11, $12
             FROM agent_runs r WHERE r.id = $2
               AND ($3::text IS NULL OR EXISTS (
                    SELECT 1 FROM agent_tool_calls t WHERE t.id = $3 AND t.run_id = r.id
               ))
             ON CONFLICT (run_id, idempotency_key) DO UPDATE SET
                title = EXCLUDED.title,
                excerpt = EXCLUDED.excerpt,
                source_url = EXCLUDED.source_url,
                freshness = EXCLUDED.freshness,
                payload_json = EXCLUDED.payload_json
             RETURNING *",
        )
        .bind(id)
        .bind(run_id)
        .bind(&input.tool_call_id)
        .bind(input.source_type.trim())
        .bind(input.source_id.trim())
        .bind(input.source_version.trim())
        .bind(input.title.trim())
        .bind(input.excerpt.chars().take(2_000).collect::<String>())
        .bind(&input.source_url)
        .bind(&input.freshness)
        .bind(&input.payload)
        .bind(idempotency_key)
        .fetch_optional(self.pool())
        .await?;
        match row {
            Some(row) => evidence_from_row(&row),
            None => Err(AgentError::Validation(
                "tool evidence must belong to the same run".into(),
            )),
        }
    }

    pub async fn complete_tool_call_with_evidence(
        &self,
        run_id: &str,
        tool_call_id: &str,
        evidence: &[NewAgentEvidence],
        summary: &str,
    ) -> AgentResult<Vec<AgentEvidence>> {
        let mut tx = self.pool().begin().await?;
        let tool = sqlx::query(
            "SELECT user_id, workspace_id FROM agent_tool_calls
             WHERE id = $1 AND run_id = $2 AND status = 'running' FOR UPDATE",
        )
        .bind(tool_call_id)
        .bind(run_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(tool) = tool else {
            return Err(AgentError::Conflict);
        };
        let user_id: String = tool.try_get("user_id")?;
        let workspace_id: String = tool.try_get("workspace_id")?;
        let mut stored = Vec::with_capacity(evidence.len());
        for input in evidence {
            validate_evidence(input)?;
            let key = evidence_idempotency_key(
                tool_call_id,
                &input.source_type,
                &input.source_id,
                &input.source_version,
            );
            let id = Uuid::new_v5(&Uuid::NAMESPACE_URL, format!("{run_id}:{key}").as_bytes())
                .to_string();
            let row = sqlx::query(
                "INSERT INTO agent_evidence
                 (id, run_id, tool_call_id, user_id, workspace_id, source_type, source_id,
                  source_version, title, excerpt, source_url, freshness, payload_json, idempotency_key)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                 ON CONFLICT (run_id, idempotency_key) DO UPDATE SET
                    title = EXCLUDED.title,
                    excerpt = EXCLUDED.excerpt,
                    source_url = EXCLUDED.source_url,
                    freshness = EXCLUDED.freshness,
                    payload_json = EXCLUDED.payload_json
                 RETURNING *",
            )
            .bind(id)
            .bind(run_id)
            .bind(tool_call_id)
            .bind(&user_id)
            .bind(&workspace_id)
            .bind(input.source_type.trim())
            .bind(input.source_id.trim())
            .bind(input.source_version.trim())
            .bind(input.title.trim())
            .bind(input.excerpt.chars().take(2_000).collect::<String>())
            .bind(&input.source_url)
            .bind(&input.freshness)
            .bind(&input.payload)
            .bind(key)
            .fetch_one(&mut *tx)
            .await?;
            stored.push(evidence_from_row(&row)?);
        }
        let updated = sqlx::query(
            "UPDATE agent_tool_calls SET status = 'completed', result_summary = $1,
             completed_at = now() WHERE id = $2 AND status = 'running'",
        )
        .bind(summary.chars().take(1_000).collect::<String>())
        .bind(tool_call_id)
        .execute(&mut *tx)
        .await?;
        if updated.rows_affected() != 1 {
            return Err(AgentError::Conflict);
        }
        sqlx::query(
            "UPDATE agent_runs SET tool_calls = tool_calls + 1, updated_at = now() WHERE id = $1",
        )
        .bind(run_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(stored)
    }

    pub async fn record_answer_claims(
        &self,
        run_id: &str,
        message_id: &str,
        claims: &[AgentClaim],
    ) -> AgentResult<()> {
        let mut seen_claims = HashSet::new();
        for claim in claims {
            if claim.claim_id.trim().is_empty()
                || claim.text.trim().is_empty()
                || !(1..=5).contains(&claim.evidence_ids.len())
                || !seen_claims.insert(claim.claim_id.as_str())
            {
                return Err(AgentError::Validation(
                    "factual claims require a unique id, text, and 1 to 5 evidence records".into(),
                ));
            }
            let unique_evidence = claim.evidence_ids.iter().collect::<HashSet<_>>();
            if unique_evidence.len() != claim.evidence_ids.len() {
                return Err(AgentError::Validation(
                    "claim evidence cannot contain duplicates".into(),
                ));
            }
        }

        let mut tx = self.pool().begin().await?;
        let run =
            sqlx::query("SELECT user_id, workspace_id FROM agent_runs WHERE id = $1 FOR UPDATE")
                .bind(run_id)
                .fetch_optional(&mut *tx)
                .await?;
        let Some(run) = run else {
            return Err(AgentError::NotFound);
        };
        let user_id: String = run.try_get("user_id")?;
        let workspace_id: String = run.try_get("workspace_id")?;
        let message_matches: bool = sqlx::query_scalar(
            "SELECT EXISTS (
                SELECT 1 FROM agent_messages m
                JOIN agent_runs r ON r.conversation_id = m.conversation_id
                WHERE m.id = $1 AND r.id = $2 AND m.user_id = r.user_id
             )",
        )
        .bind(message_id)
        .bind(run_id)
        .fetch_one(&mut *tx)
        .await?;
        if !message_matches {
            return Err(AgentError::Validation(
                "claim message does not belong to the run conversation".into(),
            ));
        }

        for claim in claims {
            let count: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM agent_evidence
                 WHERE run_id = $1 AND id = ANY($2)",
            )
            .bind(run_id)
            .bind(&claim.evidence_ids)
            .fetch_one(&mut *tx)
            .await?;
            if count != claim.evidence_ids.len() as i64 {
                return Err(AgentError::Validation(
                    "evidence does not belong to run".into(),
                ));
            }
            let claim_row_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO agent_claims
                 (id, run_id, message_id, user_id, workspace_id, claim_key, claim_text)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)",
            )
            .bind(&claim_row_id)
            .bind(run_id)
            .bind(message_id)
            .bind(&user_id)
            .bind(&workspace_id)
            .bind(claim.claim_id.trim())
            .bind(claim.text.trim())
            .execute(&mut *tx)
            .await?;
            for (ordinal, evidence_id) in claim.evidence_ids.iter().enumerate() {
                sqlx::query(
                    "INSERT INTO agent_claim_evidence (claim_id, evidence_id, ordinal)
                     VALUES ($1, $2, $3)",
                )
                .bind(&claim_row_id)
                .bind(evidence_id)
                .bind(ordinal as i32)
                .execute(&mut *tx)
                .await?;
            }
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn evidence_for_message(
        &self,
        actor: &AgentActor,
        message_id: &str,
    ) -> AgentResult<Vec<AgentEvidence>> {
        let rows = sqlx::query(
            "SELECT DISTINCT e.* FROM agent_evidence e
             JOIN agent_claim_evidence ce ON ce.evidence_id = e.id
             JOIN agent_claims c ON c.id = ce.claim_id
             WHERE c.message_id = $1 AND c.user_id = $2
             ORDER BY e.created_at, e.id",
        )
        .bind(message_id)
        .bind(&actor.user_id)
        .fetch_all(self.pool())
        .await?;
        rows.iter().map(evidence_from_row).collect()
    }

    pub async fn evidence_for_run_tree(
        &self,
        parent_run_id: &str,
    ) -> AgentResult<Vec<AgentEvidence>> {
        let rows = sqlx::query(
            "SELECT e.* FROM agent_evidence e
             JOIN agent_runs r ON r.id = e.run_id
             WHERE r.id = $1 OR r.parent_run_id = $1
             ORDER BY e.created_at, e.id",
        )
        .bind(parent_run_id)
        .fetch_all(self.pool())
        .await?;
        rows.iter().map(evidence_from_row).collect()
    }
}

fn validate_evidence(input: &NewAgentEvidence) -> AgentResult<()> {
    if input.source_type.trim().is_empty()
        || input.source_id.trim().is_empty()
        || input.source_version.trim().is_empty()
        || input.title.trim().is_empty()
    {
        return Err(AgentError::Validation(
            "evidence source identity and title cannot be blank".into(),
        ));
    }
    if !matches!(
        input.freshness.as_str(),
        "canonical" | "fresh" | "stale" | "external"
    ) {
        return Err(AgentError::Validation("invalid evidence freshness".into()));
    }
    Ok(())
}

fn evidence_idempotency_key(
    tool_call_id: &str,
    source_type: &str,
    source_id: &str,
    source_version: &str,
) -> String {
    format!(
        "{:x}",
        Sha256::digest(
            format!(
                "{tool_call_id}\0{}\0{}\0{}",
                source_type.trim(),
                source_id.trim(),
                source_version.trim()
            )
            .as_bytes()
        )
    )
}
