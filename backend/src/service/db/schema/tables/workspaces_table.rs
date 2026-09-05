use crate::service::db::util::parse_flexible_datetime;
use anyhow::{Context, Result, ensure};
use async_graphql::{InputObject, SimpleObject};
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub icon: String,
    pub currency: String,
    pub risk_profile: String,
    pub asset_class: String,
    pub broker: Option<String>,
    pub snaptrade_user_id: Option<String>,
    #[graphql(skip)]
    #[serde(default, skip_serializing)]
    pub snaptrade_user_secret_encrypted: Option<String>,
    pub snaptrade_connection_id: Option<String>,
    pub snaptrade_account_id: Option<String>,
    pub total_value: Option<f64>,
    pub total_value_currency: Option<String>,
    pub snaptrade_connection_disabled: bool,
    pub snaptrade_connection_disabled_at: Option<String>,
    pub brokerage_setup_complete: bool,
    pub brokerage_setup_completed_at: Option<String>,
    pub snaptrade_auth_mode: String,
    #[graphql(skip)]
    #[serde(default, skip_serializing)]
    pub snaptrade_oauth_grant_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, InputObject)]
pub struct CreateWorkspaceInput {
    pub name: String,
    #[graphql(default_with = "\"chart-line-data-01\".to_string()")]
    pub icon: String,
    #[graphql(default_with = "\"USD\".to_string()")]
    pub currency: String,
    #[graphql(default_with = "\"mixed\".to_string()")]
    pub asset_class: String,
    pub broker: Option<String>,
    #[graphql(default_with = "\"moderate\".to_string()")]
    pub risk_profile: String,
}

#[derive(Debug, InputObject)]
pub struct UpdateWorkspaceInput {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub currency: Option<String>,
    pub asset_class: Option<String>,
    pub broker: Option<String>,
    pub risk_profile: Option<String>,
}

fn opt_text(row: &sqlx::postgres::PgRow, idx: usize) -> Option<String> {
    row.try_get::<Option<String>, _>(idx)
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
}

fn row_to_workspace(row: &sqlx::postgres::PgRow) -> Result<Workspace> {
    Ok(Workspace {
        id: row.try_get(0)?,
        user_id: row.try_get(1)?,
        name: row.try_get(2)?,
        icon: row.try_get(3)?,
        currency: row.try_get(4)?,
        risk_profile: row.try_get(5)?,
        asset_class: row.try_get(6)?,
        broker: opt_text(row, 7),
        snaptrade_user_id: opt_text(row, 8),
        snaptrade_user_secret_encrypted: opt_text(row, 9),
        snaptrade_connection_id: opt_text(row, 10),
        snaptrade_account_id: opt_text(row, 11),
        total_value: row.try_get(12)?,
        total_value_currency: opt_text(row, 13),
        created_at: row.try_get(14)?,
        updated_at: row.try_get(15)?,
        snaptrade_connection_disabled: row.try_get::<Option<bool>, _>(16)?.unwrap_or(false),
        snaptrade_connection_disabled_at: row.try_get(17)?,
        brokerage_setup_complete: row.try_get(18)?,
        brokerage_setup_completed_at: row.try_get(19)?,
        snaptrade_auth_mode: row.try_get(20)?,
        snaptrade_oauth_grant_id: opt_text(row, 21),
    })
}

const SELECT_COLS: &str = "w.id, w.user_id, w.name, w.icon, w.currency, w.risk_profile, w.asset_class, \
    bc.broker, bc.snaptrade_user_id, bc.snaptrade_user_secret_encrypted, \
    bc.snaptrade_connection_id, bc.snaptrade_account_id, bc.total_value, bc.total_value_currency, \
    to_char(w.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS created_at, \
    to_char(w.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS updated_at, \
    bc.connection_disabled, \
    to_char(bc.connection_disabled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS connection_disabled_at, \
    bc.setup_completed_at IS NOT NULL AS brokerage_setup_complete, \
    to_char(bc.setup_completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS brokerage_setup_completed_at, \
    COALESCE(bc.auth_mode, 'commercial'), bc.oauth_grant_id";

