use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Utc};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use sqlx::{PgConnection, PgPool, Row};

use crate::service::db::client::sea_orm_connection;
use crate::service::db::entities::brokerage::{snaptrade_oauth_attempts, snaptrade_oauth_grants};

#[derive(Debug, Clone)]
pub struct OAuthAttempt {
    pub id: String,
    pub user_id: String,
    pub workspace_id: String,
    pub code_verifier_encrypted: String,
    pub requested_scopes: Vec<String>,
    pub platform: String,
    pub intent: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct OAuthGrant {
    pub id: String,
    pub user_id: String,
    pub oauth_client_id: String,
    pub snaptrade_user_id: String,
    pub access_token_encrypted: Option<String>,
    pub refresh_token_encrypted: Option<String>,
    pub access_token_expires_at: Option<DateTime<Utc>>,
    pub scopes: Vec<String>,
    pub status: String,
}

pub struct CreateAttempt<'a> {
    pub user_id: &'a str,
    pub workspace_id: &'a str,
    pub state_hash: &'a str,
    pub code_verifier_encrypted: &'a str,
    pub requested_scopes: &'a [String],
    pub platform: &'a str,
    pub intent: &'a str,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct AuthorizedAttempt {
    pub grant_id: String,
    pub workspace_id: String,
    pub intent: String,
}

#[derive(Debug, Clone)]
pub struct OAuthAttemptStatus {
    pub status: String,
    pub error_code: Option<String>,
    pub workspace_id: String,
    pub platform: String,
    pub intent: String,
}

fn grant_from_model(model: snaptrade_oauth_grants::Model) -> Result<OAuthGrant> {
    Ok(OAuthGrant {
        id: model.id,
        user_id: model.user_id,
        oauth_client_id: model.oauth_client_id,
        snaptrade_user_id: model
            .snaptrade_user_id
            .context("SnapTrade OAuth grant has no user ID")?,
        access_token_encrypted: model.access_token_encrypted,
        refresh_token_encrypted: model.refresh_token_encrypted,
        access_token_expires_at: model
            .access_token_expires_at
            .map(|value| value.with_timezone(&Utc)),
        scopes: model.scopes,
        status: model.status,
    })
}

pub async fn create_attempt(pool: &PgPool, input: CreateAttempt<'_>) -> Result<String> {
    sqlx::query_scalar(
        "INSERT INTO snaptrade_oauth_attempts \
         (user_id,workspace_id,state_hash,code_verifier_encrypted,requested_scopes,platform,intent,expires_at) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
    )
    .bind(input.user_id)
    .bind(input.workspace_id)
    .bind(input.state_hash)
    .bind(input.code_verifier_encrypted)
    .bind(input.requested_scopes)
    .bind(input.platform)
    .bind(input.intent)
    .bind(input.expires_at)
    .fetch_one(pool)
    .await
    .context("create SnapTrade OAuth attempt")
}

pub async fn cleanup_attempts(pool: &PgPool) -> Result<()> {
    sqlx::query(
        "UPDATE snaptrade_oauth_attempts SET status='expired',consumed_at=now(),error_code='expired' \
         WHERE status='pending' AND expires_at<=now()",
    )
    .execute(pool)
    .await
    .context("expire stale SnapTrade OAuth attempts")?;
    sqlx::query(
        "DELETE FROM snaptrade_oauth_attempts WHERE consumed_at < now() - interval '7 days'",
    )
    .execute(pool)
    .await
    .context("delete old SnapTrade OAuth attempts")?;
    Ok(())
}

