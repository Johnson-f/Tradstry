//! Rows and queries for the brokerage tables. Secret columns hold ciphertext
//! from `super::crypto`; nothing here ever sees a plaintext secret.

use anyhow::Result;
use chrono::{DateTime, NaiveDate, Utc};
use sqlx::{PgConnection, PgExecutor, PgPool};
use uuid::Uuid;

use crate::db::new_id;

// ── Commercial registrations ────────────────────────────────────────────────

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Registration {
    pub user_id: Uuid,
    pub snaptrade_user_id: String,
    pub user_secret_encrypted: String,
}

pub async fn registration(pool: &PgPool, user_id: Uuid) -> Result<Option<Registration>> {
    Ok(sqlx::query_as::<_, Registration>(
        "SELECT user_id, snaptrade_user_id, user_secret_encrypted FROM snaptrade_registrations WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?)
}

pub async fn registration_by_snaptrade_id(
    pool: &PgPool,
    snaptrade_user_id: &str,
) -> Result<Option<Registration>> {
    Ok(sqlx::query_as::<_, Registration>(
        "SELECT user_id, snaptrade_user_id, user_secret_encrypted FROM snaptrade_registrations WHERE snaptrade_user_id = $1",
    )
    .bind(snaptrade_user_id)
    .fetch_optional(pool)
    .await?)
}

pub async fn insert_registration(
    pool: &PgPool,
    user_id: Uuid,
    snaptrade_user_id: &str,
    secret_encrypted: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO snaptrade_registrations (user_id, snaptrade_user_id, user_secret_encrypted) VALUES ($1, $2, $3)",
    )
    .bind(user_id)
    .bind(snaptrade_user_id)
    .bind(secret_encrypted)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_registration(pool: &PgPool, user_id: Uuid) -> Result<()> {
    sqlx::query("DELETE FROM snaptrade_registrations WHERE user_id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ── OAuth grants ────────────────────────────────────────────────────────────

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Grant {
    pub id: Uuid,
    pub user_id: Uuid,
    pub oauth_client_id: String,
    pub personal_user_id: String,
    pub access_token_encrypted: Option<String>,
    pub refresh_token_encrypted: Option<String>,
    pub access_token_expires_at: Option<DateTime<Utc>>,
    pub scopes: Vec<String>,
    pub status: String,
}

impl Grant {
    pub fn is_active(&self) -> bool {
        self.status == "active"
    }
}

const GRANT_COLUMNS: &str = "id, user_id, oauth_client_id, personal_user_id, access_token_encrypted, \
     refresh_token_encrypted, access_token_expires_at, scopes, status";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum GrantError {
    /// The user authorized a different SnapTrade Personal account than the one
    /// their linked accounts came from.
    #[error("identity_mismatch")]
    IdentityMismatch,
    /// That SnapTrade Personal account is already linked to another Tradstry user.
    #[error("identity_in_use")]
    IdentityInUse,
}

pub async fn grant_for_user<'e>(
    executor: impl PgExecutor<'e>,
    user_id: Uuid,
    oauth_client_id: &str,
) -> Result<Option<Grant>> {
    Ok(sqlx::query_as::<_, Grant>(sqlx::AssertSqlSafe(format!(
        "SELECT {GRANT_COLUMNS} FROM snaptrade_oauth_grants WHERE user_id = $1 AND oauth_client_id = $2"
    )))
    .bind(user_id)
    .bind(oauth_client_id)
    .fetch_optional(executor)
    .await?)
}

pub async fn grant<'e>(executor: impl PgExecutor<'e>, grant_id: Uuid) -> Result<Option<Grant>> {
    Ok(sqlx::query_as::<_, Grant>(sqlx::AssertSqlSafe(format!(
        "SELECT {GRANT_COLUMNS} FROM snaptrade_oauth_grants WHERE id = $1"
    )))
    .bind(grant_id)
    .fetch_optional(executor)
    .await?)
}

pub async fn active_grant_by_identity(
    pool: &PgPool,
    oauth_client_id: &str,
    personal_user_id: &str,
) -> Result<Option<Grant>> {
    Ok(sqlx::query_as::<_, Grant>(sqlx::AssertSqlSafe(format!(
        "SELECT {GRANT_COLUMNS} FROM snaptrade_oauth_grants
         WHERE oauth_client_id = $1 AND personal_user_id = $2 AND status <> 'revoked'"
    )))
    .bind(oauth_client_id)
    .bind(personal_user_id)
    .fetch_optional(pool)
    .await?)
}

/// Serializes token refreshes and re-authorizations of one grant until the
/// surrounding transaction ends.
pub async fn lock_grant(tx: &mut PgConnection, grant_id: Uuid) -> Result<()> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))")
        .bind(grant_id)
        .execute(tx)
        .await?;
    Ok(())
}

