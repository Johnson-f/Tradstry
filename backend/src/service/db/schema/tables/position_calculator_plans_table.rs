use anyhow::{Context, Result, ensure};
use async_graphql::{InputObject, SimpleObject};
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};
use serde::{Deserialize, Serialize};
use sqlx::{PgConnection, PgPool, Row};
use uuid::Uuid;

use crate::service::db::client::sea_orm_connection;
use crate::service::db::entities::calculator::position_calculator_plans;
use crate::service::trade_review::types::ExecutionInstrument;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct Tranche {
    pub id: String,
    pub percent: f64,
    pub shares: f64,
    pub target_price: f64,
    pub status: String,
    pub filled_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct PositionCalculatorPlan {
    pub id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub symbol: String,
    pub position_type: String,
    pub entry_price: f64,
    pub stop_loss: f64,
    pub account_balance: f64,
    pub account_risk: f64,
    pub total_shares: f64,
    pub position_value: f64,
    pub status: String,
    pub tranches: Vec<Tranche>,
    pub notes: Option<String>,
    /// Exact contract identity for non-equity plans. `None` means the legacy
    /// equity instrument represented by `symbol`.
    pub instrument_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct CreateTrancheInput {
    pub percent: f64,
    pub shares: f64,
    pub target_price: f64,
}

#[derive(Debug, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct CreatePositionCalculatorPlanInput {
    pub workspace_id: String,
    pub symbol: String,
    pub position_type: String,
    pub entry_price: f64,
    pub stop_loss: f64,
    pub account_balance: f64,
    pub account_risk: f64,
    pub total_shares: f64,
    pub position_value: f64,
    pub tranches: Vec<CreateTrancheInput>,
    pub notes: Option<String>,
    pub instrument_json: Option<String>,
}

#[derive(Debug, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct UpdateTrancheInput {
    pub id: String,
    pub percent: Option<f64>,
    pub shares: Option<f64>,
    pub target_price: Option<f64>,
    pub status: Option<String>,
}

#[derive(Debug, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct UpdatePositionCalculatorPlanInput {
    pub status: Option<String>,
    pub tranches: Option<Vec<UpdateTrancheInput>>,
    pub notes: Option<String>,
    #[graphql(default)]
    pub clear_notes: bool,
}

fn nullable_text(value: Option<String>) -> Option<String> {
    value.filter(|text| !text.is_empty())
}

impl From<position_calculator_plans::Model> for PositionCalculatorPlan {
    fn from(model: position_calculator_plans::Model) -> Self {
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
            total_shares: model.total_shares,
            position_value: model.position_value,
            status: model.status,
            tranches: serde_json::from_str(&model.tranches_json).unwrap_or_default(),
            notes: nullable_text(model.notes),
            created_at: model
                .created_at
                .with_timezone(&Utc)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string(),
            updated_at: model
                .updated_at
                .with_timezone(&Utc)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string(),
            instrument_json: model
                .instrument_json
                .and_then(|value| serde_json::to_string(&value).ok())
                .and_then(|value| nullable_text(Some(value))),
        }
    }
}

pub async fn list_plans(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
) -> Result<Vec<PositionCalculatorPlan>> {
    let db = sea_orm_connection(pool);
    Ok(position_calculator_plans::Entity::find()
        .filter(position_calculator_plans::Column::UserId.eq(user_id))
        .filter(position_calculator_plans::Column::WorkspaceId.eq(workspace_id))
        .order_by_desc(position_calculator_plans::Column::CreatedAt)
        .all(&db)
        .await
        .context("Failed to list position calculator plans")?
        .into_iter()
        .map(Into::into)
        .collect())
}

pub async fn find_plan(
    pool: &PgPool,
    id: &str,
    user_id: &str,
) -> Result<Option<PositionCalculatorPlan>> {
    let db = sea_orm_connection(pool);
    Ok(position_calculator_plans::Entity::find_by_id(id)
        .filter(position_calculator_plans::Column::UserId.eq(user_id))
        .one(&db)
        .await
        .context("Failed to find position calculator plan")?
        .map(Into::into))
}