/// Claims a single-use attempt before an upstream token exchange. The temporary
/// processing state prevents a replay while the exchange is in flight.
pub async fn claim_attempt(pool: &PgPool, state_hash: &str) -> Result<OAuthAttempt> {
    let row = sqlx::query(
        "UPDATE snaptrade_oauth_attempts SET status='processing', consumed_at=now() \
         WHERE state_hash=$1 AND status='pending' AND consumed_at IS NULL AND expires_at>now() \
         RETURNING id,user_id,workspace_id,code_verifier_encrypted,requested_scopes,platform,intent,expires_at",
    )
    .bind(state_hash)
    .fetch_optional(pool)
    .await
    .context("claim SnapTrade OAuth attempt")?
    .ok_or_else(|| anyhow!("OAuth attempt is missing, expired, or already used"))?;
    Ok(OAuthAttempt {
        id: row.try_get(0)?,
        user_id: row.try_get(1)?,
        workspace_id: row.try_get(2)?,
        code_verifier_encrypted: row.try_get(3)?,
        requested_scopes: row.try_get(4)?,
        platform: row.try_get(5)?,
        intent: row.try_get(6)?,
        expires_at: row.try_get(7)?,
    })
}

pub struct StoreGrant<'a> {
    pub user_id: &'a str,
    pub oauth_client_id: &'a str,
    pub snaptrade_user_id: &'a str,
    pub access_token_encrypted: &'a str,
    pub refresh_token_encrypted: &'a str,
    pub access_token_expires_at: DateTime<Utc>,
    pub scopes: &'a [String],
}

pub async fn store_grant(pool: &PgPool, input: StoreGrant<'_>) -> Result<OAuthGrant> {
    let row = sqlx::query(
        "INSERT INTO snaptrade_oauth_grants \
         (user_id,oauth_client_id,snaptrade_user_id,access_token_encrypted, \
          refresh_token_encrypted,access_token_expires_at,scopes,status,authorized_at,revoked_at) \
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active',now(),NULL) \
         ON CONFLICT (user_id,oauth_client_id) DO UPDATE SET \
          snaptrade_user_id=EXCLUDED.snaptrade_user_id, \
          access_token_encrypted=EXCLUDED.access_token_encrypted, \
          refresh_token_encrypted=EXCLUDED.refresh_token_encrypted, \
          access_token_expires_at=EXCLUDED.access_token_expires_at, \
          scopes=EXCLUDED.scopes,status='active',authorized_at=now(),revoked_at=NULL \
         WHERE snaptrade_oauth_grants.snaptrade_user_id=EXCLUDED.snaptrade_user_id \
            OR (snaptrade_oauth_grants.status='revoked' AND NOT EXISTS ( \
                SELECT 1 FROM brokerage_connections \
                WHERE oauth_grant_id=snaptrade_oauth_grants.id \
            )) \
         RETURNING id,user_id,oauth_client_id,snaptrade_user_id,access_token_encrypted, \
          refresh_token_encrypted,access_token_expires_at,scopes,status",
    )
    .bind(input.user_id)
    .bind(input.oauth_client_id)
    .bind(input.snaptrade_user_id)
    .bind(input.access_token_encrypted)
    .bind(input.refresh_token_encrypted)
    .bind(input.access_token_expires_at)
    .bind(input.scopes)
    .fetch_optional(pool)
    .await
    .context("store SnapTrade OAuth grant")?
    .ok_or_else(|| {
        anyhow!(
            "Authorize the same SnapTrade Personal account, or revoke the existing connection before switching to a different SnapTrade Personal account"
        )
    })?;
    grant_from_row(&row)
}

pub async fn finish_attempt(
    pool: &PgPool,
    attempt_id: &str,
    status: &str,
    error_code: Option<&str>,
    grant_id: Option<&str>,
) -> Result<()> {
    let affected = sqlx::query(
        "UPDATE snaptrade_oauth_attempts SET status=$2,error_code=$3,grant_id=$4 \
         WHERE id=$1 AND status='processing'",
    )
    .bind(attempt_id)
    .bind(status)
    .bind(error_code)
    .bind(grant_id)
    .execute(pool)
    .await
    .context("finish SnapTrade OAuth attempt")?
    .rows_affected();
    anyhow::ensure!(affected == 1, "OAuth attempt is not processing");
    Ok(())
}

