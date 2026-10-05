pub mod backfill;
pub mod chart;
mod commands;
pub mod grouping;
mod projection;
pub mod reflection;
mod results;
pub mod sessions;
mod source;
mod storage;
pub mod suggestions;
mod unresolved;

use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use sqlx::{PgConnection, PgPool, Row};

pub use projection::{process_once, run_worker};

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(name = "JournalTradeV2", rename_fields = "camelCase")]
pub struct JournalTrade {
    pub id: String,
    pub workspace_id: String,
    pub source_kind: String,
    pub episode_id: Option<String>,
    pub symbol: String,
    pub symbol_name: String,
    pub direction: String,
    pub currency: Option<String>,
    pub open_date: Option<String>,
    pub entry_price: Option<String>,
    pub exit_price: Option<String>,
    pub entered_quantity: Option<String>,
    pub contract_multiplier: String,
    pub record_version: i64,
    pub materialized_revision: i64,
    pub issue_code: Option<String>,
    pub issue_message: Option<String>,
    pub possible_duplicates: Vec<String>,
    pub retired_at: Option<String>,
    pub successor_id: Option<String>,
    pub lifecycle_state: String,
    pub outcome: String,
    pub tags: Vec<JournalTag>,
    pub remaining_quantity: Option<String>,
    pub realized_net: Option<String>,
    pub fees_paid: Option<String>,
    pub close_date: Option<String>,
    pub review_state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(name = "JournalTagV2")]
pub struct JournalTag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