pub async fn create_plan(
    pool: &PgPool,
    user_id: &str,
    input: CreatePositionCalculatorPlanInput,
) -> Result<PositionCalculatorPlan> {
    let id = Uuid::new_v4().to_string();
    let instrument_json = input
        .instrument_json
        .as_deref()
        .map(|value| -> Result<serde_json::Value> {
            let instrument: ExecutionInstrument =
                serde_json::from_str(value).context("Invalid plan instrument")?;
            let instrument = instrument.normalized();
            if let ExecutionInstrument::Option { underlying, .. } = &instrument {
                ensure!(
                    underlying.eq_ignore_ascii_case(input.symbol.trim()),
                    "Option underlying must match the plan symbol"
                );
            }
            Ok(serde_json::to_value(&instrument)?)
        })
        .transpose()?;

    let tranches: Vec<Tranche> = input
        .tranches
        .into_iter()
        .map(|t| Tranche {
            id: Uuid::new_v4().to_string(),
            percent: t.percent,
            shares: t.shares,
            target_price: t.target_price,
            status: "planned".to_string(),
            filled_at: None,
        })
        .collect();

    let tranches_json = serde_json::to_string(&tranches)?;

    let db = sea_orm_connection(pool);
    Ok(position_calculator_plans::ActiveModel {
        id: Set(id),
        user_id: Set(user_id.to_owned()),
        workspace_id: Set(input.workspace_id),
        symbol: Set(input.symbol.trim().to_owned()),
        position_type: Set(input.position_type),
        entry_price: Set(input.entry_price),
        stop_loss: Set(input.stop_loss),
        account_balance: Set(input.account_balance),
        account_risk: Set(input.account_risk),
        total_shares: Set(input.total_shares),
        position_value: Set(input.position_value),
        tranches_json: Set(tranches_json),
        notes: Set(input.notes),
        instrument_json: Set(instrument_json),
        ..Default::default()
    }
    .insert(&db)
    .await
    .context("Failed to insert position calculator plan")?
    .into())
}

pub async fn update_plan(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    input: UpdatePositionCalculatorPlanInput,
) -> Result<PositionCalculatorPlan> {
    let current = find_plan(pool, id, user_id)
        .await?
        .context("Plan not found")?;

    let status = input.status.unwrap_or(current.status);

    let notes = if input.clear_notes {
        None
    } else {
        input.notes.or(current.notes)
    };

    let tranches = if let Some(updates) = input.tranches {
        let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut updated = current.tranches;
        for update in updates {
            if let Some(tranche) = updated.iter_mut().find(|t| t.id == update.id) {
                if let Some(percent) = update.percent {
                    tranche.percent = percent;
                }
                if let Some(shares) = update.shares {
                    tranche.shares = shares;
                }
                if let Some(target_price) = update.target_price {
                    tranche.target_price = target_price;
                }
                if let Some(new_status) = update.status {
                    if new_status == "filled" && tranche.status != "filled" {
                        tranche.filled_at = Some(now.clone());
                    } else if new_status != "filled" {
                        tranche.filled_at = None;
                    }
                    tranche.status = new_status;
                }
            }
        }
        updated
    } else {
        current.tranches
    };

    let tranches_json = serde_json::to_string(&tranches)?;

    let db = sea_orm_connection(pool);
    Ok(position_calculator_plans::ActiveModel {
        id: Set(id.to_owned()),
        status: Set(status),
        tranches_json: Set(tranches_json),
        notes: Set(notes),
        ..Default::default()
    }
    .update(&db)
    .await
    .context("Failed to update position calculator plan")?
    .into())
}

pub async fn delete_plan(pool: &PgPool, id: &str, user_id: &str) -> Result<bool> {
    let db = sea_orm_connection(pool);
    Ok(position_calculator_plans::Entity::delete_many()
        .filter(position_calculator_plans::Column::Id.eq(id))
        .filter(position_calculator_plans::Column::UserId.eq(user_id))
        .exec(&db)
        .await
        .context("Failed to delete position calculator plan")?
        .rows_affected
        > 0)
}

// ---- Offline-first sync (whole-row LWW + soft-delete) --------------------

/// The whole-row payload a `createPositionCalculatorPlan` mutation carries.
/// `tranches_json` travels as an opaque, already-serialized blob — the client
/// owns tranche shape/ids, the server just stores and echoes it back.
pub struct CreatePlanWriteArgs {
    pub id: String,
    pub workspace_id: String,
    pub symbol: String,
    pub position_type: String,
    pub entry_price: f64,
    pub stop_loss: f64,
    pub account_balance: f64,
    pub account_risk: f64,
    pub total_shares: f64,
    pub position_value: f64,
    pub status: String,
    pub tranches_json: String,
    pub notes: Option<String>,
}

