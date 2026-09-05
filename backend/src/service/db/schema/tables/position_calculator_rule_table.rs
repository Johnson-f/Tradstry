use anyhow::{Context, Result};
use async_graphql::{InputObject, SimpleObject};
use chrono::Utc;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use serde::{Deserialize, Serialize};
use sqlx::{PgConnection, PgPool, Row};

use super::workspaces_table;
use crate::service::db::client::sea_orm_connection;
use crate::service::db::entities::calculator::position_calculator_rules;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct PositionCalculatorRule {
    pub id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub account_balance: f64,
    pub account_risk: f64,
    pub max_stop_loss_pct: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, InputObject)]
#[graphql(rename_fields = "camelCase")]
pub struct UpsertPositionCalculatorRuleInput {
    pub workspace_id: String,
    pub account_balance: f64,
    pub account_risk: f64,
    pub max_stop_loss_pct: f64,
}

impl From<position_calculator_rules::Model> for PositionCalculatorRule {
    fn from(model: position_calculator_rules::Model) -> Self {
        Self {
            id: model.id,
            user_id: model.user_id,
            workspace_id: model.workspace_id,
            account_balance: model.account_balance,
            account_risk: model.account_risk,
            max_stop_loss_pct: model.max_stop_loss_pct,
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
        }
    }
}

pub async fn get_rule(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
) -> Result<Option<PositionCalculatorRule>> {
    let db = sea_orm_connection(pool);
    Ok(position_calculator_rules::Entity::find()
        .filter(position_calculator_rules::Column::UserId.eq(user_id))
        .filter(position_calculator_rules::Column::WorkspaceId.eq(workspace_id))
        .one(&db)
        .await
        .context("Failed to get position calculator rule")?
        .map(Into::into))
}

pub async fn upsert_rule(
    pool: &PgPool,
    user_id: &str,
    input: UpsertPositionCalculatorRuleInput,
) -> Result<PositionCalculatorRule> {
    // The `accounts(id)` foreign key proves the account exists, not that this
    // user owns it. Without this check any caller could write a rule against
    // any account id in the system.
    workspaces_table::find_workspace(pool, &input.workspace_id, user_id)
        .await?
        .with_context(|| format!("account {} not found", input.workspace_id))?;

    let id = crate::ids::new_uuid_v7().to_string();

    sqlx::query(
        "INSERT INTO position_calculator_rules \
         (id, user_id, workspace_id, account_balance, account_risk, max_stop_loss_pct) \
         VALUES ($1, $2, $3, $4, $5, $6) \
         ON CONFLICT (user_id, workspace_id) DO UPDATE SET \
            account_balance = EXCLUDED.account_balance, \
            account_risk = EXCLUDED.account_risk, \
            max_stop_loss_pct = EXCLUDED.max_stop_loss_pct, \
            updated_at = now()",
    )
    .bind(id.as_str())
    .bind(user_id)
    .bind(input.workspace_id.as_str())
    .bind(input.account_balance)
    .bind(input.account_risk)
    .bind(input.max_stop_loss_pct)
    .execute(pool)
    .await
    .context("Failed to upsert position calculator rule")?;

    get_rule(pool, user_id, &input.workspace_id)
        .await?
        .context("Rule not found after upsert")
}

// ---- Offline-first sync (whole-row LWW, keyed by (user_id, workspace_id)) --

/// The editable payload an `upsertPositionCalculatorRule` mutation carries.
/// The server is a dumb last-writer: it writes these fields verbatim + the
/// client's `hlc`; conflict resolution is client-side.
pub struct RuleWriteArgs {
    pub id: String,
    pub workspace_id: String,
    pub account_balance: f64,
    pub account_risk: f64,
    pub max_stop_loss_pct: f64,
}

#[derive(Debug, Clone)]
pub struct RuleDelta {
    pub id: String,
    pub workspace_id: String,
    pub account_balance: f64,
    pub account_risk: f64,
    pub max_stop_loss_pct: f64,
    pub hlc: String,
    pub deleted_at: Option<String>,
    pub updated_at: String,
}

const DELTA_COLS: &str = "id, workspace_id, account_balance, account_risk, max_stop_loss_pct, hlc, \
    to_char(deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS deleted_at, \
    to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at";

/// Upserts on `(user_id, workspace_id)`, the same key the whole-row upsert
/// resolver uses — a rule is one row per (user, account), regardless of
/// which device wrote it or what `id` that device minted.
pub async fn upsert_rule_tx(
    conn: &mut PgConnection,
    user_id: &str,
    args: &RuleWriteArgs,
    hlc: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO position_calculator_rules \
         (id, user_id, workspace_id, account_balance, account_risk, max_stop_loss_pct, hlc) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         ON CONFLICT (user_id, workspace_id) DO UPDATE SET \
            account_balance = EXCLUDED.account_balance, \
            account_risk = EXCLUDED.account_risk, \
            max_stop_loss_pct = EXCLUDED.max_stop_loss_pct, \
            hlc = EXCLUDED.hlc, \
            updated_at = now()",
    )
    .bind(&args.id)
    .bind(user_id)
    .bind(&args.workspace_id)
    .bind(args.account_balance)
    .bind(args.account_risk)
    .bind(args.max_stop_loss_pct)
    .bind(hlc)
    .execute(&mut *conn)
    .await
    .context("upsert_rule_tx")?;
    Ok(())
}

/// Workspace-scoped pull deltas. Deliberately does NOT
/// filter `deleted_at IS NULL` — see `playbook_table::playbooks_since`.
pub async fn rules_since(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    cookie: Option<&str>,
) -> Result<Vec<RuleDelta>> {
    // A first pull that saw no rows returns `""` as the cursor, and
    // `''::timestamptz` throws. Treat an empty cookie as "no cursor".
    let cookie = cookie.filter(|c| !c.is_empty());
    let sql = format!(
        "SELECT {DELTA_COLS} FROM position_calculator_rules \
         WHERE user_id = $1 AND workspace_id = $2 \
           AND ($3::text IS NULL OR updated_at >= $3::timestamptz) \
         ORDER BY updated_at ASC"
    );
    let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(workspace_id)
        .bind(cookie)
        .fetch_all(pool)
        .await
        .context("Failed to read position calculator rule deltas")?;

    let mut out = Vec::with_capacity(rows.len());
    for row in &rows {
        out.push(RuleDelta {
            id: row.try_get("id")?,
            workspace_id: row.try_get("workspace_id")?,
            account_balance: row.try_get("account_balance")?,
            account_risk: row.try_get("account_risk")?,
            max_stop_loss_pct: row.try_get("max_stop_loss_pct")?,
            hlc: row.try_get("hlc")?,
            deleted_at: row.try_get("deleted_at")?,
            updated_at: row.try_get("updated_at")?,
        });
    }
    Ok(out)
}
