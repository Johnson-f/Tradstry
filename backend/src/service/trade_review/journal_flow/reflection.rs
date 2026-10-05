use super::commands;
use anyhow::{Result, anyhow, ensure};
use async_graphql::{InputObject, SimpleObject};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool, Row};

#[derive(Debug, Clone, Serialize, Deserialize, InputObject)]
#[graphql(name = "JournalContextInputV2", rename_fields = "camelCase")]
pub struct ContextInput {
    pub entry_id: String,
    pub expected_version: i64,
    pub stop_state: String,
    pub stop_price: Option<String>,
    pub playbook_id: Option<String>,
    pub claimed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tag_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub violated_principle_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalContextV2", rename_fields = "camelCase")]
pub struct ContextView {
    pub entry_id: String,
    pub version: i64,
    pub stop_state: String,
    pub stop_price: Option<String>,
    pub legacy_stop_price: Option<String>,
    pub playbook_id: Option<String>,
    pub note_id: Option<String>,
    pub phase: Option<String>,
    pub recorded_at: Option<String>,
    pub claimed_at: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub tag_ids: Vec<String>,
    #[serde(default)]
    pub violated_principle_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, InputObject)]
#[graphql(name = "JournalReviewDraftInputV2", rename_fields = "camelCase")]
pub struct DraftInput {
    pub entry_id: String,
    pub expected_version: i64,
    pub takeaway: String,
    pub choice_ids: Vec<String>,
    pub plan_adherence: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalReviewDraftV2", rename_fields = "camelCase")]
pub struct DraftView {
    pub entry_id: String,
    pub version: i64,
    pub takeaway: String,
    pub choice_ids: Vec<String>,
    pub plan_adherence: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, InputObject)]
