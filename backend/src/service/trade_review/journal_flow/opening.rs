use super::{commands, results, source};
use crate::service::trade_review::types::{
    EpisodeDirection, ExecutionFill, ExecutionInstrument, ExecutionSide, FillAllocation, FillRole,
};
use anyhow::{Result, anyhow, ensure};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{PgConnection, PgPool, Row};
use std::{collections::BTreeMap, str::FromStr};

const PREFIX: &str = "opening:";

/// A position the user held before the first imported broker execution.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(super) struct OpeningPosition {
    pub id: String,
    pub instrument_key: String,
    pub direction: EpisodeDirection,
    pub quantity: Decimal,
    pub average_price: Decimal,
    pub as_of: DateTime<Utc>,
}

impl OpeningPosition {
    pub fn transaction_id(&self) -> String {
        format!("{PREFIX}{}", self.id)
    }

    pub fn fill(&self, instrument: &ExecutionInstrument) -> ExecutionFill {
        ExecutionFill {
            transaction_id: self.transaction_id(),
            instrument: instrument.clone(),
            side: match self.direction {
                EpisodeDirection::Long => ExecutionSide::Buy,
                EpisodeDirection::Short => ExecutionSide::Sell,
            },
            price: self.average_price,
            quantity: self.quantity,
            fee: Decimal::ZERO,
            executed_at: self.as_of,
        }
    }
}

pub(super) fn position_id(transaction_id: &str) -> Option<&str> {
    transaction_id.strip_prefix(PREFIX)
}

fn direction_name(direction: EpisodeDirection) -> &'static str {
    match direction {
        EpisodeDirection::Long => "long",
        EpisodeDirection::Short => "short",
    }
}