const FROM_JOIN: &str =
    "FROM workspaces w LEFT JOIN brokerage_connections bc ON bc.workspace_id = w.id";

fn validate_asset_class(value: &str) -> Result<()> {
    ensure!(
        matches!(
            value,
            "futures" | "options" | "stocks" | "forex" | "crypto" | "mixed" | "other"
        ),
        "unsupported asset class"
    );
    Ok(())
}

pub async fn list_workspaces(pool: &PgPool, user_id: &str) -> Result<Vec<Workspace>> {
    let rows = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT {SELECT_COLS} {FROM_JOIN} WHERE w.user_id = $1 ORDER BY w.created_at, w.id"
    )))
    .bind(user_id)
    .fetch_all(pool)
    .await
    .context("Failed to list workspaces")?;
    rows.iter().map(row_to_workspace).collect()
}

pub async fn find_workspace<'e, E>(
    executor: E,
    id: &str,
    user_id: &str,
) -> Result<Option<Workspace>>
where
    E: sqlx::PgExecutor<'e>,
{
    let row = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT {SELECT_COLS} {FROM_JOIN} WHERE w.id = $1 AND w.user_id = $2"
    )))
    .bind(id)
    .bind(user_id)
    .fetch_optional(executor)
    .await
    .context("Failed to find workspace")?;
    row.as_ref().map(row_to_workspace).transpose()
}

pub async fn find_by_snaptrade_account_id(
    pool: &PgPool,
    user_id: &str,
    snaptrade_account_id: &str,
) -> Result<Option<Workspace>> {
    let row = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT {SELECT_COLS} {FROM_JOIN} WHERE w.user_id = $1 AND bc.snaptrade_account_id = $2"
    )))
    .bind(user_id)
    .bind(snaptrade_account_id)
    .fetch_optional(pool)
    .await
    .context("Failed to find workspace by SnapTrade account ID")?;
    row.as_ref().map(row_to_workspace).transpose()
}

