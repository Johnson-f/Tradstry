use anyhow::{Context, Result};
use sqlx::PgPool;

use crate::service::auth::TokenKind;
use crate::service::db::Db;
use crate::service::db::schema::tables::tags_table;
use crate::service::db::schema::tables::users_table::{self, User};
use crate::service::db::schema::tables::workspaces_table;

/// Whether a request may create the Tradstry account for a Stytch user it has not
/// seen before. Sign-up belongs to the web app; connected apps such as MCP
/// clients act only for accounts that already exist.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provisioning {
    CreateIfMissing,
    ExistingOnly,
}

impl From<TokenKind> for Provisioning {
    fn from(kind: TokenKind) -> Self {
        match kind {
            TokenKind::Session => Self::CreateIfMissing,
            TokenKind::ConnectedApp => Self::ExistingOnly,
        }
    }
}

#[derive(Clone, Copy, Debug, thiserror::Error)]
#[error(
    "ACCOUNT_REQUIRED: no Tradstry account exists for this login. Sign up at tradstry.com first."
)]
pub struct AccountRequired;

/// Find or create a user from verified token claims, and make sure they are provisioned
/// with a default "Main Workspace" and the default tag categories.
pub async fn ensure_user(
    db: &Db,
    stytch_user_id: &str,
    full_name: &str,
    email: &str,
) -> Result<User> {
    load_user(
        db,
        stytch_user_id,
        full_name,
        email,
        Provisioning::CreateIfMissing,
    )
    .await
}

/// Resolve the user for a verified Stytch user. With [`Provisioning::ExistingOnly`] an
/// unknown subject fails with [`AccountRequired`] and nothing is written.
pub async fn load_user(
    db: &Db,
    stytch_user_id: &str,
    full_name: &str,
    email: &str,
    provisioning: Provisioning,
) -> Result<User> {
    let (user, created) = match provisioning {
        Provisioning::CreateIfMissing => {
            users_table::find_or_create_user(db.connection(), stytch_user_id, full_name, email)
                .await?
        }
        Provisioning::ExistingOnly => {
            let user = users_table::find_user(db.connection(), stytch_user_id)
                .await?
                .ok_or(AccountRequired)?;
            (user, false)
        }
    };
    let user = users_table::fill_blank_profile(db.connection(), user, full_name, email).await?;

    // Not only on first sign-in: if provisioning failed after the user row was
    // inserted, every later request would otherwise see `created == false` and the
    // user would be left without a workspace for good.
    if created || needs_provisioning(db.pool(), &user.id).await? {
        provision(db.pool(), &user.id).await?;
    }

    Ok(user)
}

/// A provisioned user always has a workspace (the last one cannot be deleted) and
/// all three default tag categories (role categories cannot be deleted).
async fn needs_provisioning(pool: &PgPool, user_id: &str) -> Result<bool> {
    sqlx::query_scalar(
        "SELECT NOT EXISTS (SELECT 1 FROM workspaces WHERE user_id = $1) \
             OR (SELECT count(DISTINCT role) FROM tag_categories \
                 WHERE user_id = $1 AND role IS NOT NULL AND deleted_at IS NULL) < 3",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .context("Failed to check user provisioning")
}

async fn provision(pool: &PgPool, user_id: &str) -> Result<()> {
    // Serialize concurrent first requests for the same user, or each would create
    // its own default workspace. The lock is held until `lock` commits.
    let mut lock = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('tradstry:provision:' || $1, 0))")
        .bind(user_id)
        .execute(&mut *lock)
        .await
        .context("Failed to lock user provisioning")?;

    let existing: Option<String> = sqlx::query_scalar(
        "SELECT id FROM workspaces WHERE user_id = $1 ORDER BY created_at, id LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .context("Failed to find the user's workspace")?;
    let workspace_id = match existing {
        Some(id) => id,
        None => {
            workspaces_table::create_default_workspace(pool, user_id)
                .await?
                .id
        }
    };
    tags_table::ensure_default_categories(pool, user_id, &workspace_id).await?;

    lock.commit().await?;
    Ok(())
}
