use anyhow::{Context, Result};
use async_graphql::{InputObject, SimpleObject};
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use sqlx::{PgConnection, PgPool, Row};

use crate::service::db::client::sea_orm_connection;
use crate::service::db::entities::calculator::position_calculator_history;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct HistoryTranche {
    pub id: String,
    pub percent: f64,
    pub shares: f64,
    pub target_price: f64,
    pub status: String,
    pub filled_at: Option<String>,
}

#[derive(Debug, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct CreateHistoryTrancheInput {
    pub id: String,
    pub percent: f64,
    pub shares: f64,
    pub target_price: f64,
    pub status: String,
    pub filled_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct PositionCalculatorHistoryEntry {
    pub id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub symbol: String,
    pub position_type: String,
    pub entry_price: f64,
    pub stop_loss: f64,
    pub account_balance: f64,
    pub account_risk: f64,
    pub shares: f64,
    pub position_value: f64,
    pub account_pct: f64,
    pub stop_loss_pct: f64,
    pub plan_id: Option<String>,
    pub tranches: Vec<HistoryTranche>,
    pub created_at: String,
}

#[derive(Debug, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct CreatePositionCalculatorHistoryInput {
    pub workspace_id: String,
    pub symbol: String,
    pub position_type: String,
    pub entry_price: f64,
    pub stop_loss: f64,
    pub account_balance: f64,
    pub account_risk: f64,
    pub shares: f64,
    pub position_value: f64,
    pub account_pct: f64,
    pub stop_loss_pct: f64,
    pub plan_id: Option<String>,
    pub tranches: Option<Vec<CreateHistoryTrancheInput>>,
}

impl From<position_calculator_history::Model> for PositionCalculatorHistoryEntry {
    fn from(model: position_calculator_history::Model) -> Self {
        Self {
            id: model.id,
            user_id: model.user_id,
            workspace_id: model.workspace_id,
            symbol: model.symbol,
            position_type: model.position_type,
            entry_price: model.entry_price,
            stop_loss: model.stop_loss,
            account_balance: model.account_balance,
            account_risk: model.account_risk,
            shares: model.shares,
            position_value: model.position_value,
            account_pct: model.account_pct,
            stop_loss_pct: model.stop_loss_pct,
            plan_id: model.plan_id,
            tranches: serde_json::from_str(&model.tranches_json).unwrap_or_default(),
            created_at: model
                .created_at
                .with_timezone(&Utc)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string(),
        }
    }
}

pub async fn list_history(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
) -> Result<Vec<PositionCalculatorHistoryEntry>> {
    let db = sea_orm_connection(pool);
    Ok(position_calculator_history::Entity::find()
        .filter(position_calculator_history::Column::UserId.eq(user_id))
        .filter(position_calculator_history::Column::WorkspaceId.eq(workspace_id))
        .order_by_desc(position_calculator_history::Column::CreatedAt)
        .all(&db)
        .await
        .context("Failed to list position calculator history")?
        .into_iter()
        .map(Into::into)
        .collect())
}

pub async fn create_history_entry(
    pool: &PgPool,
    user_id: &str,
    input: CreatePositionCalculatorHistoryInput,
) -> Result<PositionCalculatorHistoryEntry> {
    let id = crate::ids::new_uuid_v7().to_string();
    let tranches: Vec<HistoryTranche> = input
        .tranches
        .unwrap_or_default()
        .into_iter()
        .map(|tranche| HistoryTranche {
            id: tranche.id,
            percent: tranche.percent,
            shares: tranche.shares,
            target_price: tranche.target_price,
            status: tranche.status,
            filled_at: tranche.filled_at,
        })
        .collect();
    let tranches_json = serde_json::to_string(&tranches)?;

    let db = sea_orm_connection(pool);
    Ok(position_calculator_history::ActiveModel {
        id: Set(id),
        user_id: Set(user_id.to_owned()),
        workspace_id: Set(input.workspace_id),
        symbol: Set(input.symbol.trim().to_owned()),
        position_type: Set(input.position_type),
        entry_price: Set(input.entry_price),
        stop_loss: Set(input.stop_loss),
        account_balance: Set(input.account_balance),
        account_risk: Set(input.account_risk),
        shares: Set(input.shares),
        position_value: Set(input.position_value),
        account_pct: Set(input.account_pct),
        stop_loss_pct: Set(input.stop_loss_pct),
        plan_id: Set(input.plan_id),
        tranches_json: Set(tranches_json),
        ..Default::default()
    }
    .insert(&db)
    .await
    .context("Failed to insert position calculator history entry")?
    .into())
}

pub async fn delete_history_entry(pool: &PgPool, id: &str, user_id: &str) -> Result<bool> {
    let db = sea_orm_connection(pool);
    Ok(position_calculator_history::Entity::delete_many()
        .filter(position_calculator_history::Column::Id.eq(id))
        .filter(position_calculator_history::Column::UserId.eq(user_id))
        .exec(&db)
        .await
        .context("Failed to delete position calculator history entry")?
        .rows_affected
        > 0)
}

