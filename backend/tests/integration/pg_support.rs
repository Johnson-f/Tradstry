//! Shared Postgres helpers for the integration tests. Each test gets its own
//! database from [`TestDb`]; see `test_db.rs`.

use sqlx::PgPool;

pub use crate::test_db::TestDb;

/// The identity column `users` has at this point of the migration history; the
/// archived SQLx replay predates `stytch_user_id`.
#[allow(dead_code)]
pub async fn users_identity_column(pool: &PgPool) -> &'static str {
    let migrated: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns \
         WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'stytch_user_id')",
    )
    .fetch_one(pool)
    .await
    .expect("inspect users columns");
    if migrated {
        "stytch_user_id"
    } else {
        "clerk_uuid"
    }
}

/// Inserts a user and an account, returning `(user_id, workspace_id)`.
/// `notebook_notes` and `notebook_folders` both FK to these, so no notebook row
/// can exist without them.
#[allow(dead_code)]
pub async fn seed_user_workspace(pool: &PgPool) -> (String, String) {
    let user_id = tradstry_backend::ids::new_uuid_v7().to_string();
    let workspace_id = tradstry_backend::ids::new_uuid_v7().to_string();
    let stytch_user_id = tradstry_backend::ids::new_uuid_v7().to_string();

    let identity = users_identity_column(pool).await;

    sqlx::query(sqlx::AssertSqlSafe(format!(
        "INSERT INTO users (id, {identity}, email, full_name) VALUES ($1, $2, $3, $4)"
    )))
    .bind(&user_id)
    .bind(&stytch_user_id)
    .bind(format!("{user_id}@test.local"))
    .bind("Test User")
    .execute(pool)
    .await
    .expect("seed user");

    sqlx::query("INSERT INTO workspaces (id, user_id, name) VALUES ($1, $2, $3)")
        .bind(&workspace_id)
        .bind(&user_id)
        .bind("Test Workspace")
        .execute(pool)
        .await
        .expect("seed account");

    (user_id, workspace_id)
}
