use std::str::FromStr;

use anyhow::{Result, anyhow, ensure};
use async_graphql::{InputObject, SimpleObject};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{PgConnection, PgPool, Row};

use super::commands;
use crate::service::trade_review::{
    actions::{Action, ActionJoin, Timeline, label_actions, suggest_joins},
    types::{EpisodeDirection, FillAllocation, FillRole, TradeEpisodeDraft},
};

const MAX_REASON: usize = 5000;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalActionNoteV2", rename_fields = "camelCase")]
pub struct NoteView {
    pub id: String,
    pub kind: String,
    pub parent_id: Option<String>,
    pub anchor_execution_id: String,
    pub anchor_role: String,
    pub reason: String,
    pub stop_price: Option<String>,
    pub target_price: Option<String>,
    pub locked: bool,
    pub written_late: bool,
    pub orphaned: bool,
    pub version: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalActionV2", rename_fields = "camelCase")]
pub struct ActionView {
    pub kind: String,
    pub role: String,
    pub anchor_execution_id: String,
    pub execution_ids: Vec<String>,
    pub quantity: String,
    pub price: String,
    pub fee: String,
    pub first_executed_at: String,
    pub last_executed_at: String,
    pub position_after: String,
    pub join_id: Option<String>,
    pub notes: Vec<NoteView>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(name = "JournalTradeActionsV2", rename_fields = "camelCase")]
pub struct TradeActions {
    pub entry_id: String,
    pub direction: Option<String>,
    pub closed: bool,
    pub actions: Vec<ActionView>,
    pub suggested_joins: Vec<Vec<String>>,
    pub broken_joins: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, InputObject)]
#[graphql(name = "JournalActionNoteInputV2", rename_fields = "camelCase")]
pub struct NoteInput {
    pub entry_id: String,
    pub anchor_execution_id: String,
    pub anchor_role: String,
    pub expected_version: Option<i64>,
    pub reason: String,
    pub stop_price: Option<String>,
    pub target_price: Option<String>,
}

pub(super) fn role_name(role: FillRole) -> &'static str {
    match role {
        FillRole::Entry => "entry",
        FillRole::Exit => "exit",
    }
}