// ---- Offline-first sync (append + soft-delete only, never updated) -------

/// The whole-row payload a `createPositionCalculatorHistory` mutation
/// carries. History is insert + soft-delete only — no update path exists.
pub struct HistoryWriteArgs {
    pub id: String,
    pub workspace_id: String,
    pub symbol: String,
    pub position_type: String,
    pub entry_price: f64,
    pub stop_loss: f64,
    pub account_balance: f64,
    pub account_risk: f64,
    pub shares: f64,
    pub position_value: f64,
    pub account_pct: f64,
    pub stop_loss_pct: f64,
    pub plan_id: Option<String>,
    pub tranches_json: String,
}

#[derive(Debug, Clone)]
pub struct HistoryDelta {
    pub id: String,
    pub workspace_id: String,
    pub symbol: String,
    pub position_type: String,
    pub entry_price: f64,
    pub stop_loss: f64,
    pub account_balance: f64,
    pub account_risk: f64,
    pub shares: f64,
    pub position_value: f64,
    pub account_pct: f64,
    pub stop_loss_pct: f64,
    pub plan_id: Option<String>,
    pub tranches_json: String,
    pub hlc: String,
    pub deleted_at: Option<String>,
    pub updated_at: String,
}

const DELTA_COLS: &str = "id, workspace_id, symbol, position_type, entry_price, stop_loss, account_balance, account_risk, \
    shares, position_value, account_pct, stop_loss_pct, plan_id, tranches_json, hlc, \
    to_char(deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS deleted_at, \
    to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at";

pub async fn create_history_tx(
    conn: &mut PgConnection,
    user_id: &str,
    args: &HistoryWriteArgs,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO position_calculator_history \
         (id, user_id, workspace_id, symbol, position_type, entry_price, stop_loss, account_balance, account_risk, \
          shares, position_value, account_pct, stop_loss_pct, plan_id, tranches_json, hlc) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) \
         ON CONFLICT (id) DO NOTHING",
    )
    .bind(&args.id)
    .bind(user_id)
    .bind(&args.workspace_id)
    .bind(&args.symbol)
    .bind(&args.position_type)
    .bind(args.entry_price)
    .bind(args.stop_loss)
    .bind(args.account_balance)
    .bind(args.account_risk)
    .bind(args.shares)
    .bind(args.position_value)
    .bind(args.account_pct)
    .bind(args.stop_loss_pct)
    .bind(args.plan_id.as_deref())
    .bind(&args.tranches_json)
    .bind(hlc)
    .execute(&mut *conn)
    .await
    .context("create_history_tx")?;
    Ok(())
}

pub async fn soft_delete_history_tx(
    conn: &mut PgConnection,
    user_id: &str,
    id: &str,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE position_calculator_history SET deleted_at = now(), hlc = $1 \
         WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL",
    )
    .bind(hlc)
    .bind(id)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("soft_delete_history_tx")?;
    Ok(())
}

/// User-scoped pull deltas. Deliberately does NOT filter `deleted_at IS
/// NULL` — see `playbook_table::playbooks_since`.
pub async fn history_since(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    cookie: Option<&str>,
) -> Result<Vec<HistoryDelta>> {
    // A first pull that saw no rows returns `""` as the cursor, and
    // `''::timestamptz` throws. Treat an empty cookie as "no cursor".
    let cookie = cookie.filter(|c| !c.is_empty());
    let sql = format!(
        "SELECT {DELTA_COLS} FROM position_calculator_history \
         WHERE user_id = $1 AND workspace_id = $2 AND ($3::text IS NULL OR updated_at >= $3::timestamptz) \
         ORDER BY updated_at ASC"
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(workspace_id)
        .bind(cookie)
        .fetch_all(pool)
        .await
        .context("Failed to read position calculator history deltas")?;

    let mut out = Vec::with_capacity(rows.len());
    for row in &rows {
        out.push(HistoryDelta {
            id: row.try_get("id")?,
            workspace_id: row.try_get("workspace_id")?,
            symbol: row.try_get("symbol")?,
            position_type: row.try_get("position_type")?,
            entry_price: row.try_get("entry_price")?,
            stop_loss: row.try_get("stop_loss")?,
            account_balance: row.try_get("account_balance")?,
            account_risk: row.try_get("account_risk")?,
            shares: row.try_get("shares")?,
            position_value: row.try_get("position_value")?,
            account_pct: row.try_get("account_pct")?,
            stop_loss_pct: row.try_get("stop_loss_pct")?,
            plan_id: row.try_get("plan_id")?,
            tranches_json: row.try_get("tranches_json")?,
            hlc: row.try_get("hlc")?,
            deleted_at: row.try_get("deleted_at")?,
            updated_at: row.try_get("updated_at")?,
        });
    }
    Ok(out)
}