pub struct AuthorizedTokens<'a> {
    pub personal_user_id: &'a str,
    pub access_token_encrypted: &'a str,
    pub refresh_token_encrypted: &'a str,
    pub expires_at: DateTime<Utc>,
    pub scopes: &'a [String],
}

/// Records a completed authorization. Re-authorizing the same Personal
/// identity rotates the existing grant; a different identity is refused while
/// the grant still has linked connections.
pub async fn store_authorized_grant(
    pool: &PgPool,
    user_id: Uuid,
    oauth_client_id: &str,
    tokens: AuthorizedTokens<'_>,
) -> Result<Grant> {
    let mut tx = pool.begin().await?;
    let existing = sqlx::query_as::<_, Grant>(sqlx::AssertSqlSafe(format!(
        "SELECT {GRANT_COLUMNS} FROM snaptrade_oauth_grants WHERE user_id = $1 AND oauth_client_id = $2 FOR UPDATE"
    )))
    .bind(user_id)
    .bind(oauth_client_id)
    .fetch_optional(&mut *tx)
    .await?;

    if let Some(existing) = &existing
        && existing.personal_user_id != tokens.personal_user_id
    {
        let linked: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM brokerage_connections WHERE oauth_grant_id = $1 AND unlinked_at IS NULL)",
        )
        .bind(existing.id)
        .fetch_one(&mut *tx)
        .await?;
        if linked {
            return Err(GrantError::IdentityMismatch.into());
        }
    }

    let query = match &existing {
        Some(_) => format!(
            "UPDATE snaptrade_oauth_grants SET personal_user_id = $3, access_token_encrypted = $4,
                refresh_token_encrypted = $5, access_token_expires_at = $6, scopes = $7,
                status = 'active', authorized_at = now(), refreshed_at = NULL, revoked_at = NULL
             WHERE id = $1 AND user_id = $2 AND oauth_client_id = $8 RETURNING {GRANT_COLUMNS}"
        ),
        None => format!(
            "INSERT INTO snaptrade_oauth_grants (id, user_id, personal_user_id, access_token_encrypted,
                refresh_token_encrypted, access_token_expires_at, scopes, oauth_client_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active') RETURNING {GRANT_COLUMNS}"
        ),
    };
    let stored = sqlx::query_as::<_, Grant>(sqlx::AssertSqlSafe(query))
        .bind(existing.as_ref().map_or_else(new_id, |grant| grant.id))
        .bind(user_id)
        .bind(tokens.personal_user_id)
        .bind(tokens.access_token_encrypted)
        .bind(tokens.refresh_token_encrypted)
        .bind(tokens.expires_at)
        .bind(tokens.scopes)
        .bind(oauth_client_id)
        .fetch_one(&mut *tx)
        .await;
    let stored = match stored {
        Err(sqlx::Error::Database(db))
            if db.constraint() == Some("snaptrade_oauth_grants_identity_idx") =>
        {
            return Err(GrantError::IdentityInUse.into());
        }
        other => other?,
    };
    tx.commit().await?;
    Ok(stored)
}

pub async fn replace_tokens(
    tx: &mut PgConnection,
    grant_id: Uuid,
    access_token_encrypted: &str,
    refresh_token_encrypted: &str,
    expires_at: DateTime<Utc>,
) -> Result<()> {
    sqlx::query(
        "UPDATE snaptrade_oauth_grants SET access_token_encrypted = $2, refresh_token_encrypted = $3,
            access_token_expires_at = $4, refreshed_at = now()
         WHERE id = $1 AND status = 'active'",
    )
    .bind(grant_id)
    .bind(access_token_encrypted)
    .bind(refresh_token_encrypted)
    .bind(expires_at)
    .execute(tx)
    .await?;
    Ok(())
}

