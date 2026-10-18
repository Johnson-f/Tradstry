use super::commands;
use anyhow::{Result, anyhow, ensure};
use async_graphql::SimpleObject;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool, Row};
use std::collections::BTreeSet;

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
    pub items: Vec<SessionItem>,
    pub reviewed_count: i32,
    pub skipped_count: i32,
    /// Every trade that exited that day is reviewed or skipped.
    pub complete: bool,
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
    let timezone = journal_timezone(&mut tx, user, workspace).await?;
    let date = if let Some(date) = date {
        Some(date.to_string())
    } else {
        sqlx::query_scalar::<_,Option<String>>("SELECT greatest(
                (SELECT max((f.executed_at AT TIME ZONE $3)::date) FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.retired_at IS NULL),
                (SELECT max((close_date AT TIME ZONE $3)::date) FROM journal_entries WHERE user_id=$1 AND workspace_id=$2 AND lifecycle_state='closed' AND deleted_at IS NULL AND retired_at IS NULL))::text")
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
    let day = Day {
        user,
        workspace,
        timezone: &timezone,
        date: &date,
    };
    let queue = queue_ids(&mut tx, &day).await?;
    let created = sqlx::query("INSERT INTO journal_review_sessions(id,user_id,workspace_id,session_date,timezone,queue_json,completed_json,cursor_entry_id)
        VALUES ($1,$2,$3,$4::text::date,$5,$6,'[]',$7) ON CONFLICT(user_id,workspace_id,session_date,timezone) DO NOTHING")
        .bind(crate::ids::new_uuid_v7().to_string()).bind(user).bind(workspace).bind(&date).bind(&timezone).bind(json!(queue)).bind(queue.first()).execute(&mut *tx).await?.rows_affected() == 1;
    let row=sqlx::query("SELECT id,queue_json,completed_json,cursor_entry_id,record_version FROM journal_review_sessions WHERE user_id=$1 AND workspace_id=$2 AND session_date=$3::text::date AND timezone=$4")
        .bind(user).bind(workspace).bind(&date).bind(&timezone).fetch_one(&mut *tx).await?;
    let id: String = row.try_get("id")?;
    let live = classify(&mut tx, &day, &id, &queue).await?;
    let completed = done_ids(&live);
    let first = first_pending(&live);
    if created {
        sqlx::query(
            "UPDATE journal_review_sessions SET completed_json=$2,cursor_entry_id=$3 WHERE id=$1",
        )
        .bind(&id)
        .bind(json!(completed))
        .bind(&first)
        .execute(&mut *tx)
        .await?;
    }
    if refresh {
        let expected =
            expected_version.ok_or_else(|| anyhow!("A session version is required to refresh"))?;
        let changed=sqlx::query("UPDATE journal_review_sessions SET queue_json=$2,completed_json=$3,cursor_entry_id=CASE WHEN cursor_entry_id=ANY($4::text[]) AND NOT(cursor_entry_id=ANY($5::text[])) THEN cursor_entry_id ELSE $6 END,record_version=record_version+1,updated_at=now()
            WHERE id=$1 AND record_version=$7")
            .bind(&id).bind(json!(queue)).bind(json!(completed)).bind(&queue).bind(&completed).bind(&first).bind(expected).execute(&mut *tx).await?;
        ensure!(
            changed.rows_affected() == 1,
            "CONFLICT: session changed on another device"
        );
    }
    let result = session_view(&mut tx, &day, &id, Some((&queue, &completed))).await?;
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

struct Day<'a> {
    user: &'a str,
    workspace: &'a str,
    timezone: &'a str,
    date: &'a str,
}

async fn journal_timezone(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
) -> Result<String> {
    let timezone: String =
        sqlx::query_scalar("SELECT journal_timezone FROM workspaces WHERE id=$1 AND user_id=$2")
            .bind(workspace)
            .bind(user)
            .fetch_one(&mut *connection)
            .await?;
    timezone
        .parse::<chrono_tz::Tz>()
        .map_err(|_| anyhow!("Choose a valid journal timezone in workspace settings"))?;
    Ok(timezone)
}

/// Every trade the user acted on that day, trades that closed that day, and
/// trades an earlier daily review set aside for later, in the order they were
/// first touched.
async fn queue_ids(connection: &mut PgConnection, day: &Day<'_>) -> Result<Vec<String>> {
    Ok(sqlx::query_scalar("WITH touched(id,at) AS (
            SELECT e.id,min(f.executed_at) FROM journal_entries e JOIN trade_episode_fills f ON f.episode_id=e.episode_id
            WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.deleted_at IS NULL AND e.retired_at IS NULL AND (f.executed_at AT TIME ZONE $3)::date=$4::text::date
            GROUP BY e.id
            UNION ALL
            SELECT e.id,e.close_date FROM journal_entries e
            WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.deleted_at IS NULL AND e.retired_at IS NULL AND e.lifecycle_state='closed' AND (e.close_date AT TIME ZONE $3)::date=$4::text::date
            UNION ALL
            SELECT e.id,min(b.trade_date) FROM journal_entries e JOIN brokerage_transactions b ON b.user_id=e.user_id AND b.workspace_id=e.workspace_id AND (e.issue_json->'source_ids') ? b.id
            WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.deleted_at IS NULL AND e.retired_at IS NULL AND e.episode_id IS NULL AND jsonb_typeof(e.issue_json->'source_ids')='array' AND (b.trade_date AT TIME ZONE $3)::date=$4::text::date
            GROUP BY e.id
            UNION ALL
            SELECT e.id,e.close_date FROM journal_review_skips s JOIN journal_entries e ON e.id=s.entry_id AND e.user_id=s.user_id AND e.workspace_id=s.workspace_id
            LEFT JOIN journal_review_sessions rs ON rs.id=s.session_id
            WHERE s.user_id=$1 AND s.workspace_id=$2 AND s.revoked_at IS NULL AND s.reason='review_later' AND e.deleted_at IS NULL AND e.retired_at IS NULL
              AND coalesce(rs.session_date,(s.created_at AT TIME ZONE $3)::date)<$4::text::date
              AND NOT EXISTS(SELECT 1 FROM journal_trade_reviews r LEFT JOIN journal_trade_context c ON c.entry_id=e.id WHERE r.entry_id=e.id AND r.entry_revision=e.materialized_revision AND r.context_revision=coalesce(c.record_version,0)))
        SELECT id FROM touched GROUP BY id ORDER BY min(at),id")
        .bind(day.user).bind(day.workspace).bind(day.timezone).bind(day.date).fetch_all(connection).await?)
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalReviewSessionItemV2", rename_fields = "camelCase")]
pub struct SessionItem {
    pub entry_id: String,
    /// `exited`, `open` or `attention`.
    pub group: String,
    /// `reviewed`, `skipped`, `pending` or `none` (nothing is required).
    pub state: String,
    pub skip_reason: Option<String>,
}

async fn classify(
    connection: &mut PgConnection,
    day: &Day<'_>,
    session: &str,
    ids: &[String],
) -> Result<Vec<SessionItem>> {
    let rows = sqlx::query("SELECT e.id,e.lifecycle_state,
            coalesce((e.close_date AT TIME ZONE $3)::date=$4::text::date,false) AS closed_today,
            EXISTS(SELECT 1 FROM journal_trade_reviews r WHERE r.entry_id=e.id AND r.entry_revision=e.materialized_revision AND r.context_revision=coalesce(c.record_version,0)) AS reviewed,
            EXISTS(SELECT 1 FROM journal_trade_reviews r WHERE r.entry_id=e.id) AS has_review,
            s.reason AS skip_reason,
            (s.reason<>'review_later' OR s.session_id=$5) AS skip_done,
            (s.reason='review_later' AND s.session_id IS DISTINCT FROM $5) AS carried
        FROM unnest($6::text[]) WITH ORDINALITY q(id,position)
        JOIN journal_entries e ON e.id=q.id AND e.user_id=$1 AND e.workspace_id=$2
        LEFT JOIN journal_trade_context c ON c.entry_id=e.id
        LEFT JOIN journal_review_skips s ON s.entry_id=e.id AND s.revoked_at IS NULL
        ORDER BY q.position")
        .bind(day.user).bind(day.workspace).bind(day.timezone).bind(day.date).bind(session).bind(ids).fetch_all(connection).await?;
    rows.into_iter()
        .map(|row| {
            let reviewed: bool = row.try_get("reviewed")?;
            let lifecycle: String = row.try_get("lifecycle_state")?;
            let skip_reason: Option<String> = row.try_get("skip_reason")?;
            let skipped = row
                .try_get::<Option<bool>, _>("skip_done")?
                .unwrap_or(false);
            let carried = row.try_get::<Option<bool>, _>("carried")?.unwrap_or(false);
            let group = if lifecycle == "incomplete"
                || (!reviewed && row.try_get::<bool, _>("has_review")?)
            {
                "attention"
            } else if lifecycle == "closed" && (row.try_get::<bool, _>("closed_today")? || carried)
            {
                "exited"
            } else {
                "open"
            };
            let state = if reviewed {
                "reviewed"
            } else if skipped && !carried {
                "skipped"
            } else if group == "exited" {
                "pending"
            } else {
                "none"
            };
            Ok(SessionItem {
                entry_id: row.try_get("id")?,
                group: group.into(),
                state: state.into(),
                skip_reason: skip_reason.filter(|_| state == "skipped"),
            })
        })
        .collect()
}

fn done_ids(items: &[SessionItem]) -> Vec<String> {
    items
        .iter()
        .filter(|item| matches!(item.state.as_str(), "reviewed" | "skipped"))
        .map(|item| item.entry_id.clone())
        .collect()
}

fn first_pending(items: &[SessionItem]) -> Option<String> {
    items
        .iter()
        .find(|item| item.state == "pending")
        .or_else(|| items.iter().find(|item| item.state == "none"))
        .map(|item| item.entry_id.clone())
}

/// The saved session with each trade's live state. `live` is the queue and
/// completion the day has now, used to tell whether a refresh would change it.
async fn session_view(
    connection: &mut PgConnection,
    day: &Day<'_>,
    id: &str,
    live: Option<(&[String], &[String])>,
) -> Result<ReviewSession> {
    let row=sqlx::query("SELECT id,queue_json,completed_json,cursor_entry_id,record_version FROM journal_review_sessions WHERE id=$1")
        .bind(id).fetch_one(&mut *connection).await?;
    let queue: Vec<String> = serde_json::from_value(row.try_get("queue_json")?)?;
    let items = classify(connection, day, id, &queue).await?;
    let completed = done_ids(&items);
    let refresh_available = live.is_some_and(|(live_queue, live_completed)| {
        live_queue != queue.as_slice()
            || live_completed.iter().collect::<BTreeSet<_>>()
                != completed.iter().collect::<BTreeSet<_>>()
    });
    let exited = items.iter().filter(|item| item.group == "exited");
    Ok(ReviewSession {
        id: row.try_get("id")?,
        date: day.date.into(),
        timezone: day.timezone.into(),
        complete: exited
            .clone()
            .all(|item| matches!(item.state.as_str(), "reviewed" | "skipped")),
        reviewed_count: count(&items, "reviewed"),
        skipped_count: count(&items, "skipped"),
        queue,
        completed,
        items,
        cursor_entry_id: row.try_get("cursor_entry_id")?,
        version: row.try_get("record_version")?,
        refresh_available,
    })
}

fn count(items: &[SessionItem], state: &str) -> i32 {
    i32::try_from(items.iter().filter(|item| item.state == state).count()).unwrap_or(i32::MAX)
}

pub struct SkipInput<'a> {
    pub entry: &'a str,
    pub reason: &'a str,
    pub session: Option<&'a str>,
}

/// Sets a trade aside without a review. "Review later" brings it back in the
/// next daily review; the other reasons close it out.
pub async fn skip(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: SkipInput<'_>,
    client: &str,
    mutation: &str,
) -> Result<bool> {
    let payload = json!({"kind":"skip_review","workspace":workspace,"entry":input.entry,"reason":input.reason,"session":input.session});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    ensure!(
        matches!(input.reason, "too_small" | "mistake_fill" | "review_later"),
        "Choose why you're skipping this trade"
    );
    let lifecycle: Option<String> = sqlx::query_scalar("SELECT lifecycle_state FROM journal_entries WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND deleted_at IS NULL AND retired_at IS NULL FOR UPDATE")
        .bind(input.entry).bind(user).bind(workspace).fetch_optional(&mut *tx).await?;
    ensure!(
        lifecycle.ok_or_else(|| anyhow!("Journal trade not found"))? == "closed",
        "Only exited trades can be skipped"
    );
    if let Some(session) = input.session {
        let owned: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM journal_review_sessions WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND queue_json ? $4)")
            .bind(session).bind(user).bind(workspace).bind(input.entry).fetch_one(&mut *tx).await?;
        ensure!(owned, "Trade is not in this review session");
    }
    sqlx::query("UPDATE journal_review_skips SET revoked_at=now() WHERE entry_id=$1 AND user_id=$2 AND revoked_at IS NULL")
        .bind(input.entry).bind(user).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO journal_review_skips(id,entry_id,user_id,workspace_id,session_id,reason) VALUES ($1,$2,$3,$4,$5,$6)")
        .bind(crate::ids::new_uuid_v7().to_string()).bind(input.entry).bind(user).bind(workspace).bind(input.session).bind(input.reason)
        .execute(&mut *tx).await?;
    if let Some(session) = input.session {
        mark_done(&mut tx, session, input.entry).await?;
    }
    commands::changed(
        &mut tx,
        user,
        workspace,
        "review_skip",
        json!({"entryId":input.entry,"reason":input.reason}),
    )
    .await?;
    commands::acknowledge(
        &mut tx,
        user,
        workspace,
        client,
        mutation,
        &payload,
        &json!(true),
    )
    .await?;
    tx.commit().await?;
    Ok(true)
}

pub async fn unskip(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
    client: &str,
    mutation: &str,
) -> Result<bool> {
    let payload = json!({"kind":"unskip_review","workspace":workspace,"entry":entry});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    let revoked = sqlx::query("UPDATE journal_review_skips SET revoked_at=now() WHERE entry_id=$1 AND user_id=$2 AND workspace_id=$3 AND revoked_at IS NULL")
        .bind(entry).bind(user).bind(workspace).execute(&mut *tx).await?;
    ensure!(revoked.rows_affected() == 1, "This trade isn't skipped");
    sqlx::query("UPDATE journal_review_sessions SET completed_json=completed_json-$1::text,record_version=record_version+1,updated_at=now() WHERE user_id=$2 AND workspace_id=$3 AND completed_json ? $1")
        .bind(entry).bind(user).bind(workspace).execute(&mut *tx).await?;
    commands::changed(
        &mut tx,
        user,
        workspace,
        "review_skip",
        json!({"entryId":entry,"reason":null}),
    )
    .await?;
    commands::acknowledge(
        &mut tx,
        user,
        workspace,
        client,
        mutation,
        &payload,
        &json!(true),
    )
    .await?;
    tx.commit().await?;
    Ok(true)
}

/// Records a trade as done in a session and moves the cursor to the next one
/// still waiting.
pub(super) async fn mark_done(
    connection: &mut PgConnection,
    session: &str,
    entry: &str,
) -> Result<()> {
    sqlx::query("UPDATE journal_review_sessions SET completed_json=CASE WHEN completed_json ? $2 THEN completed_json ELSE completed_json||jsonb_build_array($2::text) END,record_version=record_version+1,updated_at=now() WHERE id=$1")
        .bind(session).bind(entry).execute(&mut *connection).await?;
    sqlx::query("UPDATE journal_review_sessions s SET cursor_entry_id=(SELECT value FROM jsonb_array_elements_text(s.queue_json) WITH ORDINALITY q(value,position) WHERE NOT(s.completed_json ? value) ORDER BY position LIMIT 1) WHERE id=$1")
        .bind(session).execute(connection).await?;
    Ok(())
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
