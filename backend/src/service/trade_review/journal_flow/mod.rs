pub mod action_notes;
pub mod attention;
pub mod backfill;
pub mod chart;
mod commands;
pub mod duplicates;
pub mod grouping;
mod holdings;
pub mod opening;
mod projection;
pub mod reflection;
mod results;
pub mod review_outcome;
pub mod sessions;
mod source;
mod storage;
pub mod suggestions;
mod unresolved;

use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};
use sqlx::{PgConnection, PgPool, Row};
use std::collections::HashMap;

pub use projection::{process_once, process_workspace, run_worker};

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
    pub playbook_id: Option<String>,
    pub first_execution_at: Option<String>,
    pub last_execution_at: Option<String>,
    pub execution_count: i32,
    pub bought_quantity: Option<String>,
    pub sold_quantity: Option<String>,
    pub starting_position: bool,
    /// An entry note exists on the trade's first execution.
    pub has_entry_note: bool,
    /// Net result over the risk to the planned stop, once the trade is closed.
    pub realized_r: Option<String>,
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

/// A new holdings snapshot can confirm or question where a history starts, so
/// the trades are rebuilt even when no execution changed.
pub async fn holdings_synced(pool: &PgPool, user: &str, workspace: &str) -> Result<()> {
    sqlx::query("INSERT INTO journal_projection_jobs(workspace_id,user_id,requested_revision)
        SELECT workspace_id,user_id,source_revision FROM journal_workspace_state WHERE workspace_id=$1 AND user_id=$2 AND enabled
        ON CONFLICT(workspace_id) DO UPDATE SET state=CASE WHEN journal_projection_jobs.state='running' THEN 'running' ELSE 'pending' END,available_at=now()")
        .bind(workspace).bind(user).execute(pool).await?;
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

#[derive(Debug, Clone, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(name = "JournalExecutionHolderV2", rename_fields = "camelCase")]
pub struct ExecutionHolder {
    pub entry_id: Option<String>,
    pub direction: String,
    pub opened_at: String,
    pub blocked: bool,
    pub quantity: String,
}

/// Blocked broker records that resolving this entry would take over.
pub async fn releasable_episodes(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
) -> Result<Vec<String>> {
    let mut connection = pool.acquire().await?;
    unresolved::releasable_for_entry(&mut connection, user, workspace, entry).await
}

/// Other trades that still hold quantity from these executions, keyed by transaction id.
pub async fn execution_holders(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    entry: &str,
    transaction_ids: &[String],
    released: &[String],
) -> Result<HashMap<String, Vec<ExecutionHolder>>> {
    let rows = sqlx::query("SELECT f.brokerage_transaction_id,j.id AS entry_id,e.direction,e.opened_at,e.status='blocked' AS blocked,sum(f.quantity) AS quantity
        FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id
        LEFT JOIN journal_entries j ON j.episode_id=e.id AND j.user_id=e.user_id AND j.deleted_at IS NULL
        WHERE e.user_id=$1 AND e.workspace_id=$2 AND e.retired_at IS NULL AND f.brokerage_transaction_id=ANY($3)
          AND e.id IS DISTINCT FROM (SELECT episode_id FROM journal_entries WHERE id=$4 AND user_id=$1) AND e.id<>ALL($5)
        GROUP BY f.brokerage_transaction_id,j.id,e.id ORDER BY e.opened_at,e.id")
        .bind(user).bind(workspace).bind(transaction_ids).bind(entry).bind(released).fetch_all(pool).await?;
    let mut holders = HashMap::<String, Vec<ExecutionHolder>>::new();
    for row in rows {
        holders
            .entry(row.try_get("brokerage_transaction_id")?)
            .or_default()
            .push(ExecutionHolder {
                entry_id: row.try_get("entry_id")?,
                direction: row.try_get("direction")?,
                opened_at: row
                    .try_get::<chrono::DateTime<chrono::Utc>, _>("opened_at")?
                    .to_rfc3339(),
                blocked: row.try_get("blocked")?,
                quantity: row
                    .try_get::<rust_decimal::Decimal, _>("quantity")?
                    .normalize()
                    .to_string(),
            });
    }
    Ok(holders)
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
    let rows = sqlx::query("SELECT e.id,e.workspace_id,e.source_kind,e.episode_id,e.symbol,e.symbol_name,e.trade_type,coalesce(e.currency,(SELECT currency FROM workspaces WHERE id=e.workspace_id)) AS currency,e.open_date,e.entry_price::text,e.exit_price::text,e.position_size::text,e.contract_multiplier::text,e.record_version,e.materialized_revision,e.issue_json->>'code' AS issue_code,e.issue_json->>'message' AS issue_message,coalesce(e.issue_json->'possible_duplicates','[]') AS possible_duplicates,e.retired_at,e.successor_id,e.playbook_id,e.lifecycle_state,e.outcome,e.remaining_quantity,COALESCE(e.realized_net,CASE WHEN e.source_kind='manual' THEN e.position_size::text::numeric*e.entry_price::text::numeric*e.total_pl::text::numeric/100*e.contract_multiplier::text::numeric END) AS realized_net,e.fees_paid,e.close_date,x.first_execution_at,x.last_execution_at,coalesce(x.execution_count,0)::int AS execution_count,x.bought_quantity,x.sold_quantity,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color)),'[]') FROM trade_tags link JOIN tags t ON t.id=link.tag_id AND t.user_id=e.user_id WHERE link.journal_entry_id=e.id AND t.deleted_at IS NULL) AS tags,
        EXISTS(SELECT 1 FROM trade_episode_fills sf WHERE sf.episode_id=e.episode_id AND sf.opening_position_id IS NOT NULL) AS starting_position,
        en.id IS NOT NULL AS has_entry_note,
        CASE WHEN e.lifecycle_state='closed' AND e.realized_net IS NOT NULL AND planned.stop>0 AND planned.entry>0
              AND ((e.trade_type='long' AND planned.stop<planned.entry) OR (e.trade_type='short' AND planned.stop>planned.entry))
            THEN e.realized_net/(abs(planned.entry-planned.stop)*e.position_size::text::numeric*e.contract_multiplier::text::numeric) END AS realized_r,
        CASE WHEN r.id IS NULL THEN CASE WHEN EXISTS(SELECT 1 FROM journal_review_skips k WHERE k.entry_id=e.id AND k.revoked_at IS NULL AND k.reason<>'review_later') THEN 'skipped' WHEN (e.notes ~ '[^[:space:]]'
          OR regexp_replace(e.mistakes,'[[:space:]]','','g') NOT IN ('','[]','{}','null')
          OR regexp_replace(e.entry_tactics,'[[:space:]]','','g') NOT IN ('','[]','{}','null')
          OR regexp_replace(e.edges_spotted,'[[:space:]]','','g') NOT IN ('','[]','{}','null')
          OR d.takeaway ~ '[^[:space:]]'
          OR (jsonb_typeof(d.choice_ids)='array' AND d.choice_ids<>'[]'::jsonb)
          OR d.plan_adherence ~ '[^[:space:]]'
          OR EXISTS(SELECT 1 FROM trade_tags link JOIN tags t ON t.id=link.tag_id AND t.user_id=e.user_id WHERE link.journal_entry_id=e.id AND t.deleted_at IS NULL)
          OR EXISTS(SELECT 1 FROM trade_principle_violations v WHERE v.journal_entry_id=e.id)) IS TRUE THEN 'in_progress' ELSE 'unreviewed' END
          WHEN r.entry_revision=e.materialized_revision AND r.context_revision=coalesce(c.record_version,0) THEN 'reviewed' ELSE 'outdated' END AS review_state
        FROM journal_entries e LEFT JOIN journal_trade_context c ON c.entry_id=e.id
        LEFT JOIN LATERAL (SELECT coalesce(f.brokerage_transaction_id,'opening:'||f.opening_position_id) AS anchor FROM trade_episode_fills f WHERE f.episode_id=e.episode_id AND f.role='entry' ORDER BY f.executed_at,f.allocation_order,f.id LIMIT 1) first_entry ON true
        LEFT JOIN journal_action_notes en ON en.user_id=e.user_id AND en.workspace_id=e.workspace_id AND en.kind='plan' AND en.anchor_role='entry' AND en.anchor_execution_id=first_entry.anchor
        LEFT JOIN LATERAL (SELECT coalesce(en.stop_price,CASE WHEN c.stop_state='price' THEN c.stop_price END) AS stop,e.entry_price::text::numeric AS entry) planned ON true
        LEFT JOIN journal_review_drafts d ON d.entry_id=e.id AND d.user_id=e.user_id AND d.workspace_id=e.workspace_id
        LEFT JOIN LATERAL (SELECT id,entry_revision,context_revision FROM journal_trade_reviews WHERE entry_id=e.id AND user_id=e.user_id AND workspace_id=e.workspace_id ORDER BY review_version DESC LIMIT 1) r ON true
        LEFT JOIN LATERAL (SELECT count(*) AS execution_count,min(t) AS first_execution_at,max(t) AS last_execution_at,sum(q) FILTER (WHERE buy) AS bought_quantity,sum(q) FILTER (WHERE NOT buy) AS sold_quantity FROM (
            SELECT f.executed_at AS t,f.quantity AS q,NULL::boolean AS buy FROM trade_episode_fills f WHERE f.episode_id=e.episode_id AND f.brokerage_transaction_id IS NOT NULL
            UNION ALL
            SELECT b.trade_date,abs(b.units::text::numeric),upper(b.transaction_type) LIKE 'BUY%' FROM brokerage_transactions b WHERE e.episode_id IS NULL AND jsonb_typeof(e.issue_json->'source_ids')='array' AND b.user_id=e.user_id AND b.workspace_id=e.workspace_id AND (e.issue_json->'source_ids') ? b.id
        ) fills) x ON true
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
                playbook_id: row.try_get("playbook_id")?,
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
                first_execution_at: row
                    .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("first_execution_at")?
                    .map(|date| date.to_rfc3339()),
                last_execution_at: row
                    .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("last_execution_at")?
                    .map(|date| date.to_rfc3339()),
                execution_count: row.try_get("execution_count")?,
                bought_quantity: decimal_string(&row, "bought_quantity")?,
                sold_quantity: decimal_string(&row, "sold_quantity")?,
                starting_position: row.try_get("starting_position")?,
                has_entry_note: row.try_get("has_entry_note")?,
                realized_r: row
                    .try_get::<Option<rust_decimal::Decimal>, _>("realized_r")?
                    .map(|r| r.round_dp(2).normalize().to_string()),
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