/// Removes the grant's usable credentials. `status` is `reauthorization_required`
/// or `revoked`.
pub async fn clear_grant<'e>(
    executor: impl PgExecutor<'e>,
    grant_id: Uuid,
    status: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE snaptrade_oauth_grants SET status = $2, access_token_encrypted = NULL,
            refresh_token_encrypted = NULL, access_token_expires_at = NULL,
            revoked_at = CASE WHEN $2 = 'revoked' THEN now() ELSE revoked_at END
         WHERE id = $1",
    )
    .bind(grant_id)
    .bind(status)
    .execute(executor)
    .await?;
    Ok(())
}

// ── OAuth attempts ──────────────────────────────────────────────────────────

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Attempt {
    pub id: Uuid,
    pub user_id: Uuid,
    pub code_verifier_encrypted: String,
    pub scopes: Vec<String>,
    pub intent: String,
    pub status: String,
    pub error_code: Option<String>,
    pub grant_id: Option<Uuid>,
    pub expires_at: DateTime<Utc>,
}

const ATTEMPT_COLUMNS: &str = "id, user_id, code_verifier_encrypted, scopes, intent, status, error_code, grant_id, expires_at";

pub struct NewAttempt<'a> {
    pub user_id: Uuid,
    pub state_hash: &'a str,
    pub code_verifier_encrypted: &'a str,
    pub scopes: &'a [String],
    pub intent: &'a str,
    pub expires_at: DateTime<Utc>,
}

