use std::time::Duration;

use anyhow::{Context, Result};
use sqlx::{PgPool, migrate::Migrator, postgres::PgPoolOptions};

pub static MIGRATOR: Migrator = sqlx::migrate!();

pub async fn connect(database_url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await
        .context("connect to Postgres (is DATABASE_URL right and the database up?)")?;
    MIGRATOR
        .run(&pool)
        .await
        .context("run database migrations")?;
    Ok(pool)
}

pub fn new_id() -> uuid::Uuid {
    uuid::Uuid::now_v7()
}