/// The trade behind a journal entry, rebuilt from its stored fills.
pub(super) async fn entry_draft(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<Option<TradeEpisodeDraft>> {
    let Some(episode) = sqlx::query("SELECT e.id,e.instrument_json,e.direction,e.opened_at,e.closed_at,e.current_quantity,e.fingerprint FROM journal_entries j JOIN trade_episodes e ON e.id=j.episode_id AND e.user_id=j.user_id AND e.workspace_id=j.workspace_id
        WHERE j.id=$1 AND j.user_id=$2 AND j.workspace_id=$3 AND j.deleted_at IS NULL AND e.retired_at IS NULL")
        .bind(entry).bind(user).bind(workspace).fetch_optional(&mut *connection).await? else {
        return Ok(None);
    };
    let episode_id: String = episode.try_get("id")?;
    let fills = sqlx::query("SELECT coalesce(brokerage_transaction_id,'opening:'||opening_position_id) AS transaction_id,role,quantity,price,fee,executed_at FROM trade_episode_fills WHERE episode_id=$1 ORDER BY executed_at,allocation_order,id")
        .bind(&episode_id).fetch_all(&mut *connection).await?;
    let allocations = fills
        .into_iter()
        .map(|row| {
            Ok(FillAllocation {
                transaction_id: row.try_get("transaction_id")?,
                role: if row.try_get::<String, _>("role")? == "entry" {
                    FillRole::Entry
                } else {
                    FillRole::Exit
                },
                quantity: row.try_get("quantity")?,
                price: row.try_get("price")?,
                fee: row.try_get("fee")?,
                executed_at: row.try_get("executed_at")?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(Some(TradeEpisodeDraft {
        instrument: serde_json::from_value(episode.try_get("instrument_json")?)?,
        direction: if episode.try_get::<String, _>("direction")? == "long" {
            EpisodeDirection::Long
        } else {
            EpisodeDirection::Short
        },
        allocations,
        opened_at: episode.try_get("opened_at")?,
        closed_at: episode.try_get("closed_at")?,
        current_quantity: episode.try_get("current_quantity")?,
        fingerprint: episode.try_get("fingerprint")?,
    }))
}

async fn active_joins(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
) -> Result<Vec<ActionJoin>> {
    let rows = sqlx::query("SELECT id,execution_ids FROM journal_action_joins WHERE user_id=$1 AND workspace_id=$2 AND revoked_at IS NULL ORDER BY created_at,id")
        .bind(user).bind(workspace).fetch_all(connection).await?;
    rows.into_iter()
        .map(|row| {
            Ok(ActionJoin {
                id: row.try_get("id")?,
                execution_ids: row.try_get("execution_ids")?,
            })
        })
        .collect()
}

pub(super) async fn timeline(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    draft: &TradeEpisodeDraft,
) -> Result<Timeline> {
    let joins = active_joins(connection, user, workspace).await?;
    Ok(label_actions(draft, &joins))
}

fn latest_execution(draft: &TradeEpisodeDraft) -> Option<DateTime<Utc>> {
    draft.allocations.iter().map(|fill| fill.executed_at).max()
}

fn note_view(row: &sqlx::postgres::PgRow, trade_latest: Option<DateTime<Utc>>) -> Result<NoteView> {
    let seen_through: DateTime<Utc> = row.try_get("seen_through")?;
    let kind: String = row.try_get("kind")?;
    let locked = kind == "hindsight"
        || row
            .try_get::<Option<DateTime<Utc>>, _>("locked_at")?
            .is_some()
        || trade_latest.is_some_and(|latest| latest > seen_through);
    Ok(NoteView {
        id: row.try_get("id")?,
        kind,
        parent_id: row.try_get("parent_id")?,
        anchor_execution_id: row.try_get("anchor_execution_id")?,
        anchor_role: row.try_get("anchor_role")?,
        reason: row.try_get("reason")?,
        stop_price: row
            .try_get::<Option<Decimal>, _>("stop_price")?
            .map(|price| price.normalize().to_string()),
        target_price: row
            .try_get::<Option<Decimal>, _>("target_price")?
            .map(|price| price.normalize().to_string()),
        locked,
        written_late: row.try_get("written_late")?,
        orphaned: row
            .try_get::<Option<DateTime<Utc>>, _>("orphaned_at")?
            .is_some(),
        version: row.try_get("record_version")?,
        created_at: row.try_get::<DateTime<Utc>, _>("created_at")?.to_rfc3339(),
        updated_at: row.try_get::<DateTime<Utc>, _>("updated_at")?.to_rfc3339(),
    })
}

const NOTE_COLUMNS: &str = "id,kind,parent_id,anchor_execution_id,anchor_role,reason,stop_price,target_price,seen_through,written_late,record_version,locked_at,orphaned_at,created_at,updated_at";

/// Notes on any of these actions, plan notes first, oldest first.
pub(super) async fn notes_for(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    draft: &TradeEpisodeDraft,
) -> Result<Vec<(String, String, NoteView)>> {
    let ids = draft
        .allocations
        .iter()
        .map(|fill| fill.transaction_id.clone())
        .collect::<Vec<_>>();
    let roles = draft
        .allocations
        .iter()
        .map(|fill| role_name(fill.role).to_owned())
        .collect::<Vec<_>>();
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!("SELECT {NOTE_COLUMNS} FROM journal_action_notes n
        WHERE user_id=$1 AND workspace_id=$2 AND (anchor_execution_id,anchor_role) IN (SELECT * FROM unnest($3::text[],$4::text[]))
        ORDER BY kind='hindsight',created_at,id")))
        .bind(user).bind(workspace).bind(&ids).bind(&roles).fetch_all(connection).await?;
    let latest = latest_execution(draft);
    rows.iter()
        .map(|row| {
            Ok((
                row.try_get("anchor_execution_id")?,
                row.try_get("anchor_role")?,
                note_view(row, latest)?,
            ))
        })
        .collect()
}

fn action_view(action: &Action, notes: &[(String, String, NoteView)]) -> ActionView {
    let role = role_name(action.role);
    ActionView {
        kind: action.kind.name().into(),
        role: role.into(),
        anchor_execution_id: action.anchor().into(),
        execution_ids: action.execution_ids.clone(),
        quantity: action.quantity.normalize().to_string(),
        price: action.price.round_dp(8).normalize().to_string(),
        fee: action.fee.normalize().to_string(),
        first_executed_at: action.first_executed_at.to_rfc3339(),
        last_executed_at: action.last_executed_at.to_rfc3339(),
        position_after: action.position_after.normalize().to_string(),
        join_id: action.join_id.clone(),
        notes: notes
            .iter()
            .filter(|(anchor, anchor_role, _)| {
                anchor_role == role && action.execution_ids.contains(anchor)
            })
            .map(|(_, _, note)| note.clone())
            .collect(),
    }
}

pub async fn trade_actions(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<TradeActions> {
    let mut connection = pool.acquire().await?;
    trade_actions_connection(&mut connection, user, workspace, entry).await
}

pub(super) async fn trade_actions_connection(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<TradeActions> {
    let Some(draft) = entry_draft(connection, user, workspace, entry).await? else {
        return Ok(TradeActions {
            entry_id: entry.into(),
            direction: None,
            closed: false,
            actions: vec![],
            suggested_joins: vec![],
            broken_joins: vec![],
        });
    };
    let timeline = timeline(connection, user, workspace, &draft).await?;
    let notes = notes_for(connection, user, workspace, &draft).await?;
    Ok(TradeActions {
        entry_id: entry.into(),
        direction: Some(
            match draft.direction {
                EpisodeDirection::Long => "long",
                EpisodeDirection::Short => "short",
            }
            .into(),
        ),
        closed: draft.closed_at.is_some(),
        actions: timeline
            .actions
            .iter()
            .map(|action| action_view(action, &notes))
            .collect(),
        suggested_joins: suggest_joins(&timeline.actions),
        broken_joins: timeline.broken_joins,
    })
}

fn parse_price(text: Option<&str>, label: &str) -> Result<Option<Decimal>> {
    let Some(text) = text.map(str::trim).filter(|text| !text.is_empty()) else {
        return Ok(None);
    };
    let price = Decimal::from_str(text).map_err(|_| anyhow!("Enter the {label} as a number"))?;
    ensure!(price > Decimal::ZERO, "The {label} must be more than zero");
    Ok(Some(price))
}

/// Saves the user's note on an action. A note stays editable until another
/// execution joins the trade or the trade is reviewed; after that, later
/// thoughts go in a hindsight note.
pub async fn save_note(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: NoteInput,
    client: &str,
    mutation: &str,
) -> Result<NoteView> {
    let payload = json!({"kind":"save_action_note","workspace":workspace,"input":input});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    let reason = input.reason.trim().to_owned();
    ensure!(
        reason.chars().count() <= MAX_REASON,
        "Keep the note under {MAX_REASON} characters"
    );
    let stop = parse_price(input.stop_price.as_deref(), "stop")?;
    let target = parse_price(input.target_price.as_deref(), "target")?;
    ensure!(
        !reason.is_empty() || stop.is_some() || target.is_some(),
        "Write why, or add a stop or target"
    );
    let draft = entry_draft(&mut tx, user, workspace, &input.entry_id)
        .await?
        .ok_or_else(|| anyhow!("This trade has no broker actions to note"))?;
    let timeline = timeline(&mut tx, user, workspace, &draft).await?;
    let action = timeline
        .actions
        .iter()
        .find(|action| {
            role_name(action.role) == input.anchor_role
                && action.execution_ids.contains(&input.anchor_execution_id)
        })
        .ok_or_else(|| anyhow!("This action is no longer part of the trade"))?;
    let latest = latest_execution(&draft).unwrap_or(action.last_executed_at);
    let existing = sqlx::query(sqlx::AssertSqlSafe(format!("SELECT {NOTE_COLUMNS} FROM journal_action_notes WHERE user_id=$1 AND workspace_id=$2 AND anchor_execution_id=$3 AND anchor_role=$4 AND kind='plan' FOR UPDATE")))
        .bind(user).bind(workspace).bind(&input.anchor_execution_id).bind(&input.anchor_role).fetch_optional(&mut *tx).await?;
    let id = if let Some(row) = existing {
        let current = note_view(&row, Some(latest))?;
        ensure!(
            input.expected_version == Some(current.version),
            "CONFLICT: this note changed on another device"
        );
        ensure!(
            !current.locked,
            "This note is locked. Add a hindsight note instead."
        );
        sqlx::query("UPDATE journal_action_notes SET reason=$2,stop_price=$3,target_price=$4,execution_ids=$5,record_version=record_version+1,updated_at=now() WHERE id=$1")
            .bind(&current.id).bind(&reason).bind(stop).bind(target).bind(&action.execution_ids).execute(&mut *tx).await?;
        current.id
    } else {
        ensure!(
            input.expected_version.is_none(),
            "CONFLICT: this note was removed"
        );
        let id = crate::ids::new_uuid_v7().to_string();
        sqlx::query("INSERT INTO journal_action_notes(id,user_id,workspace_id,anchor_execution_id,anchor_role,execution_ids,kind,reason,stop_price,target_price,seen_through,written_late) VALUES ($1,$2,$3,$4,$5,$6,'plan',$7,$8,$9,$10,$11)")
            .bind(&id).bind(user).bind(workspace).bind(&input.anchor_execution_id).bind(&input.anchor_role).bind(&action.execution_ids)
            .bind(&reason).bind(stop).bind(target).bind(latest).bind(latest > action.last_executed_at)
            .execute(&mut *tx).await?;
        id
    };
    let view = fetch_note(&mut tx, user, workspace, &id, Some(latest)).await?;
    finish(&mut tx, user, workspace, client, mutation, &payload, &view).await?;
    tx.commit().await?;
    Ok(view)
}

async fn fetch_note(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    id: &str,
    trade_latest: Option<DateTime<Utc>>,
) -> Result<NoteView> {
    let row = sqlx::query(sqlx::AssertSqlSafe(format!("SELECT {NOTE_COLUMNS} FROM journal_action_notes WHERE id=$1 AND user_id=$2 AND workspace_id=$3")))
        .bind(id).bind(user).bind(workspace).fetch_optional(connection).await?
        .ok_or_else(|| anyhow!("Note not found"))?;
    note_view(&row, trade_latest)
}

async fn finish(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    client: &str,
    mutation: &str,
    payload: &serde_json::Value,
    view: &NoteView,
) -> Result<()> {
    commands::changed(
        connection,
        user,
        workspace,
        "action_note",
        json!({"noteId":view.id}),
    )
    .await?;
    commands::acknowledge(
        connection,
        user,
        workspace,
        client,
        mutation,
        payload,
        &serde_json::to_value(view)?,
    )
    .await
}

/// A later thought on a locked note. Hindsight notes are never edited, so the
/// original and the reflection both stay as written.
pub async fn add_hindsight(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    parent: &str,
    reason: &str,
    client: &str,
    mutation: &str,
) -> Result<NoteView> {
    let payload =
        json!({"kind":"add_hindsight_note","workspace":workspace,"parent":parent,"reason":reason});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    let reason = reason.trim();
    ensure!(!reason.is_empty(), "Write the hindsight note first");
    ensure!(
        reason.chars().count() <= MAX_REASON,
        "Keep the note under {MAX_REASON} characters"
    );
    let row = sqlx::query("SELECT n.anchor_execution_id,n.anchor_role,n.execution_ids,n.locked_at IS NOT NULL AS locked,
        (SELECT max(g.executed_at) FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id AND e.retired_at IS NULL AND e.user_id=n.user_id AND e.workspace_id=n.workspace_id
           JOIN trade_episode_fills g ON g.episode_id=e.id
         WHERE coalesce(f.brokerage_transaction_id,'opening:'||f.opening_position_id)=n.anchor_execution_id AND f.role=n.anchor_role) > n.seen_through AS moved_on
        FROM journal_action_notes n WHERE n.id=$1 AND n.user_id=$2 AND n.workspace_id=$3 AND n.kind='plan' FOR UPDATE")
        .bind(parent).bind(user).bind(workspace).fetch_optional(&mut *tx).await?
        .ok_or_else(|| anyhow!("Note not found"))?;
    ensure!(
        row.try_get::<bool, _>("locked")?
            || row.try_get::<Option<bool>, _>("moved_on")?.unwrap_or(false),
        "This note can still be edited, so change it directly"
    );
    let id = crate::ids::new_uuid_v7().to_string();
    sqlx::query("INSERT INTO journal_action_notes(id,user_id,workspace_id,anchor_execution_id,anchor_role,execution_ids,kind,parent_id,reason,seen_through,written_late) VALUES ($1,$2,$3,$4,$5,$6,'hindsight',$7,$8,now(),true)")
        .bind(&id).bind(user).bind(workspace)
        .bind(row.try_get::<String, _>("anchor_execution_id")?).bind(row.try_get::<String, _>("anchor_role")?).bind(row.try_get::<Vec<String>, _>("execution_ids")?)
        .bind(parent).bind(reason).execute(&mut *tx).await?;
    let view = fetch_note(&mut tx, user, workspace, &id, None).await?;
    finish(&mut tx, user, workspace, client, mutation, &payload, &view).await?;
    tx.commit().await?;
    Ok(view)
}

pub struct JoinInput<'a> {
    pub entry: &'a str,
    pub execution_ids: &'a [String],
}

/// Records that these neighbouring executions are pieces of one order.
pub async fn join(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    input: JoinInput<'_>,
    client: &str,
    mutation: &str,
) -> Result<String> {
    let payload = json!({"kind":"join_actions","workspace":workspace,"entry":input.entry,"executions":input.execution_ids});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    ensure!(
        input.execution_ids.len() >= 2,
        "Choose at least two executions to combine"
    );
    let draft = entry_draft(&mut tx, user, workspace, input.entry)
        .await?
        .ok_or_else(|| anyhow!("This trade has no broker actions to combine"))?;
    let mut joins = active_joins(&mut tx, user, workspace).await?;
    let id = crate::ids::new_uuid_v7().to_string();
    joins.retain(|join| {
        !join
            .execution_ids
            .iter()
            .any(|execution| input.execution_ids.contains(execution))
    });
    joins.push(ActionJoin {
        id: id.clone(),
        execution_ids: input.execution_ids.to_vec(),
    });
    let timeline = label_actions(&draft, &joins);
    ensure!(
        !timeline.broken_joins.contains(&id)
            && timeline
                .actions
                .iter()
                .any(|action| action.join_id.as_deref() == Some(id.as_str())),
        "Only neighbouring executions on the same side can be combined"
    );
    sqlx::query("UPDATE journal_action_joins SET revoked_at=now() WHERE user_id=$1 AND workspace_id=$2 AND revoked_at IS NULL AND execution_ids && $3::text[]")
        .bind(user).bind(workspace).bind(input.execution_ids).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO journal_action_joins(id,user_id,workspace_id,execution_ids) VALUES ($1,$2,$3,$4)")
        .bind(&id).bind(user).bind(workspace).bind(input.execution_ids).execute(&mut *tx).await?;
    commands::changed(
        &mut tx,
        user,
        workspace,
        "action_join",
        json!({"joinId":id}),
    )
    .await?;
    commands::acknowledge(
        &mut tx,
        user,
        workspace,
        client,
        mutation,
        &payload,
        &json!(id),
    )
    .await?;
    tx.commit().await?;
    Ok(id)
}

pub async fn unjoin(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    join: &str,
    client: &str,
    mutation: &str,
) -> Result<bool> {
    let payload = json!({"kind":"unjoin_actions","workspace":workspace,"join":join});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    let revoked = sqlx::query("UPDATE journal_action_joins SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND revoked_at IS NULL")
        .bind(join).bind(user).bind(workspace).execute(&mut *tx).await?;
    ensure!(
        revoked.rows_affected() == 1,
        "These executions are already separate"
    );
    commands::changed(
        &mut tx,
        user,
        workspace,
        "action_join",
        json!({"joinId":join}),
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

/// Locks plan notes whose trade has moved on since they were written, and
/// marks notes whose execution is no longer in any trade. Runs after each
/// projection. A lock is never undone; an orphan clears if its execution
/// comes back.
pub(super) async fn refresh(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
) -> Result<()> {
    sqlx::query("WITH placed AS (
            SELECT n.id,m.episode_id,m.latest FROM journal_action_notes n
            LEFT JOIN LATERAL (
                SELECT f.episode_id,(SELECT max(g.executed_at) FROM trade_episode_fills g WHERE g.episode_id=f.episode_id) AS latest
                FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id
                WHERE e.user_id=n.user_id AND e.workspace_id=n.workspace_id AND e.retired_at IS NULL
                  AND coalesce(f.brokerage_transaction_id,'opening:'||f.opening_position_id)=n.anchor_execution_id AND f.role=n.anchor_role
                LIMIT 1) m ON true
            WHERE n.user_id=$1 AND n.workspace_id=$2)
        UPDATE journal_action_notes n SET
            orphaned_at=CASE WHEN p.episode_id IS NULL THEN coalesce(n.orphaned_at,now()) END,
            acknowledged_at=CASE WHEN p.episode_id IS NULL THEN n.acknowledged_at END,
            locked_at=CASE WHEN n.locked_at IS NULL AND n.kind='plan' AND p.latest>n.seen_through THEN now() ELSE n.locked_at END
        FROM placed p WHERE n.id=p.id
          AND ((p.episode_id IS NULL) <> (n.orphaned_at IS NOT NULL) OR (n.locked_at IS NULL AND n.kind='plan' AND p.latest>n.seen_through))")
        .bind(user).bind(workspace).execute(connection).await?;
    Ok(())
}

/// Locks every plan note on a trade once the trade is reviewed.
pub(super) async fn lock_for_review(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<()> {
    sqlx::query("UPDATE journal_action_notes n SET locked_at=now() WHERE n.user_id=$1 AND n.workspace_id=$2 AND n.kind='plan' AND n.locked_at IS NULL
        AND EXISTS(SELECT 1 FROM journal_entries j JOIN trade_episode_fills f ON f.episode_id=j.episode_id
            WHERE j.id=$3 AND j.user_id=n.user_id AND j.workspace_id=n.workspace_id
              AND coalesce(f.brokerage_transaction_id,'opening:'||f.opening_position_id)=n.anchor_execution_id AND f.role=n.anchor_role)")
        .bind(user).bind(workspace).bind(entry).execute(connection).await?;
    Ok(())
}

/// Notes whose execution disappeared from the broker history and that the
/// user hasn't chosen to keep as a record yet.
pub async fn orphaned(pool: &PgPool, user: &str, workspace: &str) -> Result<Vec<NoteView>> {
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!("SELECT {NOTE_COLUMNS} FROM journal_action_notes WHERE user_id=$1 AND workspace_id=$2 AND orphaned_at IS NOT NULL AND acknowledged_at IS NULL ORDER BY created_at,id")))
        .bind(user).bind(workspace).fetch_all(pool).await?;
    rows.iter().map(|row| note_view(row, None)).collect()
}

/// Keeps a note whose execution was removed as a record. The note stays; it
/// just stops waiting on the user.
pub async fn keep_orphan(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    note: &str,
    client: &str,
    mutation: &str,
) -> Result<bool> {
    let payload = json!({"kind":"keep_orphaned_note","workspace":workspace,"note":note});
    let mut tx = pool.begin().await?;
    if let Some(saved) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(saved)?);
    }
    commands::lock_owner(&mut tx, user, workspace).await?;
    let kept = sqlx::query("UPDATE journal_action_notes SET acknowledged_at=now() WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND orphaned_at IS NOT NULL AND acknowledged_at IS NULL")
        .bind(note).bind(user).bind(workspace).execute(&mut *tx).await?;
    ensure!(kept.rows_affected() == 1, "This note isn't waiting on you");
    commands::changed(
        &mut tx,
        user,
        workspace,
        "action_note",
        json!({"noteId":note}),
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