pub async fn attempt_status(
    pool: &PgPool,
    user_id: &str,
    attempt_id: &str,
) -> Result<Option<OAuthAttemptStatus>> {
    sqlx::query(
        "UPDATE snaptrade_oauth_attempts SET status='expired',consumed_at=now(),error_code='expired' \
         WHERE id=$1 AND user_id=$2 AND status='pending' AND expires_at<=now()",
    )
    .bind(attempt_id)
    .bind(user_id)
    .execute(pool)
    .await
    .context("expire SnapTrade OAuth attempt")?;
    let row = sqlx::query_as::<_, (String, Option<String>, String, String, String)>(
        "SELECT status,error_code,workspace_id,platform,intent FROM snaptrade_oauth_attempts WHERE id=$1 AND user_id=$2",
    )
    .bind(attempt_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .context("read SnapTrade OAuth attempt status")?;
    Ok(row.map(
        |(status, error_code, workspace_id, platform, intent)| OAuthAttemptStatus {
            status,
            error_code,
            workspace_id,
            platform,
            intent,
        },
    ))
}

pub async fn authorized_attempt(
    pool: &PgPool,
    user_id: &str,
    attempt_id: &str,
) -> Result<Option<AuthorizedAttempt>> {
    let db = sea_orm_connection(pool);
    Ok(snaptrade_oauth_attempts::Entity::find_by_id(attempt_id)
        .filter(snaptrade_oauth_attempts::Column::UserId.eq(user_id))
        .filter(snaptrade_oauth_attempts::Column::Status.eq("authorized"))
        .filter(snaptrade_oauth_attempts::Column::GrantId.is_not_null())
        .one(&db)
        .await
        .context("find authorized OAuth attempt")?
        .and_then(|model| {
            model.grant_id.map(|grant_id| AuthorizedAttempt {
                grant_id,
                workspace_id: model.workspace_id,
                intent: model.intent,
            })
        }))
}

pub async fn find_grant_for_user(pool: &PgPool, user_id: &str) -> Result<Option<OAuthGrant>> {
    let db = sea_orm_connection(pool);
    snaptrade_oauth_grants::Entity::find()
        .filter(snaptrade_oauth_grants::Column::UserId.eq(user_id))
        .filter(snaptrade_oauth_grants::Column::Status.ne("revoked"))
        .order_by_desc(snaptrade_oauth_grants::Column::AuthorizedAt)
        .one(&db)
        .await
        .context("find SnapTrade OAuth grant")?
        .map(grant_from_model)
        .transpose()
}

pub async fn find_grant(
    pool: &PgPool,
    user_id: &str,
    grant_id: &str,
) -> Result<Option<OAuthGrant>> {
    let db = sea_orm_connection(pool);
    snaptrade_oauth_grants::Entity::find_by_id(grant_id)
        .filter(snaptrade_oauth_grants::Column::UserId.eq(user_id))
        .one(&db)
        .await
        .context("find SnapTrade OAuth grant by ID")?
        .map(grant_from_model)
        .transpose()
}

pub async fn find_grant_on(
    connection: &mut PgConnection,
    user_id: &str,
    grant_id: &str,
) -> Result<Option<OAuthGrant>> {
    let row = sqlx::query(
        "SELECT id,user_id,oauth_client_id,snaptrade_user_id,access_token_encrypted, \
         refresh_token_encrypted,access_token_expires_at,scopes,status \
         FROM snaptrade_oauth_grants WHERE id=$1 AND user_id=$2",
    )
    .bind(grant_id)
    .bind(user_id)
    .fetch_optional(connection)
    .await
    .context("find SnapTrade OAuth grant on locked connection")?;
    row.as_ref().map(grant_from_row).transpose()
}

pub async fn replace_tokens_on(
    connection: &mut PgConnection,
    grant_id: &str,
    access_token_encrypted: &str,
    refresh_token_encrypted: &str,
    access_token_expires_at: DateTime<Utc>,
    scopes: &[String],
) -> Result<()> {
    let affected = sqlx::query(
        "UPDATE snaptrade_oauth_grants SET access_token_encrypted=$2, \
         refresh_token_encrypted=$3,access_token_expires_at=$4,scopes=$5, \
         status='active',last_refreshed_at=now() WHERE id=$1 AND status='active'",
    )
    .bind(grant_id)
    .bind(access_token_encrypted)
    .bind(refresh_token_encrypted)
    .bind(access_token_expires_at)
    .bind(scopes)
    .execute(connection)
    .await
    .context("replace rotated SnapTrade OAuth tokens on locked connection")?
    .rows_affected();
    anyhow::ensure!(affected == 1, "SnapTrade OAuth grant is not active");
    Ok(())
}

pub async fn clear_grant_credentials(pool: &PgPool, grant_id: &str, status: &str) -> Result<()> {
    anyhow::ensure!(
        matches!(status, "reauthorization_required" | "revoked"),
        "invalid inactive OAuth grant status"
    );
    let affected = sqlx::query(
        "UPDATE snaptrade_oauth_grants SET status=$2, \
         access_token_encrypted=NULL,refresh_token_encrypted=NULL,access_token_expires_at=NULL, \
         revoked_at=CASE WHEN $2='revoked' THEN now() ELSE revoked_at END WHERE id=$1",
    )
    .bind(grant_id)
    .bind(status)
    .execute(pool)
    .await
    .context("clear SnapTrade OAuth grant credentials")?
    .rows_affected();
    anyhow::ensure!(affected == 1, "SnapTrade OAuth grant not found");
    Ok(())
}

pub async fn clear_grant_credentials_on(
    connection: &mut PgConnection,
    grant_id: &str,
    status: &str,
) -> Result<()> {
    anyhow::ensure!(
        matches!(status, "reauthorization_required" | "revoked"),
        "invalid inactive OAuth grant status"
    );
    let affected = sqlx::query(
        "UPDATE snaptrade_oauth_grants SET status=$2, \
         access_token_encrypted=NULL,refresh_token_encrypted=NULL,access_token_expires_at=NULL, \
         revoked_at=CASE WHEN $2='revoked' THEN now() ELSE revoked_at END WHERE id=$1",
    )
    .bind(grant_id)
    .bind(status)
    .execute(connection)
    .await
    .context("clear SnapTrade OAuth grant credentials on locked connection")?
    .rows_affected();
    anyhow::ensure!(affected == 1, "SnapTrade OAuth grant not found");
    Ok(())
}

pub async fn revoke_grant_locally(pool: &PgPool, user_id: &str, grant_id: &str) -> Result<u64> {
    let mut transaction = pool.begin().await?;
    let unlinked = sqlx::query(
        "DELETE FROM brokerage_connections \
         WHERE user_id=$1 AND auth_mode='oauth' AND oauth_grant_id=$2",
    )
    .bind(user_id)
    .bind(grant_id)
    .execute(&mut *transaction)
    .await
    .context("unlink OAuth brokerage workspaces")?
    .rows_affected();
    clear_grant_credentials_on(&mut transaction, grant_id, "revoked").await?;
    transaction.commit().await?;
    Ok(unlinked)
}

fn grant_from_row(row: &sqlx::postgres::PgRow) -> Result<OAuthGrant> {
    Ok(OAuthGrant {
        id: row.try_get(0)?,
        user_id: row.try_get(1)?,
        oauth_client_id: row.try_get(2)?,
        snaptrade_user_id: row.try_get(3)?,
        access_token_encrypted: row.try_get(4)?,
        refresh_token_encrypted: row.try_get(5)?,
        access_token_expires_at: row.try_get(6)?,
        scopes: row.try_get(7)?,
        status: row.try_get(8)?,
    })
}
