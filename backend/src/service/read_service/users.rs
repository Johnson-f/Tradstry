use anyhow::{Context, Result};
use sqlx::PgPool;

use crate::service::db::Db;
use crate::service::db::schema::tables::tags_table;
use crate::service::db::schema::tables::users_table::{self, User};
use crate::service::db::schema::tables::workspaces_table;

/// Find or create a user from Clerk JWT claims, and make sure they are provisioned
/// with a default "Main Workspace" and the default tag categories.
pub async fn ensure_user(db: &Db, clerk_uuid: &str, full_name: &str, email: &str) -> Result<User> {
    let (user, created) =
        users_table::find_or_create_user(db.connection(), clerk_uuid, full_name, email).await?;
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
