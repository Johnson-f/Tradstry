use anyhow::{Context, Result};
use sqlx::PgPool;

/// Replay the archived SQLx history for adoption tests.
pub async fn migrate(pool: &PgPool) -> Result<()> {
    sqlx::migrate!("../schema/archive/sqlx")
        .run(pool)
        .await
        .context("Archived SQLx migration replay failed")?;
    Ok(())
}