pub async fn list_brokerage_sync_account_bindings(
    pool: &PgPool,
    user_id: &str,
) -> Result<Vec<(String, String)>> {
    let rows = sqlx::query(
        "SELECT workspace_id, MIN(snaptrade_account_id) \
         FROM brokerage_sync_state \
         WHERE user_id=$1 AND snaptrade_account_id IS NOT NULL \
         GROUP BY workspace_id \
         HAVING COUNT(DISTINCT snaptrade_account_id) = 1",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .context("Failed to list brokerage sync account bindings")?;

    rows.into_iter()
        .map(|row| Ok((row.try_get(0)?, row.try_get(1)?)))
        .collect()
}

pub async fn find_with_snaptrade_credentials(
    pool: &PgPool,
    user_id: &str,
) -> Result<Option<Workspace>> {
    let row = sqlx::query(sqlx::AssertSqlSafe(format!(
        "SELECT {SELECT_COLS} {FROM_JOIN} WHERE w.user_id = $1 \
         AND bc.snaptrade_user_id IS NOT NULL \
         AND bc.snaptrade_user_secret_encrypted IS NOT NULL \
         ORDER BY w.created_at, w.id LIMIT 1"
    )))
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .context("Failed to find SnapTrade credentials")?;
    row.as_ref().map(row_to_workspace).transpose()
}

pub async fn create_workspace(
    pool: &PgPool,
    user_id: &str,
    input: CreateWorkspaceInput,
) -> Result<Workspace> {
    validate_asset_class(&input.asset_class)?;
    let id = crate::ids::new_uuid_v7().to_string();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO workspaces (id, user_id, name, icon, currency, risk_profile, asset_class) \
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(input.name.trim())
    .bind(&input.icon)
    .bind(&input.currency)
    .bind(&input.risk_profile)
    .bind(&input.asset_class)
    .execute(&mut *tx)
    .await
    .context("Failed to insert workspace")?;
    if let Some(broker) = input
        .broker
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        sqlx::query(
            "INSERT INTO brokerage_connections (workspace_id, user_id, broker) VALUES ($1, $2, $3)",
        )
        .bind(&id)
        .bind(user_id)
        .bind(broker.trim())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    crate::service::db::schema::tables::notebook::folders::ensure_system_folder(pool, user_id, &id)
        .await?;
    find_workspace(pool, &id, user_id)
        .await?
        .context("Workspace not found after insert")
}

pub async fn update_workspace(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    input: UpdateWorkspaceInput,
) -> Result<Workspace> {
    if let Some(asset_class) = input.asset_class.as_deref() {
        validate_asset_class(asset_class)?;
    }
    let current = find_workspace(pool, id, user_id)
        .await?
        .context("Workspace not found")?;
    let name = input.name.unwrap_or(current.name);
    let icon = input.icon.unwrap_or(current.icon);
    let currency = input.currency.unwrap_or(current.currency);
    let risk_profile = input.risk_profile.unwrap_or(current.risk_profile);
    let asset_class = input.asset_class.unwrap_or(current.asset_class);
    let mut tx = pool.begin().await?;
    sqlx::query(
        "UPDATE workspaces SET name=$1, icon=$2, currency=$3, risk_profile=$4, asset_class=$5 \
         WHERE id=$6 AND user_id=$7",
    )
    .bind(name.trim())
    .bind(icon)
    .bind(currency)
    .bind(risk_profile)
    .bind(asset_class)
    .bind(id)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .context("Failed to update workspace")?;
    if let Some(broker) = input.broker {
        sqlx::query(
            "INSERT INTO brokerage_connections (workspace_id, user_id, broker) VALUES ($1,$2,$3) \
             ON CONFLICT (workspace_id) DO UPDATE SET broker=EXCLUDED.broker",
        )
        .bind(id)
        .bind(user_id)
        .bind(broker.trim())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    find_workspace(pool, id, user_id)
        .await?
        .context("Workspace not found after update")
}

pub async fn delete_workspace(pool: &PgPool, id: &str, user_id: &str) -> Result<bool> {
    let mut tx = pool.begin().await?;

    // Serialize workspace deletions for this user. Without this lock, two
    // concurrent requests could both observe two workspaces and delete one
    // each, bypassing the "keep at least one" rule.
    let locked_user: Option<String> =
        sqlx::query_scalar("SELECT id FROM users WHERE id=$1 FOR UPDATE")
            .bind(user_id)
            .fetch_optional(&mut *tx)
            .await?;
    ensure!(locked_user.is_some(), "User not found");

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workspaces WHERE user_id=$1")
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await?;
    ensure!(count > 1, "You must keep at least one workspace");
    let result = sqlx::query("DELETE FROM workspaces WHERE id=$1 AND user_id=$2")
        .bind(id)
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(result.rows_affected() > 0)
}

pub async fn update_snaptrade_credentials(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    snaptrade_user_id: &str,
    encrypted_secret: &str,
    connection_id: Option<&str>,
) -> Result<Workspace> {
    ensure!(
        find_workspace(pool, id, user_id).await?.is_some(),
        "Workspace not found"
    );
    sqlx::query(
        "INSERT INTO brokerage_connections \
         (workspace_id,user_id,snaptrade_user_id,snaptrade_user_secret_encrypted,snaptrade_connection_id) \
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (workspace_id) DO UPDATE SET \
         auth_mode='commercial',oauth_grant_id=NULL, \
         snaptrade_user_id=EXCLUDED.snaptrade_user_id, \
         snaptrade_user_secret_encrypted=EXCLUDED.snaptrade_user_secret_encrypted, \
         snaptrade_connection_id=EXCLUDED.snaptrade_connection_id",
    )
    .bind(id)
    .bind(user_id)
    .bind(snaptrade_user_id)
    .bind(encrypted_secret)
    .bind(connection_id)
    .execute(pool)
    .await?;
    Ok(find_workspace(pool, id, user_id)
        .await?
        .expect("workspace exists"))
}

pub async fn prepare_snaptrade_connection(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    snaptrade_user_id: &str,
    encrypted_secret: &str,
    connection_id: &str,
) -> Result<Workspace> {
    ensure!(
        find_workspace(pool, id, user_id).await?.is_some(),
        "Workspace not found"
    );
    sqlx::query(
        "INSERT INTO brokerage_connections (
             workspace_id,user_id,snaptrade_user_id,
             snaptrade_user_secret_encrypted,snaptrade_connection_id,setup_completed_at
         ) VALUES ($1,$2,$3,$4,$5,NULL)
         ON CONFLICT (workspace_id) DO UPDATE SET
             auth_mode='commercial',oauth_grant_id=NULL,
             snaptrade_user_id=EXCLUDED.snaptrade_user_id,
             snaptrade_user_secret_encrypted=EXCLUDED.snaptrade_user_secret_encrypted,
             setup_completed_at=CASE
                 WHEN brokerage_connections.snaptrade_connection_id=EXCLUDED.snaptrade_connection_id
                 THEN brokerage_connections.setup_completed_at
                 ELSE NULL
             END,
             snaptrade_account_id=CASE
                 WHEN brokerage_connections.snaptrade_connection_id=EXCLUDED.snaptrade_connection_id
                 THEN brokerage_connections.snaptrade_account_id
                 ELSE NULL
             END,
             snaptrade_connection_id=EXCLUDED.snaptrade_connection_id",
    )
    .bind(id)
    .bind(user_id)
    .bind(snaptrade_user_id)
    .bind(encrypted_secret)
    .bind(connection_id)
    .execute(pool)
    .await
    .context("Failed to prepare brokerage connection")?;
    find_workspace(pool, id, user_id)
        .await?
        .context("Workspace not found after preparing brokerage connection")
}

pub async fn prepare_snaptrade_oauth_connection(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    oauth_grant_id: &str,
    connection_id: &str,
) -> Result<Workspace> {
    ensure!(
        find_workspace(pool, id, user_id).await?.is_some(),
        "Workspace not found"
    );
    sqlx::query(
        "INSERT INTO brokerage_connections (workspace_id,user_id,auth_mode,oauth_grant_id, \
         snaptrade_connection_id,setup_completed_at) VALUES ($1,$2,'oauth',$3,$4,NULL) \
         ON CONFLICT (workspace_id) DO UPDATE SET auth_mode='oauth',oauth_grant_id=EXCLUDED.oauth_grant_id, \
         snaptrade_user_id=NULL,snaptrade_user_secret_encrypted=NULL, \
         setup_completed_at=CASE WHEN brokerage_connections.snaptrade_connection_id=EXCLUDED.snaptrade_connection_id \
           THEN brokerage_connections.setup_completed_at ELSE NULL END, \
         snaptrade_account_id=CASE WHEN brokerage_connections.snaptrade_connection_id=EXCLUDED.snaptrade_connection_id \
           THEN brokerage_connections.snaptrade_account_id ELSE NULL END, \
         snaptrade_connection_id=EXCLUDED.snaptrade_connection_id",
    )
    .bind(id)
    .bind(user_id)
    .bind(oauth_grant_id)
    .bind(connection_id)
    .execute(pool)
    .await?;
    Ok(find_workspace(pool, id, user_id)
        .await?
        .expect("workspace exists"))
}

pub async fn set_snaptrade_account_id(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    snaptrade_account_id: &str,
) -> Result<Workspace> {
    let previous_account_id = find_workspace(pool, id, user_id)
        .await?
        .and_then(|workspace| workspace.snaptrade_account_id);
    let result = sqlx::query(
        "UPDATE brokerage_connections SET snaptrade_account_id=$1 WHERE workspace_id=$2 AND user_id=$3",
    )
    .bind(snaptrade_account_id)
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?;
    ensure!(
        result.rows_affected() == 1,
        "Workspace has no brokerage connection"
    );
    if let Some(previous_account_id) = previous_account_id
        && previous_account_id != snaptrade_account_id
    {
        sqlx::query(
            "INSERT INTO brokerage_sync_state (
                 user_id,workspace_id,snaptrade_account_id,
                 transaction_import_mode,transaction_import_start_date,
                 transaction_import_configured_at
             )
             SELECT user_id,workspace_id,$1,transaction_import_mode,
                    transaction_import_start_date,transaction_import_configured_at
             FROM brokerage_sync_state
             WHERE user_id=$2 AND workspace_id=$3 AND snaptrade_account_id=$4
               AND transaction_import_configured_at IS NOT NULL
             ON CONFLICT (user_id,workspace_id,snaptrade_account_id) DO NOTHING",
        )
        .bind(snaptrade_account_id)
        .bind(user_id)
        .bind(id)
        .bind(previous_account_id)
        .execute(pool)
        .await?;
    }
    sqlx::query(
        "INSERT INTO brokerage_sync_state (
             user_id,workspace_id,snaptrade_account_id,
             transaction_import_mode,transaction_import_configured_at
         ) VALUES ($1,$2,$3,'all',now())
         ON CONFLICT (user_id,workspace_id,snaptrade_account_id) DO UPDATE SET
             transaction_import_mode=COALESCE(
                 brokerage_sync_state.transaction_import_mode,
                 EXCLUDED.transaction_import_mode
             ),
             transaction_import_configured_at=COALESCE(
                 brokerage_sync_state.transaction_import_configured_at,
                 EXCLUDED.transaction_import_configured_at
             ),
             updated_at=now()",
    )
    .bind(user_id)
    .bind(id)
    .bind(snaptrade_account_id)
    .execute(pool)
    .await?;
    sqlx::query(
        "UPDATE brokerage_connections SET setup_completed_at=COALESCE(setup_completed_at,now())
         WHERE workspace_id=$1 AND user_id=$2",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(find_workspace(pool, id, user_id)
        .await?
        .expect("workspace exists"))
}