pub async fn create_attempt(pool: &PgPool, attempt: NewAttempt<'_>) -> Result<Uuid> {
    let id = new_id();
    sqlx::query(
        "INSERT INTO snaptrade_oauth_attempts (id, user_id, state_hash, code_verifier_encrypted, scopes, intent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(id)
    .bind(attempt.user_id)
    .bind(attempt.state_hash)
    .bind(attempt.code_verifier_encrypted)
    .bind(attempt.scopes)
    .bind(attempt.intent)
    .bind(attempt.expires_at)
    .execute(pool)
    .await?;
    Ok(id)
}

/// Claims a pending, unexpired attempt by its state hash. Exactly one caller
/// can claim an attempt; replays and late callbacks get `None`.
pub async fn claim_attempt(pool: &PgPool, state_hash: &str) -> Result<Option<Attempt>> {
    Ok(sqlx::query_as::<_, Attempt>(sqlx::AssertSqlSafe(format!(
        "UPDATE snaptrade_oauth_attempts SET status = 'processing'
         WHERE state_hash = $1 AND status = 'pending' AND expires_at > now()
         RETURNING {ATTEMPT_COLUMNS}"
    )))
    .bind(state_hash)
    .fetch_optional(pool)
    .await?)
}

pub async fn finish_attempt(
    pool: &PgPool,
    id: Uuid,
    status: &str,
    error_code: Option<&str>,
    grant_id: Option<Uuid>,
) -> Result<()> {
    sqlx::query(
        "UPDATE snaptrade_oauth_attempts SET status = $2, error_code = $3, grant_id = $4, finished_at = now()
         WHERE id = $1",
    )
    .bind(id)
    .bind(status)
    .bind(error_code)
    .bind(grant_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn attempt_for_user(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<Option<Attempt>> {
    Ok(sqlx::query_as::<_, Attempt>(sqlx::AssertSqlSafe(format!(
        "SELECT {ATTEMPT_COLUMNS} FROM snaptrade_oauth_attempts WHERE id = $1 AND user_id = $2"
    )))
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?)
}

/// Attempts are kept a day past expiry so a slow client can still read the
/// outcome, then removed.
pub async fn delete_stale_attempts(pool: &PgPool) -> Result<u64> {
    Ok(sqlx::query(
        "DELETE FROM snaptrade_oauth_attempts WHERE expires_at < now() - interval '1 day'",
    )
    .execute(pool)
    .await?
    .rows_affected())
}

// ── Connections ─────────────────────────────────────────────────────────────

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Connection {
    pub id: Uuid,
    pub user_id: Uuid,
    pub auth_mode: String,
    pub oauth_grant_id: Option<Uuid>,
    pub snaptrade_connection_id: String,
    pub institution_name: String,
    pub institution_slug: Option<String>,
    pub disabled: bool,
    pub disabled_at: Option<DateTime<Utc>>,
    pub data_freshness_mode: Option<String>,
    pub new_accounts_available: bool,
    pub checked_at: Option<DateTime<Utc>>,
    pub unlinked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

const CONNECTION_COLUMNS: &str = "id, user_id, auth_mode, oauth_grant_id, snaptrade_connection_id, institution_name, \
     institution_slug, disabled, disabled_at, data_freshness_mode, new_accounts_available, checked_at, unlinked_at, created_at";

pub struct ConnectionUpsert<'a> {
    pub user_id: Uuid,
    pub oauth_grant_id: Option<Uuid>,
    pub snaptrade_connection_id: &'a str,
    pub institution_name: &'a str,
    pub institution_slug: Option<&'a str>,
    pub disabled: bool,
    pub disabled_at: Option<DateTime<Utc>>,
    pub data_freshness_mode: Option<&'a str>,
}

/// Records a connection the user (re)linked. Linking an unlinked connection
/// again brings it back.
pub async fn upsert_connection<'e>(
    executor: impl PgExecutor<'e>,
    connection: ConnectionUpsert<'_>,
) -> Result<Connection> {
    let auth_mode = if connection.oauth_grant_id.is_some() {
        "oauth"
    } else {
        "commercial"
    };
    Ok(sqlx::query_as::<_, Connection>(sqlx::AssertSqlSafe(format!(
        "INSERT INTO brokerage_connections (id, user_id, auth_mode, oauth_grant_id, snaptrade_connection_id,
            institution_name, institution_slug, disabled, disabled_at, data_freshness_mode, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (user_id, snaptrade_connection_id) DO UPDATE SET
            auth_mode = EXCLUDED.auth_mode, oauth_grant_id = EXCLUDED.oauth_grant_id,
            institution_name = EXCLUDED.institution_name, institution_slug = EXCLUDED.institution_slug,
            disabled = EXCLUDED.disabled, disabled_at = EXCLUDED.disabled_at,
            data_freshness_mode = EXCLUDED.data_freshness_mode, checked_at = now(),
            unlinked_at = NULL, updated_at = now()
         RETURNING {CONNECTION_COLUMNS}"
    )))
    .bind(new_id())
    .bind(connection.user_id)
    .bind(auth_mode)
    .bind(connection.oauth_grant_id)
    .bind(connection.snaptrade_connection_id)
    .bind(connection.institution_name)
    .bind(connection.institution_slug)
    .bind(connection.disabled)
    .bind(connection.disabled_at)
    .bind(connection.data_freshness_mode)
    .fetch_one(executor)
    .await?)
}

pub async fn connections_for_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<Connection>> {
    Ok(sqlx::query_as::<_, Connection>(sqlx::AssertSqlSafe(format!(
        "SELECT {CONNECTION_COLUMNS} FROM brokerage_connections WHERE user_id = $1 ORDER BY created_at, id"
    )))
    .bind(user_id)
    .fetch_all(pool)
    .await?)
}

pub async fn connection_for_user(
    pool: &PgPool,
    user_id: Uuid,
    id: Uuid,
) -> Result<Option<Connection>> {
    Ok(sqlx::query_as::<_, Connection>(sqlx::AssertSqlSafe(format!(
        "SELECT {CONNECTION_COLUMNS} FROM brokerage_connections WHERE id = $1 AND user_id = $2"
    )))
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?)
}

/// Every Tradstry connection for a SnapTrade connection ID, across users. One
/// Personal connection can be shared with Tradstry by only one user at a time,
/// but webhooks route by ID, so callers still filter by the event's identity.
pub async fn connections_by_snaptrade_id(
    pool: &PgPool,
    snaptrade_connection_id: &str,
) -> Result<Vec<Connection>> {
    Ok(sqlx::query_as::<_, Connection>(sqlx::AssertSqlSafe(format!(
        "SELECT {CONNECTION_COLUMNS} FROM brokerage_connections WHERE snaptrade_connection_id = $1"
    )))
    .bind(snaptrade_connection_id)
    .fetch_all(pool)
    .await?)
}

pub async fn set_connection_health(
    pool: &PgPool,
    id: Uuid,
    disabled: bool,
    disabled_at: Option<DateTime<Utc>>,
    data_freshness_mode: Option<&str>,
) -> Result<()> {
    sqlx::query(
        "UPDATE brokerage_connections SET disabled = $2, disabled_at = $3,
            data_freshness_mode = COALESCE($4, data_freshness_mode), checked_at = now(), updated_at = now()
         WHERE id = $1",
    )
    .bind(id)
    .bind(disabled)
    .bind(disabled_at)
    .bind(data_freshness_mode)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_new_accounts_available(pool: &PgPool, id: Uuid, available: bool) -> Result<()> {
    sqlx::query("UPDATE brokerage_connections SET new_accounts_available = $2, updated_at = now() WHERE id = $1")
        .bind(id)
        .bind(available)
        .execute(pool)
        .await?;
    Ok(())
}

/// Stops syncing a connection and its accounts. Imported data stays.
pub async fn unlink_connection<'e>(executor: impl PgExecutor<'e>, id: Uuid) -> Result<()> {
    sqlx::query(
        "WITH unlinked AS (
            UPDATE brokerage_connections SET unlinked_at = COALESCE(unlinked_at, now()), updated_at = now()
            WHERE id = $1 RETURNING id
         )
         UPDATE brokerage_accounts SET unlinked_at = COALESCE(unlinked_at, now()), updated_at = now()
         WHERE connection_id IN (SELECT id FROM unlinked)",
    )
    .bind(id)
    .execute(executor)
    .await?;
    Ok(())
}

pub async fn unlink_grant_connections(tx: &mut PgConnection, grant_id: Uuid) -> Result<u64> {
    let ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM brokerage_connections WHERE oauth_grant_id = $1 AND unlinked_at IS NULL",
    )
    .bind(grant_id)
    .fetch_all(&mut *tx)
    .await?;
    for id in &ids {
        unlink_connection(&mut *tx, *id).await?;
    }
    Ok(ids.len() as u64)
}

// ── Accounts ────────────────────────────────────────────────────────────────

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct Account {
    pub id: Uuid,
    pub user_id: Uuid,
    pub connection_id: Uuid,
    pub snaptrade_account_id: String,
    pub name: String,
    pub masked_number: Option<String>,
    pub kind: String,
    pub raw_type: Option<String>,
    pub is_paper: bool,
    pub import_mode: String,
    pub import_start_date: Option<NaiveDate>,
    pub initial_import_completed_at: Option<DateTime<Utc>>,
    pub unlinked_at: Option<DateTime<Utc>>,
    pub workspace_id: Option<Uuid>,
    pub cash_or_margin: String,
}

const ACCOUNT_SELECT: &str = "SELECT a.id, a.user_id, a.connection_id, a.snaptrade_account_id, a.name, a.masked_number, \
     a.kind, a.raw_type, a.is_paper, a.import_mode, a.import_start_date, a.initial_import_completed_at, a.unlinked_at, \
     w.id AS workspace_id, a.cash_or_margin FROM brokerage_accounts a LEFT JOIN workspaces w ON w.brokerage_account_id = a.id";

pub struct NewAccount<'a> {
    pub user_id: Uuid,
    pub connection_id: Uuid,
    pub snaptrade_account_id: &'a str,
    pub name: &'a str,
    pub masked_number: Option<&'a str>,
    pub kind: &'a str,
    pub raw_type: Option<&'a str>,
    pub cash_or_margin: &'a str,
    pub is_paper: bool,
    pub import_mode: &'a str,
    pub import_start_date: Option<NaiveDate>,
}