pub async fn seal_import(pool: &PgPool, user: &str, workspace: &str) -> Result<()> {
    let mut tx = pool.begin().await?;
    let result = sqlx::query("UPDATE journal_workspace_state SET sealed_revision=source_revision,import_state='idle',last_error=NULL,updated_at=now() WHERE workspace_id=$1 AND user_id=$2")
        .bind(workspace).bind(user).execute(&mut *tx).await?;
    ensure!(result.rows_affected() == 1, "journal workspace not found");
    sqlx::query("INSERT INTO journal_projection_jobs(workspace_id,user_id,requested_revision)
        SELECT workspace_id,user_id,sealed_revision FROM journal_workspace_state WHERE workspace_id=$1 AND user_id=$2 AND enabled AND projection_revision<sealed_revision
        ON CONFLICT(workspace_id) DO UPDATE SET requested_revision=EXCLUDED.requested_revision,state=CASE WHEN journal_projection_jobs.state='running' THEN 'running' ELSE 'pending' END,available_at=now()")
        .bind(workspace).bind(user).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

pub async fn is_enabled(pool: &PgPool, user: &str, workspace: &str) -> Result<bool> {
    Ok(sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM journal_workspace_state WHERE workspace_id=$1 AND user_id=$2 AND enabled)")
        .bind(workspace).bind(user).fetch_one(pool).await?)
}

pub async fn begin_import(pool: &PgPool, user: &str, workspace: &str) -> Result<()> {
    let result=sqlx::query("INSERT INTO journal_workspace_state(workspace_id,user_id,import_state)
        SELECT id,user_id,'importing' FROM workspaces WHERE id=$1 AND user_id=$2
        ON CONFLICT(workspace_id) DO UPDATE SET import_state='importing',last_error=NULL,updated_at=now()")
        .bind(workspace).bind(user).execute(pool).await?;
    ensure!(result.rows_affected() == 1, "journal workspace not found");
    Ok(())
}

pub async fn fail_import(pool: &PgPool, user: &str, workspace: &str) -> Result<()> {
    sqlx::query("UPDATE journal_workspace_state SET import_state='failed',last_error='broker_import_failed',updated_at=now() WHERE workspace_id=$1 AND user_id=$2")
        .bind(workspace).bind(user).execute(pool).await?;
    Ok(())
}

pub async fn list_trades(pool: &PgPool, user: &str, workspace: &str) -> Result<Vec<JournalTrade>> {
    query_trades(pool, user, workspace, None).await
}

pub async fn get_trade(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<Option<JournalTrade>> {
    Ok(query_trades(pool, user, workspace, Some(entry))
        .await?
        .into_iter()
        .next())
}

async fn query_trades(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: Option<&str>,
) -> Result<Vec<JournalTrade>> {
    let mut connection = pool.acquire().await?;
    query_trades_connection(&mut connection, user, workspace, entry).await
}

async fn query_trades_connection(
    connection: &mut PgConnection,
    user: &str,
    workspace: &str,
    entry: Option<&str>,
) -> Result<Vec<JournalTrade>> {
    let rows = sqlx::query("SELECT e.id,e.workspace_id,e.source_kind,e.episode_id,e.symbol,e.symbol_name,e.trade_type,coalesce(e.currency,(SELECT currency FROM workspaces WHERE id=e.workspace_id)) AS currency,e.open_date,e.entry_price::text,e.exit_price::text,e.position_size::text,e.contract_multiplier::text,e.record_version,e.materialized_revision,e.issue_json->>'code' AS issue_code,e.issue_json->>'message' AS issue_message,coalesce(e.issue_json->'possible_duplicates','[]') AS possible_duplicates,e.retired_at,e.successor_id,e.lifecycle_state,e.outcome,e.remaining_quantity,COALESCE(e.realized_net,CASE WHEN e.source_kind='manual' THEN e.position_size::text::numeric*e.entry_price::text::numeric*e.total_pl::text::numeric/100*e.contract_multiplier::text::numeric END) AS realized_net,e.fees_paid,e.close_date,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color)),'[]') FROM trade_tags link JOIN tags t ON t.id=link.tag_id AND t.user_id=e.user_id WHERE link.journal_entry_id=e.id AND t.deleted_at IS NULL) AS tags,
        CASE WHEN r.id IS NULL THEN 'unreviewed' WHEN r.entry_revision=e.materialized_revision AND r.context_revision=coalesce(c.record_version,0) THEN 'reviewed' ELSE 'outdated' END AS review_state
        FROM journal_entries e LEFT JOIN journal_trade_context c ON c.entry_id=e.id
        LEFT JOIN LATERAL (SELECT id,entry_revision,context_revision FROM journal_trade_reviews WHERE entry_id=e.id AND user_id=e.user_id AND workspace_id=e.workspace_id ORDER BY review_version DESC LIMIT 1) r ON true
        WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.deleted_at IS NULL AND (e.retired_at IS NULL OR $3::text IS NOT NULL) AND ($3::text IS NULL OR e.id=$3) ORDER BY e.open_date DESC NULLS LAST,e.id")
        .bind(user).bind(workspace).bind(entry).fetch_all(connection).await?;
    rows.into_iter()
        .map(|row| {
            Ok(JournalTrade {
                id: row.try_get("id")?,
                workspace_id: row.try_get("workspace_id")?,
                source_kind: row.try_get("source_kind")?,
                episode_id: row.try_get("episode_id")?,
                symbol: row.try_get("symbol")?,
                symbol_name: row.try_get("symbol_name")?,
                direction: row.try_get("trade_type")?,
                currency: row.try_get("currency")?,
                open_date: row
                    .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("open_date")?
                    .map(|date| date.to_rfc3339()),
                entry_price: row.try_get("entry_price")?,
                exit_price: row.try_get("exit_price")?,
                entered_quantity: row.try_get("position_size")?,
                contract_multiplier: row.try_get("contract_multiplier")?,
                record_version: row.try_get("record_version")?,
                materialized_revision: row.try_get("materialized_revision")?,
                issue_code: row.try_get("issue_code")?,
                issue_message: row.try_get("issue_message")?,
                possible_duplicates: serde_json::from_value(row.try_get("possible_duplicates")?)?,
                retired_at: row
                    .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("retired_at")?
                    .map(|date| date.to_rfc3339()),
                successor_id: row.try_get("successor_id")?,
                lifecycle_state: row.try_get("lifecycle_state")?,
                outcome: row.try_get("outcome")?,
                tags: serde_json::from_value(row.try_get("tags")?)?,
                remaining_quantity: decimal_string(&row, "remaining_quantity")?,
                realized_net: decimal_string(&row, "realized_net")?,
                fees_paid: decimal_string(&row, "fees_paid")?,
                close_date: row
                    .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("close_date")?
                    .map(|date| date.to_rfc3339()),
                review_state: row.try_get("review_state")?,
            })
        })
        .collect()
}

fn decimal_string(row: &sqlx::postgres::PgRow, column: &str) -> Result<Option<String>> {
    Ok(row
        .try_get::<Option<rust_decimal::Decimal>, _>(column)?
        .map(|value| value.normalize().to_string()))
}

#[derive(async_graphql::SimpleObject)]
#[graphql(name = "JournalSnapshotV2", rename_fields = "camelCase")]
pub struct JournalSnapshot {
    pub cursor: String,
    pub reset: bool,
    pub trades: Vec<JournalTrade>,
    pub tombstones: Vec<String>,
}

pub async fn snapshot(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    cursor: Option<&str>,
) -> Result<JournalSnapshot> {
    let mut tx = pool.begin().await?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        .execute(&mut *tx)
        .await?;
    let owned: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=$1 AND user_id=$2)")
            .bind(workspace)
            .bind(user)
            .fetch_one(&mut *tx)
            .await?;
    ensure!(owned, "Workspace not found");
    let trades = query_trades_connection(&mut tx, user, workspace, None).await?;
    let tombstones:Vec<String>=sqlx::query_scalar("SELECT id FROM journal_entries WHERE user_id=$1 AND workspace_id=$2 AND (deleted_at IS NOT NULL OR retired_at IS NOT NULL) ORDER BY id").bind(user).bind(workspace).fetch_all(&mut *tx).await?;
    let sequence:i64=sqlx::query_scalar("SELECT coalesce(max(sequence),0) FROM journal_changes WHERE user_id=$1 AND workspace_id=$2").bind(user).bind(workspace).fetch_one(&mut *tx).await?;
    let next = commands::hash(&serde_json::json!([trades, tombstones, sequence]))?;
    tx.commit().await?;
    let reset = cursor != Some(next.as_str());
    Ok(JournalSnapshot {
        cursor: next,
        reset,
        trades: if reset { trades } else { vec![] },
        tombstones: if reset { tombstones } else { vec![] },
    })
}
