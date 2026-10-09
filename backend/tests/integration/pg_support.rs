//! Shared Postgres helpers for the integration tests. Each test gets its own
//! database from [`TestDb`]; see `test_db.rs`.

use sqlx::PgPool;

pub use crate::test_db::TestDb;

/// Inserts a user and an account, returning `(user_id, workspace_id)`.
/// `notebook_notes` and `notebook_folders` both FK to these, so no notebook row
/// can exist without them.
#[allow(dead_code)]
pub async fn seed_user_workspace(pool: &PgPool) -> (String, String) {
    let user_id = tradstry_backend::ids::new_uuid_v7().to_string();
    let workspace_id = tradstry_backend::ids::new_uuid_v7().to_string();
    let clerk_uuid = tradstry_backend::ids::new_uuid_v7().to_string();

    sqlx::query("INSERT INTO users (id, clerk_uuid, email, full_name) VALUES ($1, $2, $3, $4)")
        .bind(&user_id)
        .bind(&clerk_uuid)
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
