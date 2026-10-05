use super::commands;
use anyhow::{Result, anyhow, ensure};
use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgPool, Row};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalReviewSessionV2", rename_fields = "camelCase")]
pub struct ReviewSession {
    pub id: String,
    pub date: String,
    pub timezone: String,
    pub queue: Vec<String>,
    pub completed: Vec<String>,
    pub cursor_entry_id: Option<String>,
    pub version: i64,
    pub refresh_available: bool,
}

pub struct OpenSessionInput<'a> {
    pub date: Option<&'a str>,
    pub refresh: bool,
    pub expected_version: Option<i64>,
}

pub async fn open(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: OpenSessionInput<'_>,
    client: &str,
    mutation: &str,
) -> Result<Option<ReviewSession>> {
    let OpenSessionInput {
        date,
        refresh,
        expected_version,
    } = input;
    if let Some(date) = date {
        chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")?;
    }
    let payload = json!({"kind":"review_session","workspace":workspace,"date":date,"refresh":refresh,"expectedVersion":expected_version});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    let timezone: String =
        sqlx::query_scalar("SELECT journal_timezone FROM workspaces WHERE id=$1 AND user_id=$2")
            .bind(workspace)
            .bind(user)
            .fetch_one(&mut *tx)
            .await?;
    timezone
        .parse::<chrono_tz::Tz>()
        .map_err(|_| anyhow!("Choose a valid journal timezone in workspace settings"))?;
    let date = if let Some(date) = date {
        Some(date.to_string())
    } else {
        sqlx::query_scalar::<_,Option<String>>("SELECT max((close_date AT TIME ZONE $3)::date)::text FROM journal_entries WHERE user_id=$1 AND workspace_id=$2 AND lifecycle_state='closed' AND deleted_at IS NULL AND retired_at IS NULL")
            .bind(user).bind(workspace).bind(&timezone).fetch_one(&mut *tx).await?
    };
    let Some(date) = date else {
        commands::acknowledge(
            &mut tx,
            user,
            workspace,
            client,
            mutation,
            &payload,
            &Value::Null,
        )
        .await?;
        tx.commit().await?;
        return Ok(None);
    };
    let trades=sqlx::query("SELECT e.id,EXISTS(SELECT 1 FROM journal_trade_reviews r WHERE r.entry_id=e.id AND r.entry_revision=e.materialized_revision AND r.context_revision=coalesce(c.record_version,0)) AS reviewed
        FROM journal_entries e LEFT JOIN journal_trade_context c ON c.entry_id=e.id
        WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.lifecycle_state='closed' AND e.deleted_at IS NULL AND e.retired_at IS NULL AND (e.close_date AT TIME ZONE $3)::date=$4::text::date ORDER BY e.close_date,e.id")
        .bind(user).bind(workspace).bind(&timezone).bind(&date).fetch_all(&mut *tx).await?;
    let queue = trades
        .iter()
        .map(|row| row.try_get::<String, _>("id"))
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let completed = trades
        .iter()
        .filter(|row| row.try_get::<bool, _>("reviewed").unwrap_or(false))
        .map(|row| row.try_get::<String, _>("id"))
        .collect::<std::result::Result<Vec<_>, _>>()?;
    let first = queue.iter().find(|id| !completed.contains(id)).cloned();
    sqlx::query("INSERT INTO journal_review_sessions(id,user_id,workspace_id,session_date,timezone,queue_json,completed_json,cursor_entry_id)
        VALUES ($1,$2,$3,$4::text::date,$5,$6,$7,$8) ON CONFLICT(user_id,workspace_id,session_date,timezone) DO NOTHING")
        .bind(crate::ids::new_uuid_v7().to_string()).bind(user).bind(workspace).bind(&date).bind(&timezone).bind(json!(queue)).bind(json!(completed)).bind(&first).execute(&mut *tx).await?;
    if refresh {
        let expected =
            expected_version.ok_or_else(|| anyhow!("A session version is required to refresh"))?;
        let changed=sqlx::query("UPDATE journal_review_sessions SET queue_json=$5,completed_json=$6,cursor_entry_id=CASE WHEN cursor_entry_id=ANY($7::text[]) AND NOT(cursor_entry_id=ANY($8::text[])) THEN cursor_entry_id ELSE $9 END,record_version=record_version+1,updated_at=now()
            WHERE user_id=$1 AND workspace_id=$2 AND session_date=$3::text::date AND timezone=$4 AND record_version=$10")
            .bind(user).bind(workspace).bind(&date).bind(&timezone).bind(json!(queue)).bind(json!(completed)).bind(&queue).bind(&completed).bind(&first).bind(expected).execute(&mut *tx).await?;
        ensure!(
            changed.rows_affected() == 1,
            "CONFLICT: session changed on another device"
        );
    }
    let row=sqlx::query("SELECT id,queue_json,completed_json,cursor_entry_id,record_version FROM journal_review_sessions WHERE user_id=$1 AND workspace_id=$2 AND session_date=$3::text::date AND timezone=$4")
        .bind(user).bind(workspace).bind(&date).bind(&timezone).fetch_one(&mut *tx).await?;
    let saved_queue: Vec<String> = serde_json::from_value(row.try_get("queue_json")?)?;
    let saved_completed: Vec<String> = serde_json::from_value(row.try_get("completed_json")?)?;
    let refresh_available = saved_queue != queue
        || saved_completed
            .iter()
            .collect::<std::collections::BTreeSet<_>>()
            != completed.iter().collect::<std::collections::BTreeSet<_>>();
    let result = ReviewSession {
        id: row.try_get("id")?,
        date,
        timezone,
        queue: saved_queue,
        completed: saved_completed,
        cursor_entry_id: row.try_get("cursor_entry_id")?,
        version: row.try_get("record_version")?,
        refresh_available,
    };
    commands::acknowledge(
        &mut tx,
        user,
        workspace,
        client,
        mutation,
        &payload,
        &serde_json::to_value(&result)?,
    )
    .await?;
    tx.commit().await?;
    Ok(Some(result))
}

pub struct MoveCursorInput<'a> {
    pub session: &'a str,
    pub entry: &'a str,
    pub expected_version: i64,
}

pub async fn move_cursor(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: MoveCursorInput<'_>,
    client: &str,
    mutation: &str,
) -> Result<i64> {
    let MoveCursorInput {
        session,
        entry,
        expected_version,
    } = input;
    let payload = json!({"kind":"session_cursor","workspace":workspace,"session":session,"entry":entry,"expectedVersion":expected_version});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    let version:Option<i64>=sqlx::query_scalar("UPDATE journal_review_sessions SET cursor_entry_id=$4,record_version=record_version+1,updated_at=now() WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND record_version=$5 AND queue_json ? $4 RETURNING record_version")
        .bind(session).bind(user).bind(workspace).bind(entry).bind(expected_version).fetch_optional(&mut *tx).await?;
    let version = version
        .ok_or_else(|| anyhow!("CONFLICT: session changed or the trade is outside this session"))?;
    commands::acknowledge(
        &mut tx,
        user,
        workspace,
        client,
        mutation,
        &payload,
        &json!(version),
    )
    .await?;
    tx.commit().await?;
    Ok(version)
}