pub(super) async fn active(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
) -> Result<Vec<OpeningPosition>> {
    let rows = sqlx::query("SELECT id,instrument_key,direction,quantity,average_price,as_of FROM journal_opening_positions WHERE user_id=$1 AND workspace_id=$2 AND retired_at IS NULL")
        .bind(user).bind(workspace).fetch_all(connection).await?;
    rows.into_iter()
        .map(|row| {
            Ok(OpeningPosition {
                id: row.try_get("id")?,
                instrument_key: row.try_get("instrument_key")?,
                direction: if row.try_get::<String, _>("direction")? == "long" {
                    EpisodeDirection::Long
                } else {
                    EpisodeDirection::Short
                },
                quantity: row.try_get("quantity")?,
                average_price: row.try_get("average_price")?,
                as_of: row.try_get("as_of")?,
            })
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::InputObject)]
#[graphql(name = "JournalOpeningPositionInputV2", rename_fields = "camelCase")]
pub struct OpeningPositionInput {
    pub direction: String,
    pub quantity: String,
    pub average_price: String,
    pub as_of: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(name = "JournalOpeningPositionV2", rename_fields = "camelCase")]
pub struct OpeningPositionView {
    pub id: String,
    pub direction: String,
    pub quantity: String,
    pub average_price: String,
    pub as_of: String,
    pub older_history: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(name = "JournalOpeningTradeV2", rename_fields = "camelCase")]
pub struct OpeningTrade {
    pub direction: String,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub entered_quantity: String,
    pub remaining_quantity: String,
    pub realized_net: Option<String>,
    pub fees_paid: Option<String>,
    pub starting_position: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(name = "JournalOpeningPreviewV2", rename_fields = "camelCase")]
pub struct OpeningPreview {
    pub trades: Vec<OpeningTrade>,
}

fn view(position: &OpeningPosition, group: Option<&source::SourceGroup>) -> OpeningPositionView {
    OpeningPositionView {
        id: position.id.clone(),
        direction: direction_name(position.direction).into(),
        quantity: position.quantity.normalize().to_string(),
        average_price: position.average_price.normalize().to_string(),
        as_of: position.as_of.to_rfc3339(),
        older_history: group.is_some_and(|group| {
            group
                .fills
                .iter()
                .any(|fill| fill.executed_at <= position.as_of)
        }),
    }
}

/// The source group key of the instrument an entry belongs to.
async fn entry_instrument(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<String> {
    let key: Option<String> = sqlx::query_scalar("SELECT coalesce(j.issue_json->>'instrument_key',e.instrument_key||'|'||j.currency) FROM journal_entries j LEFT JOIN trade_episodes e ON e.id=j.episode_id AND e.user_id=j.user_id AND e.workspace_id=j.workspace_id WHERE j.id=$1 AND j.user_id=$2 AND j.workspace_id=$3 AND j.deleted_at IS NULL AND j.source_kind='broker'")
        .bind(entry).bind(user).bind(workspace).fetch_optional(connection).await?.flatten();
    key.ok_or_else(|| anyhow!("Only broker trades can have a starting position"))
}

async fn group_for(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    key: &str,
) -> Result<source::SourceGroup> {
    source::load(connection, user, workspace)
        .await?
        .into_iter()
        .find(|group| group.key == key)
        .ok_or_else(|| anyhow!("Broker executions are unavailable"))
}

fn candidate(
    input: &OpeningPositionInput,
    group: &source::SourceGroup,
    id: String,
) -> Result<OpeningPosition> {
    let direction = match input.direction.as_str() {
        "long" => EpisodeDirection::Long,
        "short" => EpisodeDirection::Short,
        _ => return Err(anyhow!("Choose long or short for the starting position")),
    };
    let quantity = Decimal::from_str(input.quantity.trim())
        .map_err(|_| anyhow!("Enter the starting quantity as a number"))?;
    let average_price = Decimal::from_str(input.average_price.trim())
        .map_err(|_| anyhow!("Enter the average price as a number"))?;
    ensure!(
        quantity > Decimal::ZERO,
        "The starting quantity must be more than zero"
    );
    ensure!(
        average_price > Decimal::ZERO,
        "The average price must be more than zero"
    );
    let as_of = DateTime::parse_from_rfc3339(&input.as_of)
        .map_err(|_| anyhow!("Choose the date of the starting position"))?
        .with_timezone(&Utc);
    let first = group
        .fills
        .iter()
        .map(|fill| fill.executed_at)
        .min()
        .ok_or_else(|| anyhow!("Broker executions are unavailable"))?;
    ensure!(
        as_of < first,
        "The starting position must be dated before the first imported execution"
    );
    Ok(OpeningPosition {
        id,
        instrument_key: group.key.clone(),
        direction,
        quantity,
        average_price,
        as_of,
    })
}

/// Fills of trades the user grouped by hand stay with those trades, so only the
/// remaining executions are rebuilt around the starting position.
async fn manual_allocations(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    key: &str,
) -> Result<Vec<FillAllocation>> {
    let rows = sqlx::query("SELECT coalesce(f.brokerage_transaction_id,'opening:'||f.opening_position_id) AS transaction_id,f.role,f.quantity,f.price,f.fee,f.executed_at
        FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id
        JOIN journal_entries j ON j.episode_id=e.id AND j.user_id=e.user_id AND j.workspace_id=e.workspace_id
        WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.retired_at IS NULL AND e.grouping_source='manual' AND e.instrument_key||'|'||j.currency=$3")
        .bind(user).bind(workspace).bind(key).fetch_all(connection).await?;
    rows.into_iter()
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
        .collect()
}

fn remaining_after(
    group: &source::SourceGroup,
    allocations: &[FillAllocation],
) -> source::SourceGroup {
    let mut used = BTreeMap::<&str, Decimal>::new();
    for allocation in allocations {
        *used.entry(&allocation.transaction_id).or_default() += allocation.quantity;
    }
    let mut residual = group.clone();
    residual.fills.retain_mut(|fill| {
        let taken = used
            .get(fill.transaction_id.as_str())
            .copied()
            .unwrap_or_default();
        if taken > Decimal::ZERO {
            fill.fee = fill.fee * (fill.quantity - taken) / fill.quantity;
            fill.quantity -= taken;
        }
        fill.quantity > Decimal::ZERO
    });
    residual.source_ids = residual
        .fills
        .iter()
        .map(|fill| fill.transaction_id.clone())
        .collect();
    residual
}

async fn ensure_not_grouped_by_hand(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    position: &str,
) -> Result<()> {
    let grouped: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id WHERE f.opening_position_id=$1 AND e.user_id=$2 AND e.workspace_id=$3 AND e.retired_at IS NULL AND e.grouping_source='manual')")
        .bind(position).bind(user).bind(workspace).fetch_one(connection).await?;
    ensure!(
        !grouped,
        "This starting position is part of a trade you grouped by hand. Undo that grouping first."
    );
    Ok(())
}

pub async fn for_entry(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<Option<OpeningPositionView>> {
    let mut connection = pool.acquire().await?;
    let key = entry_instrument(&mut connection, user, workspace, entry).await?;
    let Some(position) = active(&mut connection, user, workspace)
        .await?
        .into_iter()
        .find(|position| position.instrument_key == key)
    else {
        return Ok(None);
    };
    let group = source::load(&mut connection, user, workspace)
        .await?
        .into_iter()
        .find(|group| group.key == key);
    Ok(Some(view(&position, group.as_ref())))
}

pub async fn preview(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
    input: OpeningPositionInput,
) -> Result<OpeningPreview> {
    let mut connection = pool.acquire().await?;
    let key = entry_instrument(&mut connection, user, workspace, entry).await?;
    let mut group = group_for(&mut connection, user, workspace, &key).await?;
    group.opening = Some(candidate(&input, &group, "preview".into())?);
    let manual = manual_allocations(&mut connection, user, workspace, &key).await?;
    let residual = remaining_after(&group, &manual);
    if let Some(problem) = residual.problem() {
        return Err(anyhow!(problem));
    }
    let inventory = inventory(&mut connection, user, workspace).await?;
    let trades = residual
        .drafts(&inventory)?
        .iter()
        .map(|draft| {
            let result = results::calculate(draft)?;
            Ok(OpeningTrade {
                direction: direction_name(draft.direction).into(),
                opened_at: draft.opened_at.to_rfc3339(),
                closed_at: draft.closed_at.map(|at| at.to_rfc3339()),
                entered_quantity: result.entered.normalize().to_string(),
                remaining_quantity: draft.current_quantity.normalize().to_string(),
                realized_net: group
                    .fees_known
                    .then(|| result.realized.normalize().to_string()),
                fees_paid: group
                    .fees_known
                    .then(|| result.fees.normalize().to_string()),
                starting_position: draft
                    .allocations
                    .iter()
                    .any(|fill| position_id(&fill.transaction_id).is_some()),
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(OpeningPreview { trades })
}

async fn inventory(connection: &mut PgConnection, user: &str, workspace: &str) -> Result<Value> {
    Ok(sqlx::query_scalar(
        "SELECT opening_inventory FROM journal_workspace_state WHERE user_id=$1 AND workspace_id=$2",
    )
    .bind(user)
    .bind(workspace)
    .fetch_optional(connection)
    .await?
    .unwrap_or_else(|| json!({})))
}

async fn queue_projection(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    version: &commands::WorkspaceVersion,
) -> Result<()> {
    sqlx::query("UPDATE journal_workspace_state SET grouping_revision=grouping_revision+1,updated_at=now() WHERE workspace_id=$1 AND user_id=$2")
        .bind(workspace).bind(user).execute(&mut *connection).await?;
    sqlx::query("INSERT INTO journal_projection_jobs(workspace_id,user_id,requested_revision,state) VALUES ($1,$2,$3,'pending') ON CONFLICT(workspace_id) DO UPDATE SET state=CASE WHEN journal_projection_jobs.state='running' THEN 'running' ELSE 'pending' END,available_at=now()")
        .bind(workspace).bind(user).bind(version.source).execute(connection).await?;
    Ok(())
}

async fn project_now(pool: &PgPool, user: &str, workspace: &str) {
    if let Err(error) =
        super::process_workspace(pool, user, workspace, "journal-opening-position").await
    {
        log::warn!("journal projection will retry for workspace {workspace}: {error:#}");
    }
}

pub async fn save(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
    input: OpeningPositionInput,
    client: &str,
    mutation: &str,
) -> Result<OpeningPositionView> {
    let payload =
        json!({"kind":"save_opening_position","workspace":workspace,"entry":entry,"input":input});
    let mut tx = pool.begin().await?;
    if let Some(result) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(result)?);
    }
    let version = commands::lock_workspace(&mut tx, user, workspace).await?;
    let key = entry_instrument(&mut tx, user, workspace, entry).await?;
    let group = group_for(&mut tx, user, workspace, &key).await?;
    ensure!(
        group.issue.is_none(),
        group.issue.clone().unwrap_or_default()
    );
    let position = candidate(&input, &group, crate::ids::new_uuid_v7().to_string())?;
    let mut without_opening = group.clone();
    without_opening.opening = None;
    ensure!(
        group.opening.is_some()
            || !without_opening.has_confirmed_start(&inventory(&mut tx, user, workspace).await?)?,
        "This history already has a known start, so it doesn't need a starting position"
    );
    if let Some(previous) = group.opening.as_ref() {
        ensure_not_grouped_by_hand(&mut tx, user, workspace, &previous.id).await?;
    }
    sqlx::query("UPDATE journal_opening_positions SET retired_at=now() WHERE user_id=$1 AND workspace_id=$2 AND instrument_key=$3 AND retired_at IS NULL")
        .bind(user).bind(workspace).bind(&key).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO journal_opening_positions(id,user_id,workspace_id,instrument_key,direction,quantity,average_price,as_of) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)")
        .bind(&position.id).bind(user).bind(workspace).bind(&key).bind(direction_name(position.direction)).bind(position.quantity).bind(position.average_price).bind(position.as_of)
        .execute(&mut *tx).await?;
    queue_projection(&mut tx, user, workspace, &version).await?;
    let result = view(&position, Some(&group));
    commands::changed(
        &mut tx,
        user,
        workspace,
        "opening_position",
        json!({"instrumentKey":key,"positionId":position.id}),
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
    project_now(pool, user, workspace).await;
    Ok(result)
}

/// Trades rebuilt around a starting position no longer have a known start once
/// it is removed. Return the history to the single unresolved entry it was
/// before, keeping the first trade's identity; the others point to it.
async fn restore_unresolved(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    key: &str,
) -> Result<()> {
    let trades: Vec<(String, String)> = sqlx::query_as("SELECT e.id,j.id FROM trade_episodes e JOIN journal_entries j ON j.episode_id=e.id AND j.user_id=e.user_id AND j.workspace_id=e.workspace_id
        WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.retired_at IS NULL AND e.grouping_source='automatic' AND e.instrument_key||'|'||j.currency=$3 AND j.deleted_at IS NULL AND j.retired_at IS NULL
        ORDER BY e.opened_at,e.id")
        .bind(user).bind(workspace).bind(key).fetch_all(&mut *connection).await?;
    let Some((_, placeholder)) = trades.first().cloned() else {
        return Ok(());
    };
    let episodes = trades
        .iter()
        .map(|(episode, _)| episode)
        .collect::<Vec<_>>();
    let entries = trades.iter().map(|(_, entry)| entry).collect::<Vec<_>>();
    sqlx::query("UPDATE trade_episodes SET retired_at=now(),fingerprint='retired:'||id||':'||fingerprint,record_version=record_version+1 WHERE id=ANY($1) AND user_id=$2 AND workspace_id=$3")
        .bind(&episodes).bind(user).bind(workspace).execute(&mut *connection).await?;
    sqlx::query(
        "DELETE FROM journal_brokerage_links WHERE journal_entry_id=ANY($1) AND user_id=$2",
    )
    .bind(&entries)
    .bind(user)
    .execute(&mut *connection)
    .await?;
    sqlx::query("UPDATE journal_entries SET retired_at=now(),successor_id=$4,record_version=record_version+1 WHERE id=ANY($1) AND id<>$4 AND user_id=$2 AND workspace_id=$3")
        .bind(&entries).bind(user).bind(workspace).bind(&placeholder).execute(&mut *connection).await?;
    let source_ids = group_for(connection, user, workspace, key)
        .await?
        .source_ids;
    let issue = json!({"code":"incomplete_history","instrument_key":key,"source_ids":source_ids,"possible_duplicates":[]});
    sqlx::query("UPDATE journal_entries SET episode_id=NULL,trade_type='unknown',lifecycle_state='incomplete',outcome='unknown',open_date=NULL,close_date=NULL,entry_price=NULL,exit_price=NULL,position_size=NULL,remaining_quantity=NULL,realized_net=NULL,fees_paid=NULL,status=NULL,total_pl=NULL,net_roi=NULL,duration=NULL,issue_json=$4,materialized_revision=materialized_revision+1,record_version=record_version+1 WHERE id=$1 AND user_id=$2 AND workspace_id=$3")
        .bind(&placeholder).bind(user).bind(workspace).bind(issue).execute(connection).await?;
    Ok(())
}

pub async fn remove(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    position: &str,
    client: &str,
    mutation: &str,
) -> Result<bool> {
    let payload =
        json!({"kind":"remove_opening_position","workspace":workspace,"position":position});
    let mut tx = pool.begin().await?;
    if let Some(result) =
        commands::replay(&mut tx, user, workspace, client, mutation, &payload).await?
    {
        return Ok(serde_json::from_value(result)?);
    }
    let version = commands::lock_workspace(&mut tx, user, workspace).await?;
    ensure_not_grouped_by_hand(&mut tx, user, workspace, position).await?;
    let key: Option<String> = sqlx::query_scalar("UPDATE journal_opening_positions SET retired_at=now() WHERE id=$1 AND user_id=$2 AND workspace_id=$3 AND retired_at IS NULL RETURNING instrument_key")
        .bind(position).bind(user).bind(workspace).fetch_optional(&mut *tx).await?;
    let key = key.ok_or_else(|| anyhow!("This starting position was already removed"))?;
    let mut without_opening = group_for(&mut tx, user, workspace, &key).await?;
    without_opening.opening = None;
    if !without_opening.has_known_start(&inventory(&mut tx, user, workspace).await?)? {
        restore_unresolved(&mut tx, user, workspace, &key).await?;
    }
    queue_projection(&mut tx, user, workspace, &version).await?;
    commands::changed(
        &mut tx,
        user,
        workspace,
        "opening_position",
        json!({"instrumentKey":key,"positionId":position}),
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
    project_now(pool, user, workspace).await;
    Ok(true)
}