/// Records a chosen account and creates its workspace, in the caller's
/// transaction so neither exists without the other.
pub async fn create_account_with_workspace(
    tx: &mut PgConnection,
    account: NewAccount<'_>,
) -> Result<Account> {
    let id = new_id();
    sqlx::query(
        "INSERT INTO brokerage_accounts (id, user_id, connection_id, snaptrade_account_id, name, masked_number,
            kind, raw_type, is_paper, import_mode, import_start_date, cash_or_margin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
    )
    .bind(id)
    .bind(account.user_id)
    .bind(account.connection_id)
    .bind(account.snaptrade_account_id)
    .bind(account.name)
    .bind(account.masked_number)
    .bind(account.kind)
    .bind(account.raw_type)
    .bind(account.is_paper)
    .bind(account.import_mode)
    .bind(account.import_start_date)
    .bind(account.cash_or_margin)
    .execute(&mut *tx)
    .await?;
    insert_account_workspace(tx, account.user_id, id, account.name).await?;
    account_by_id(&mut *tx, id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("account vanished after insert"))
}

async fn insert_account_workspace(
    tx: &mut PgConnection,
    user_id: Uuid,
    account_id: Uuid,
    account_name: &str,
) -> Result<()> {
    let workspace_name: String = account_name.chars().take(100).collect();
    sqlx::query(
        "INSERT INTO workspaces (id, user_id, name, brokerage_account_id) VALUES ($1, $2, $3, $4)",
    )
    .bind(new_id())
    .bind(user_id)
    .bind(workspace_name)
    .bind(account_id)
    .execute(&mut *tx)
    .await?;
    Ok(())
}

