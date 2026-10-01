//! Shared Postgres helpers for the integration tests.
//!
//! Every suite runs in one test binary against one database, and libtest runs
//! tests on parallel threads. A reader/writer lock keeps that safe: an ordinary
//! test holds it shared for its whole run, and a test that rebuilds the `public`
//! schema holds it exclusively, so no test ever sees the schema change under it.

use std::cell::{Cell, RefCell};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};

use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use tokio::sync::{OwnedRwLockReadGuard, OwnedRwLockWriteGuard, RwLock};

/// Whether `public` is on the current schema. A `reset_schema` test leaves it
/// archive-only or empty, so the next ordinary test must rebuild it first.
static SCHEMA_CURRENT: AtomicBool = AtomicBool::new(false);

thread_local! {
    // libtest gives each test its own thread, so the shared hold is released when
    // the test's thread exits, panics included.
    static SHARED: RefCell<Option<OwnedRwLockReadGuard<()>>> = const { RefCell::new(None) };
    static EXCLUSIVE: Cell<bool> = const { Cell::new(false) };
}

fn schema_lock() -> Arc<RwLock<()>> {
    static LOCK: OnceLock<Arc<RwLock<()>>> = OnceLock::new();
    LOCK.get_or_init(|| Arc::new(RwLock::new(()))).clone()
}

/// Connect to the test database, bring `public` to the current schema if a reset
/// left it stale, and hold the schema lock shared for the rest of the test.
pub async fn test_pool() -> PgPool {
    let url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| {
        "postgres://tradstry:tradstry@localhost:5435/tradstry_test".to_string()
    });
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&url)
        .await
        .expect("connect to test postgres (is the test database on port 5435 up?)");

    let already_held = EXCLUSIVE.get() || SHARED.with(|held| held.borrow().is_some());
    if !already_held {
        let shared = hold_current_schema(&pool).await;
        SHARED.with(|held| *held.borrow_mut() = Some(shared));
    }
    pool
}

async fn hold_current_schema(pool: &PgPool) -> OwnedRwLockReadGuard<()> {
    let shared = schema_lock().read_owned().await;
    if SCHEMA_CURRENT.load(Ordering::Acquire) {
        return shared;
    }
    drop(shared);
    let exclusive = schema_lock().write_owned().await;
    if !SCHEMA_CURRENT.load(Ordering::Acquire) {
        bring_to_current_schema(pool).await;
    }
    // Downgrading is atomic, so no reset can slip in before this test starts.
    exclusive.downgrade()
}

/// Archived SQLx history first, then the SeaORM bootstrap that adds every table
/// created since. The archive replay runs only before the first bootstrap: once
/// SeaORM owns the schema, replaying migration 1 against it fails. Bootstrap is
/// idempotent, so an archive-only, empty, or already-current `public` all end up
/// on the current schema. Call it only while holding the schema lock exclusively.
#[allow(dead_code)]
pub async fn bring_to_current_schema(pool: &PgPool) {
    if try_bring_to_current_schema(pool).await.is_err() {
        // A schema an older suite left half-built cannot be adopted; rebuild it.
        recreate_public(pool).await;
        try_bring_to_current_schema(pool)
            .await
            .expect("bootstrap rebuilt public schema");
    }
    SCHEMA_CURRENT.store(true, Ordering::Release);
}

async fn try_bring_to_current_schema(pool: &PgPool) -> anyhow::Result<()> {
    let bootstrapped: bool =
        sqlx::query_scalar("SELECT to_regclass('public.seaql_migrations') IS NOT NULL")
            .fetch_one(pool)
            .await?;
    if !bootstrapped {
        tradstry_backend::service::db::schema::pg::migrate(pool).await?;
    }
    tradstry_backend::service::db::schema::bootstrap(pool, "public").await?;
    Ok(())
}

async fn recreate_public(pool: &PgPool) {
    sqlx::query("DROP SCHEMA public CASCADE")
        .execute(pool)
        .await
        .expect("drop schema");
    sqlx::query("CREATE SCHEMA public")
        .execute(pool)
        .await
        .expect("create schema");
}

/// Exclusive hold on the schema lock, returned by [`reset_schema`]. Bind it for the
/// whole test (`let _guard = ...`).
#[allow(dead_code)]
pub struct SchemaGuard {
    _exclusive: OwnedRwLockWriteGuard<()>,
}

impl Drop for SchemaGuard {
    fn drop(&mut self) {
        EXCLUSIVE.set(false);
    }
}

/// Drop and recreate an empty `public` schema for a test that migrates it itself.
/// Waits for every other test to finish with the schema, and holds it exclusively
/// until the returned guard drops.
#[allow(dead_code)]
pub async fn reset_schema(pool: &PgPool) -> SchemaGuard {
    // Release this test's own shared hold, or the exclusive request waits on it.
    SHARED.with(|held| held.borrow_mut().take());
    let exclusive = schema_lock().write_owned().await;
    EXCLUSIVE.set(true);
    SCHEMA_CURRENT.store(false, Ordering::Release);
    recreate_public(pool).await;
    SchemaGuard {
        _exclusive: exclusive,
    }
}

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