#[graphql(name = "JournalFinalizeReviewInputV2", rename_fields = "camelCase")]
pub struct ReviewInput {
    pub entry_id: String,
    pub expected_entry_revision: i64,
    pub expected_context_version: i64,
    pub expected_draft_version: i64,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalReviewV2", rename_fields = "camelCase")]
pub struct ReviewView {
    pub id: String,
    pub entry_id: String,
    pub version: i64,
    pub entry_revision: i64,
    pub context_revision: i64,
    pub takeaway: String,
    pub choice_ids: Vec<String>,
    pub plan_adherence: Option<String>,
    pub created_at: String,
}

pub(super) async fn owned_entry(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<sqlx::postgres::PgRow> {
    sqlx::query("SELECT e.*,to_jsonb(e) AS snapshot FROM journal_entries e WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND deleted_at IS NULL AND retired_at IS NULL FOR UPDATE")
        .bind(entry).bind(user).bind(workspace).fetch_optional(connection).await?.ok_or_else(||anyhow!("Journal trade not found"))
}

pub async fn context(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<ContextView> {
    let mut connection = pool.acquire().await?;
    context_connection(&mut connection, user, workspace, entry).await
}

async fn context_connection(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<ContextView> {
    let row=sqlx::query("SELECT e.id,e.notes,ARRAY(SELECT tag_id FROM trade_tags WHERE journal_entry_id=e.id ORDER BY tag_id) AS tag_ids,ARRAY(SELECT principle_id FROM trade_principle_violations WHERE journal_entry_id=e.id ORDER BY principle_id) AS violated_principle_ids,e.stop_loss::text,coalesce(c.record_version,0) AS version,coalesce(c.stop_state,'unknown') AS stop_state,c.stop_price::text,CASE WHEN coalesce(c.record_version,0)=0 THEN e.playbook_id ELSE c.playbook_id END AS playbook_id,c.companion_note_id,v.phase,v.recorded_at,v.claimed_at
        FROM journal_entries e LEFT JOIN journal_trade_context c ON c.entry_id=e.id
        LEFT JOIN LATERAL (SELECT phase,recorded_at,claimed_at FROM journal_trade_context_events WHERE entry_id=e.id AND user_id=e.user_id AND workspace_id=e.workspace_id ORDER BY record_version DESC LIMIT 1) v ON true
        WHERE e.id=$1 AND e.user_id=$2 AND e.workspace_id=$3 AND e.deleted_at IS NULL")
        .bind(entry).bind(user).bind(workspace).fetch_optional(connection).await?.ok_or_else(||anyhow!("Journal trade not found"))?;
    Ok(ContextView {
        entry_id: entry.into(),
        version: row.try_get("version")?,
        notes: row.try_get("notes")?,
        tag_ids: row.try_get("tag_ids")?,
        violated_principle_ids: row.try_get("violated_principle_ids")?,
        stop_state: row.try_get("stop_state")?,
        stop_price: row.try_get("stop_price")?,
        legacy_stop_price: row.try_get("stop_loss")?,
        playbook_id: row.try_get("playbook_id")?,
        note_id: row.try_get("companion_note_id")?,
        phase: row.try_get("phase")?,
        recorded_at: row
            .try_get::<Option<DateTime<Utc>>, _>("recorded_at")?
            .map(|d| d.to_rfc3339()),
        claimed_at: row
            .try_get::<Option<DateTime<Utc>>, _>("claimed_at")?
            .map(|d| d.to_rfc3339()),
    })
}

pub async fn save_context(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: ContextInput,
    client: &str,
    mutation: &str,
) -> Result<ContextView> {
    ensure!(
        matches!(input.stop_state.as_str(), "unknown" | "none" | "price"),
        "Choose unknown, no stop, or a stop price"
    );
    let price = input
        .stop_price
        .as_deref()
        .map(str::parse::<Decimal>)
        .transpose()?;
    ensure!(
        if input.stop_state == "price" {
            price.is_some_and(|p| p > Decimal::ZERO)
        } else {
            price.is_none()
        },
        "A stop price must be positive and supplied only for a price stop"
    );
    let claimed = input
        .claimed_at
        .as_deref()
        .map(DateTime::parse_from_rfc3339)
        .transpose()?
        .map(|d| d.with_timezone(&Utc));
    let payload = json!({"kind":"context","workspace":workspace,"input":input});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    let entry = owned_entry(&mut tx, user, workspace, &input.entry_id).await?;
    if let Some(playbook) = &input.playbook_id {
        let owned:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM playbooks WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL AND (availability='all' OR EXISTS(SELECT 1 FROM playbook_workspace_applicability a WHERE a.playbook_id=playbooks.id AND a.workspace_id=$3)))").bind(playbook).bind(user).bind(workspace).fetch_one(&mut *tx).await?;
        ensure!(owned, "Playbook is unavailable in this workspace");
    }
    sqlx::query("INSERT INTO journal_trade_context(entry_id,user_id,workspace_id) VALUES ($1,$2,$3) ON CONFLICT(entry_id) DO NOTHING")
        .bind(&input.entry_id).bind(user).bind(workspace).execute(&mut *tx).await?;
    let row=sqlx::query("UPDATE journal_trade_context SET stop_state=$4,stop_price=$5,playbook_id=$6,record_version=record_version+1,updated_at=now() WHERE entry_id=$1 AND user_id=$2 AND workspace_id=$3 AND record_version=$7 RETURNING record_version,companion_note_id")
        .bind(&input.entry_id).bind(user).bind(workspace).bind(&input.stop_state).bind(price).bind(&input.playbook_id).bind(input.expected_version).fetch_optional(&mut *tx).await?.ok_or_else(||anyhow!("CONFLICT: context changed on another device"))?;
    let version: i64 = row.try_get("record_version")?;
    sqlx::query("UPDATE journal_entries SET playbook_id=$4,notes=CASE WHEN $5::text IS NULL THEN notes ELSE $5 END WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
        .bind(&input.entry_id).bind(user).bind(workspace).bind(&input.playbook_id).bind(&input.notes).execute(&mut *tx).await?;
    if let Some(ids) = &input.tag_ids {
        crate::service::db::schema::tables::journal_table::replace_trade_tags_tx(
            &mut tx,
            user,
            workspace,
            &input.entry_id,
            ids,
        )
        .await?;
    }
    if let Some(ids) = &input.violated_principle_ids {
        crate::service::db::schema::tables::journal_table::replace_principle_violations_tx(
            &mut tx,
            user,
            workspace,
            &input.entry_id,
            ids,
        )
        .await?;
    }
    let recorded = Utc::now();
    let opened: Option<DateTime<Utc>> = entry.try_get("open_date")?;
    let closed: Option<DateTime<Utc>> = entry.try_get("close_date")?;
    let phase =
        if opened.is_none() || entry.try_get::<String, _>("lifecycle_state")? == "incomplete" {
            "unknown"
        } else if opened.is_some_and(|date| recorded < date) {
            "pre_entry"
        } else if closed.is_some_and(|date| recorded >= date) {
            "retrospective"
        } else {
            "during_trade"
        };
    sqlx::query("INSERT INTO journal_trade_context_events(id,entry_id,user_id,workspace_id,record_version,kind,phase,payload_json,recorded_at,claimed_at) VALUES ($1,$2,$3,$4,$5,'risk_strategy',$6,$7,$8,$9)")
        .bind(crate::ids::new_uuid_v7().to_string()).bind(&input.entry_id).bind(user).bind(workspace).bind(version).bind(phase).bind(serde_json::to_value(&input)?).bind(recorded).bind(claimed).execute(&mut *tx).await?;
    let result = context_connection(&mut tx, user, workspace, &input.entry_id).await?;
    commands::changed(
        &mut tx,
        user,
        workspace,
        "context",
        serde_json::to_value(&result)?,
    )
    .await?;
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
    Ok(result)
}

pub async fn ensure_note(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry_id: &str,
    client: &str,
    mutation: &str,
) -> Result<String> {
    use crate::service::db::schema::tables::notebook::{crdt, notes};
    let payload = json!({"kind":"context_note","workspace":workspace,"entry":entry_id});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    let entry = owned_entry(&mut tx, user, workspace, entry_id).await?;
    sqlx::query("INSERT INTO journal_trade_context(entry_id,user_id,workspace_id) VALUES ($1,$2,$3) ON CONFLICT(entry_id) DO NOTHING").bind(entry_id).bind(user).bind(workspace).execute(&mut *tx).await?;
    let existing:Option<String>=sqlx::query_scalar("SELECT companion_note_id FROM journal_trade_context WHERE entry_id=$1 AND user_id=$2 AND workspace_id=$3").bind(entry_id).bind(user).bind(workspace).fetch_one(&mut *tx).await?;
    let note = if let Some(id) = existing {
        id
    } else {
        let text = entry
            .try_get::<Option<String>, _>("notes")?
            .unwrap_or_default();
        let document = json!({"root":{"children":[{"children":[{"detail":0,"format":0,"mode":"normal","style":"","text":text,"type":"text","version":1}],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}});
        let id = notes::create_notebook_note_tx(
            &mut tx,
            user,
            notes::CreateNotebookNoteInput {
                id: None,
                workspace_id: workspace.into(),
                document_json: document.to_string(),
                trade_ids: vec![entry_id.into()],
                folder_id: None,
            },
            &crate::service::hlc::stamp(),
        )
        .await?;
        sqlx::query("UPDATE notebook_notes SET purpose='trade_context' WHERE id=$1 AND user_id=$2 AND workspace_id=$3").bind(&id).bind(user).bind(workspace).execute(&mut *tx).await?;
        sqlx::query("UPDATE journal_trade_context SET companion_note_id=$2 WHERE entry_id=$1 AND user_id=$3 AND workspace_id=$4").bind(entry_id).bind(&id).bind(user).bind(workspace).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO notebook_note_crdt(note_id,state,state_vector) VALUES ($1,'seeding',''::bytea) ON CONFLICT(note_id) DO NOTHING").bind(&id).execute(&mut *tx).await?;
        id
    };
    commands::acknowledge(
        &mut tx,
        user,
        workspace,
        client,
        mutation,
        &payload,
        &json!(note),
    )
    .await?;
    commands::changed(
        &mut tx,
        user,
        workspace,
        "context_note",
        json!({"entryId":entry_id,"noteId":note}),
    )
    .await?;
    tx.commit().await?;
    let seed_pool = pool.clone();
    let seed_id = note.clone();
    tokio::spawn(async move {
        if let Err(error) = crdt::seed_note(&seed_pool, &seed_id).await {
            log::warn!("trade context note seed will retry: {error:#}");
        }
    });
    Ok(note)
}

fn validate_reflection(takeaway: &str, choices: &[String], adherence: Option<&str>) -> Result<()> {
    ensure!(
        takeaway.chars().count() <= 4000,
        "Keep the takeaway within 4,000 characters"
    );
    ensure!(
        choices.len() <= 12
            && choices.iter().all(|choice| matches!(
                choice.as_str(),
                "entered_early"
                    | "entered_late"
                    | "moved_stop"
                    | "followed_exit_plan"
                    | "exited_early"
                    | "held_too_long"
                    | "sized_well"
                    | "oversized"
                    | "followed_plan"
                    | "no_plan"
            )),
        "Unknown review choice"
    );
    ensure!(
        adherence.is_none_or(|value| matches!(value, "yes" | "partly" | "no" | "no_plan")),
        "Unknown plan adherence answer"
    );
    Ok(())
}

pub async fn draft(pool: &PgPool, user: &str, workspace: &str, entry: &str) -> Result<DraftView> {
    let row=sqlx::query("SELECT e.id,coalesce(d.record_version,0) AS version,coalesce(d.takeaway,'') AS takeaway,coalesce(d.choice_ids,'[]') AS choice_ids,d.plan_adherence FROM journal_entries e LEFT JOIN journal_review_drafts d ON d.entry_id=e.id WHERE e.id=$1 AND e.user_id=$2 AND e.workspace_id=$3 AND e.deleted_at IS NULL")
        .bind(entry).bind(user).bind(workspace).fetch_optional(pool).await?.ok_or_else(||anyhow!("Journal trade not found"))?;
    Ok(DraftView {
        entry_id: entry.into(),
        version: row.try_get("version")?,
        takeaway: row.try_get("takeaway")?,
        choice_ids: serde_json::from_value(row.try_get("choice_ids")?)?,
        plan_adherence: row.try_get("plan_adherence")?,
    })
}

pub async fn save_draft(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: DraftInput,
    client: &str,
    mutation: &str,
) -> Result<DraftView> {
    validate_reflection(
        &input.takeaway,
        &input.choice_ids,
        input.plan_adherence.as_deref(),
    )?;
    let payload = json!({"kind":"review_draft","workspace":workspace,"input":input});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    owned_entry(&mut tx, user, workspace, &input.entry_id).await?;
    sqlx::query("INSERT INTO journal_review_drafts(entry_id,user_id,workspace_id) VALUES ($1,$2,$3) ON CONFLICT(entry_id) DO NOTHING").bind(&input.entry_id).bind(user).bind(workspace).execute(&mut *tx).await?;
    let version:Option<i64>=sqlx::query_scalar("UPDATE journal_review_drafts SET takeaway=$4,choice_ids=$5,plan_adherence=$6,record_version=record_version+1,updated_at=now() WHERE entry_id=$1 AND user_id=$2 AND workspace_id=$3 AND record_version=$7 RETURNING record_version")
        .bind(&input.entry_id).bind(user).bind(workspace).bind(&input.takeaway).bind(json!(input.choice_ids)).bind(&input.plan_adherence).bind(input.expected_version).fetch_optional(&mut *tx).await?;
    let result = DraftView {
        entry_id: input.entry_id,
        version: version
            .ok_or_else(|| anyhow!("CONFLICT: this draft changed on another device"))?,
        takeaway: input.takeaway,
        choice_ids: input.choice_ids,
        plan_adherence: input.plan_adherence,
    };
    commands::changed(
        &mut tx,
        user,
        workspace,
        "review_draft",
        serde_json::to_value(&result)?,
    )
    .await?;
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
    Ok(result)
}

pub async fn finalize(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: ReviewInput,
    client: &str,
    mutation: &str,
) -> Result<ReviewView> {
    let payload = json!({"kind":"mark_reviewed","workspace":workspace,"input":input});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_workspace(&mut tx, user, workspace).await?;
    let entry = owned_entry(&mut tx, user, workspace, &input.entry_id).await?;
    ensure!(
        entry.try_get::<String, _>("lifecycle_state")? == "closed",
        "Close and reconcile the trade before marking it reviewed"
    );
    ensure!(
        entry.try_get::<i64, _>("materialized_revision")? == input.expected_entry_revision,
        "CONFLICT: trade results changed; review the current results"
    );
    let context_revision:i64=sqlx::query_scalar("SELECT coalesce((SELECT record_version FROM journal_trade_context WHERE entry_id=$1 AND user_id=$2 AND workspace_id=$3),0)").bind(&input.entry_id).bind(user).bind(workspace).fetch_one(&mut *tx).await?;
    ensure!(
        context_revision == input.expected_context_version,
        "CONFLICT: trade context changed"
    );
    let row=sqlx::query("SELECT record_version,takeaway,choice_ids,plan_adherence FROM journal_review_drafts WHERE entry_id=$1 AND user_id=$2 AND workspace_id=$3 FOR UPDATE").bind(&input.entry_id).bind(user).bind(workspace).fetch_optional(&mut *tx).await?.ok_or_else(||anyhow!("Write a personal takeaway before marking reviewed"))?;
    ensure!(
        row.try_get::<i64, _>("record_version")? == input.expected_draft_version,
        "CONFLICT: your draft changed"
    );
    let takeaway = row.try_get::<String, _>("takeaway")?.trim().to_string();
    ensure!(
        !takeaway.is_empty(),
        "Write a personal takeaway before marking reviewed"
    );
    let choices: Vec<String> = serde_json::from_value(row.try_get("choice_ids")?)?;
    let adherence: Option<String> = row.try_get("plan_adherence")?;
    validate_reflection(&takeaway, &choices, adherence.as_deref())?;
    let version: i64 = sqlx::query_scalar(
        "SELECT coalesce(max(review_version),0)+1 FROM journal_trade_reviews WHERE entry_id=$1",
    )
    .bind(&input.entry_id)
    .fetch_one(&mut *tx)
    .await?;
    let id = crate::ids::new_uuid_v7().to_string();
    let created = Utc::now();
    if let Some(session) = &input.session_id {
        let queue:Option<Value>=sqlx::query_scalar("SELECT queue_json FROM journal_review_sessions WHERE id=$1 AND user_id=$2 AND workspace_id=$3 FOR UPDATE").bind(session).bind(user).bind(workspace).fetch_optional(&mut *tx).await?;
        ensure!(
            queue
                .as_ref()
                .and_then(Value::as_array)
                .is_some_and(|ids| ids.iter().any(|id| id.as_str() == Some(&input.entry_id))),
            "Trade is not in this review session"
        );
    }
    sqlx::query("INSERT INTO journal_trade_reviews(id,entry_id,user_id,workspace_id,review_version,entry_revision,context_revision,takeaway,choice_ids,plan_adherence,snapshot_json,session_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)")
        .bind(&id).bind(&input.entry_id).bind(user).bind(workspace).bind(version).bind(input.expected_entry_revision).bind(context_revision).bind(&takeaway).bind(json!(choices)).bind(&adherence).bind(entry.try_get::<Value,_>("snapshot")?).bind(&input.session_id).bind(created).execute(&mut *tx).await?;
    if let Some(session) = &input.session_id {
        sqlx::query("UPDATE journal_review_sessions SET completed_json=CASE WHEN completed_json ? $2 THEN completed_json ELSE completed_json||jsonb_build_array($2::text) END,record_version=record_version+1,updated_at=now() WHERE id=$1 AND user_id=$3 AND workspace_id=$4")
            .bind(session).bind(&input.entry_id).bind(user).bind(workspace).execute(&mut *tx).await?;
        sqlx::query("UPDATE journal_review_sessions s SET cursor_entry_id=(SELECT value FROM jsonb_array_elements_text(s.queue_json) WITH ORDINALITY q(value,position) WHERE NOT(s.completed_json ? value) ORDER BY position LIMIT 1) WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
            .bind(session).bind(user).bind(workspace).execute(&mut *tx).await?;
    }
    let result = ReviewView {
        id,
        entry_id: input.entry_id,
        version,
        entry_revision: input.expected_entry_revision,
        context_revision,
        takeaway,
        choice_ids: choices,
        plan_adherence: adherence,
        created_at: created.to_rfc3339(),
    };
    commands::changed(
        &mut tx,
        user,
        workspace,
        "review",
        serde_json::to_value(&result)?,
    )
    .await?;
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
    Ok(result)
}