/// Only `status`, `tranches_json`, and `notes` are mutable post-create (see
/// module docs / plan) — every other field is fixed at creation time.
pub struct UpdatePlanWriteArgs {
    pub id: String,
    pub status: String,
    pub tranches_json: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PlanDelta {
    pub id: String,
    pub workspace_id: String,
    pub symbol: String,
    pub position_type: String,
    pub entry_price: f64,
    pub stop_loss: f64,
    pub account_balance: f64,
    pub account_risk: f64,
    pub total_shares: f64,
    pub position_value: f64,
    pub status: String,
    pub tranches_json: String,
    pub notes: Option<String>,
    pub hlc: String,
    pub deleted_at: Option<String>,
    pub updated_at: String,
}

const DELTA_COLS: &str = "id, workspace_id, symbol, position_type, entry_price, stop_loss, account_balance, account_risk, \
    total_shares, position_value, status, tranches_json, notes, hlc, \
    to_char(deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS deleted_at, \
    to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at";

pub async fn create_plan_tx(
    conn: &mut PgConnection,
    user_id: &str,
    args: &CreatePlanWriteArgs,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO position_calculator_plans \
         (id, user_id, workspace_id, symbol, position_type, entry_price, stop_loss, account_balance, account_risk, \
          total_shares, position_value, status, tranches_json, notes, hlc) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) \
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
    .bind(args.total_shares)
    .bind(args.position_value)
    .bind(&args.status)
    .bind(&args.tranches_json)
    .bind(args.notes.as_deref())
    .bind(hlc)
    .execute(&mut *conn)
    .await
    .context("create_plan_tx")?;
    Ok(())
}

pub async fn update_plan_tx(
    conn: &mut PgConnection,
    user_id: &str,
    args: &UpdatePlanWriteArgs,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE position_calculator_plans SET status = $1, tranches_json = $2, notes = $3, \
         hlc = $4, updated_at = now() WHERE id = $5 AND user_id = $6",
    )
    .bind(&args.status)
    .bind(&args.tranches_json)
    .bind(args.notes.as_deref())
    .bind(hlc)
    .bind(&args.id)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("update_plan_tx")?;
    Ok(())
}

pub async fn soft_delete_plan_tx(
    conn: &mut PgConnection,
    user_id: &str,
    id: &str,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE position_calculator_plans SET deleted_at = now(), hlc = $1 \
         WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL",
    )
    .bind(hlc)
    .bind(id)
    .bind(user_id)
    .execute(&mut *conn)
    .await
    .context("soft_delete_plan_tx")?;
    Ok(())
}

/// User-scoped pull deltas. Deliberately does NOT filter `deleted_at IS
/// NULL` — see `playbook_table::playbooks_since`.
pub async fn plans_since(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    cookie: Option<&str>,
) -> Result<Vec<PlanDelta>> {
    // A first pull that saw no rows returns `""` as the cursor, and
    // `''::timestamptz` throws. Treat an empty cookie as "no cursor".
    let cookie = cookie.filter(|c| !c.is_empty());
    let sql = format!(
        "SELECT {DELTA_COLS} FROM position_calculator_plans \
         WHERE user_id = $1 AND workspace_id = $2 AND ($3::text IS NULL OR updated_at >= $3::timestamptz) \
         ORDER BY updated_at ASC"
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(workspace_id)
        .bind(cookie)
        .fetch_all(pool)
        .await
        .context("Failed to read position calculator plan deltas")?;

    let mut out = Vec::with_capacity(rows.len());
    for row in &rows {
        out.push(PlanDelta {
            id: row.try_get("id")?,
            workspace_id: row.try_get("workspace_id")?,
            symbol: row.try_get("symbol")?,
            position_type: row.try_get("position_type")?,
            entry_price: row.try_get("entry_price")?,
            stop_loss: row.try_get("stop_loss")?,
            account_balance: row.try_get("account_balance")?,
            account_risk: row.try_get("account_risk")?,
            total_shares: row.try_get("total_shares")?,
            position_value: row.try_get("position_value")?,
            status: row.try_get("status")?,
            tranches_json: row.try_get("tranches_json")?,
            notes: row.try_get("notes")?,
            hlc: row.try_get("hlc")?,
            deleted_at: row.try_get("deleted_at")?,
            updated_at: row.try_get("updated_at")?,
        });
    }
    Ok(out)
}