/// Gives an account a workspace again after the user deleted its old one.
pub async fn ensure_account_workspace(tx: &mut PgConnection, account: Account) -> Result<Account> {
    if account.workspace_id.is_some() {
        return Ok(account);
    }
    insert_account_workspace(tx, account.user_id, account.id, &account.name).await?;
    account_by_id(&mut *tx, account.id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("account vanished while adding its workspace"))
}

/// Brings an unlinked account back, keeping its history and import boundary.
pub async fn relink_account(tx: &mut PgConnection, id: Uuid, connection_id: Uuid) -> Result<()> {
    sqlx::query("UPDATE brokerage_accounts SET unlinked_at = NULL, connection_id = $2, updated_at = now() WHERE id = $1")
        .bind(id)
        .bind(connection_id)
        .execute(tx)
        .await?;
    Ok(())
}

pub async fn account_by_id<'e>(executor: impl PgExecutor<'e>, id: Uuid) -> Result<Option<Account>> {
    Ok(sqlx::query_as::<_, Account>(sqlx::AssertSqlSafe(format!(
        "{ACCOUNT_SELECT} WHERE a.id = $1"
    )))
    .bind(id)
    .fetch_optional(executor)
    .await?)
}

/// Keeps an account's brokerage-reported details current when it is chosen again.
pub async fn update_account_details(
    tx: &mut PgConnection,
    id: Uuid,
    raw_type: Option<&str>,
    cash_or_margin: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE brokerage_accounts SET raw_type = $2, cash_or_margin = $3, updated_at = now() WHERE id = $1",
    )
    .bind(id)
    .bind(raw_type)
    .bind(cash_or_margin)
    .execute(tx)
    .await?;
    Ok(())
}

pub async fn account_by_snaptrade_id<'e>(
    executor: impl PgExecutor<'e>,
    user_id: Uuid,
    snaptrade_account_id: &str,
) -> Result<Option<Account>> {
    Ok(sqlx::query_as::<_, Account>(sqlx::AssertSqlSafe(format!(
        "{ACCOUNT_SELECT} WHERE a.user_id = $1 AND a.snaptrade_account_id = $2"
    )))
    .bind(user_id)
    .bind(snaptrade_account_id)
    .fetch_optional(executor)
    .await?)
}

pub async fn accounts_for_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<Account>> {
    Ok(sqlx::query_as::<_, Account>(sqlx::AssertSqlSafe(format!(
        "{ACCOUNT_SELECT} WHERE a.user_id = $1 ORDER BY a.created_at, a.id"
    )))
    .bind(user_id)
    .fetch_all(pool)
    .await?)
}

pub async fn account_for_user(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<Option<Account>> {
    Ok(sqlx::query_as::<_, Account>(sqlx::AssertSqlSafe(format!(
        "{ACCOUNT_SELECT} WHERE a.user_id = $1 AND a.id = $2"
    )))
    .bind(user_id)
    .bind(id)
    .fetch_optional(pool)
    .await?)
}

pub async fn unlink_account(pool: &PgPool, id: Uuid) -> Result<()> {
    sqlx::query("UPDATE brokerage_accounts SET unlinked_at = COALESCE(unlinked_at, now()), updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}
