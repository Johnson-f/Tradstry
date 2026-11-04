use std::time::Duration;

use anyhow::{Context, Result};
use sqlx::{
    PgPool,
    migrate::Migrator,
    postgres::{PgConnectOptions, PgPoolOptions},
};

pub static MIGRATOR: Migrator = sqlx::migrate!();

/// Connects with every session's `search_path` set to `schema`, so tables,
/// migrations and their history all live in it. The schema is created first
/// if it doesn't exist. `schema` must be a plain name; config checks it.
pub async fn connect(database_url: &str, schema: &str) -> Result<PgPool> {
    let options: PgConnectOptions = database_url
        .parse()
        .context("DATABASE_URL is not a Postgres URL")?;
    connect_with(options, schema).await
}

pub async fn connect_with(options: PgConnectOptions, schema: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(options.options([("search_path", schema)]))
        .await
        .context("connect to Postgres (is DATABASE_URL right and the database up?)")?;
    sqlx::raw_sql(sqlx::AssertSqlSafe(format!(
        "CREATE SCHEMA IF NOT EXISTS {schema}"
    )))
    .execute(&pool)
    .await
    .with_context(|| format!("create the {schema} schema"))?;
    MIGRATOR
        .run(&pool)
        .await
        .context("run database migrations")?;
    Ok(pool)
}

pub fn new_id() -> uuid::Uuid {
    uuid::Uuid::now_v7()
}