pub async fn clear_snaptrade_credentials(
    pool: &PgPool,
    id: &str,
    user_id: &str,
) -> Result<Workspace> {
    sqlx::query("DELETE FROM brokerage_connections WHERE workspace_id=$1 AND user_id=$2")
        .bind(id)
        .bind(user_id)
        .execute(pool)
        .await?;
    find_workspace(pool, id, user_id)
        .await?
        .context("Workspace not found")
}

/// Clears a stale SnapTrade registration everywhere the same encrypted secret
/// was reused for a user, while preserving the broker label and last-known
/// portfolio data for each workspace.
///
/// SnapTrade credentials are shared across a user's workspaces. Clearing only
/// the workspace that initiated recovery would let the next attempt copy the
/// same stale credentials back from another workspace. Matching the encrypted
/// secret also prevents concurrent recovery from clearing newly issued
/// credentials for the same SnapTrade user ID.
pub async fn clear_shared_snaptrade_credentials(
    pool: &PgPool,
    user_id: &str,
    encrypted_secret: &str,
) -> Result<u64> {
    let result = sqlx::query(
        "UPDATE brokerage_connections SET \
         snaptrade_user_id=NULL, snaptrade_user_secret_encrypted=NULL, \
         snaptrade_connection_id=NULL, snaptrade_account_id=NULL, \
         connection_disabled=false, connection_disabled_at=NULL, \
         data_freshness_mode='unknown', setup_completed_at=NULL \
         WHERE user_id=$1 AND snaptrade_user_secret_encrypted=$2",
    )
    .bind(user_id)
    .bind(encrypted_secret)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

pub async fn update_total_value(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    total_value: f64,
    currency: Option<&str>,
) -> Result<()> {
    sqlx::query(
        "UPDATE brokerage_connections SET total_value=$1, \
         total_value_currency=COALESCE($2,total_value_currency) WHERE workspace_id=$3 AND user_id=$4",
    )
    .bind(total_value)
    .bind(currency)
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn create_default_workspace(pool: &PgPool, user_id: &str) -> Result<Workspace> {
    create_workspace(
        pool,
        user_id,
        CreateWorkspaceInput {
            name: "Main Workspace".into(),
            icon: "chart-line-data-01".into(),
            currency: "USD".into(),
            asset_class: "mixed".into(),
            broker: None,
            risk_profile: "moderate".into(),
        },
    )
    .await
}

pub async fn set_connection_disabled(
    pool: &PgPool,
    id: &str,
    user_id: &str,
    disabled: bool,
    disabled_at: Option<&str>,
) -> Result<bool> {
    let disabled_at = disabled_at.map(parse_flexible_datetime).transpose()?;
    let result = sqlx::query(
        "UPDATE brokerage_connections SET connection_disabled=$1, connection_disabled_at=$2 \
         WHERE workspace_id=$3 AND user_id=$4 AND connection_disabled IS DISTINCT FROM $1",
    )
    .bind(disabled)
    .bind(disabled_at)
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() == 1)
}

pub async fn set_connection_freshness_mode(
    pool: &PgPool,
    workspace_id: &str,
    user_id: &str,
    mode: &str,
) -> Result<()> {
    anyhow::ensure!(
        matches!(mode, "unknown" | "realtime" | "delayed"),
        "invalid SnapTrade freshness mode"
    );
    sqlx::query(
        "UPDATE brokerage_connections SET data_freshness_mode = $1 \
         WHERE workspace_id = $2 AND user_id = $3",
    )
    .bind(mode)
    .bind(workspace_id)
    .bind(user_id)
    .execute(pool)
    .await
    .context("Failed to update connection freshness mode")?;
    Ok(())
}

pub async fn set_broker(
    pool: &PgPool,
    workspace_id: &str,
    user_id: &str,
    broker: &str,
) -> Result<Workspace> {
    sqlx::query("UPDATE brokerage_connections SET broker=$1 WHERE workspace_id=$2 AND user_id=$3")
        .bind(broker.trim())
        .bind(workspace_id)
        .bind(user_id)
        .execute(pool)
        .await
        .context("Failed to update brokerage label")?;
    find_workspace(pool, workspace_id, user_id)
        .await?
        .context("Workspace not found after updating brokerage label")
}

#[derive(Debug, Clone)]
pub struct BrokerageSyncOutcome {
    pub diagnostic_id: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub succeeded_at: Option<String>,
    pub transactions_synced: i32,
    pub holdings_synced: i32,
    pub balances_synced: i32,
}

pub async fn brokerage_sync_outcome(
    pool: &PgPool,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<BrokerageSyncOutcome>> {
    let row = sqlx::query(
        "SELECT last_sync_id, last_sync_status, last_sync_error, \
         to_char(last_sync_started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'), \
         to_char(last_sync_finished_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'), \
         to_char(last_sync_succeeded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'), \
         last_sync_transactions_synced, last_sync_holdings_synced, last_sync_balances_synced \
         FROM brokerage_connections WHERE workspace_id=$1 AND user_id=$2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .context("Failed to read brokerage sync outcome")?;
    Ok(row.map(|row| BrokerageSyncOutcome {
        diagnostic_id: row.try_get(0).unwrap_or(None),
        status: row.try_get(1).unwrap_or_else(|_| "idle".to_string()),
        error: row.try_get(2).unwrap_or(None),
        started_at: row.try_get(3).unwrap_or(None),
        finished_at: row.try_get(4).unwrap_or(None),
        succeeded_at: row.try_get(5).unwrap_or(None),
        transactions_synced: row.try_get(6).unwrap_or(0),
        holdings_synced: row.try_get(7).unwrap_or(0),
        balances_synced: row.try_get(8).unwrap_or(0),
    }))
}

pub async fn mark_brokerage_sync_started(
    pool: &PgPool,
    workspace_id: &str,
    user_id: &str,
    diagnostic_id: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE brokerage_connections SET last_sync_id=$1, last_sync_status='queued', \
         last_sync_error=NULL, last_sync_started_at=now(), last_sync_finished_at=NULL, \
         last_sync_transactions_synced=0, last_sync_holdings_synced=0, \
         last_sync_balances_synced=0 \
         WHERE workspace_id=$2 AND user_id=$3",
    )
    .bind(diagnostic_id)
    .bind(workspace_id)
    .bind(user_id)
    .execute(pool)
    .await
    .context("Failed to mark brokerage sync queued")?;
    Ok(())
}

pub async fn mark_brokerage_sync_completed(
    pool: &PgPool,
    workspace_id: &str,
    user_id: &str,
    diagnostic_id: &str,
    transactions_synced: i32,
    holdings_synced: i32,
    balances_synced: i32,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE brokerage_connections SET last_sync_status='completed', last_sync_error=NULL, \
         last_sync_finished_at=now(), last_sync_succeeded_at=now(), \
         last_sync_transactions_synced=$1, last_sync_holdings_synced=$2, \
         last_sync_balances_synced=$3 \
         WHERE workspace_id=$4 AND user_id=$5 AND last_sync_id=$6",
    )
    .bind(transactions_synced)
    .bind(holdings_synced)
    .bind(balances_synced)
    .bind(workspace_id)
    .bind(user_id)
    .bind(diagnostic_id)
    .execute(pool)
    .await
    .context("Failed to mark brokerage sync completed")?;
    Ok(result.rows_affected() == 1)
}

pub async fn mark_brokerage_sync_failed(
    pool: &PgPool,
    workspace_id: &str,
    user_id: &str,
    diagnostic_id: &str,
    error: &str,
) -> Result<bool> {
    let result = sqlx::query(
        "UPDATE brokerage_connections SET last_sync_status='failed', last_sync_error=$1, \
         last_sync_finished_at=now() \
         WHERE workspace_id=$2 AND user_id=$3 AND last_sync_id=$4",
    )
    .bind(error)
    .bind(workspace_id)
    .bind(user_id)
    .bind(diagnostic_id)
    .execute(pool)
    .await
    .context("Failed to mark brokerage sync failed")?;
    Ok(result.rows_affected() == 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypted_secret_is_never_serialized() {
        let workspace = Workspace {
            id: "ws-1".into(),
            user_id: "user-1".into(),
            name: "Futures".into(),
            icon: "chart-line-data-01".into(),
            currency: "USD".into(),
            risk_profile: "moderate".into(),
            asset_class: "futures".into(),
            broker: Some("Tradovate".into()),
            snaptrade_user_id: Some("st-user".into()),
            snaptrade_user_secret_encrypted: Some("SECRET".into()),
            snaptrade_connection_id: Some("conn".into()),
            snaptrade_account_id: Some("st-account".into()),
            total_value: Some(1.0),
            total_value_currency: Some("USD".into()),
            snaptrade_connection_disabled: false,
            snaptrade_connection_disabled_at: None,
            brokerage_setup_complete: true,
            brokerage_setup_completed_at: Some("2026-01-01T00:00:00Z".into()),
            snaptrade_auth_mode: "commercial".into(),
            snaptrade_oauth_grant_id: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        };
        let json = serde_json::to_string(&workspace).unwrap();
        assert!(!json.contains("SECRET"));
    }
}
