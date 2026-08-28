use anyhow::{Context, Result};
use sea_orm::{DatabaseConnection, SqlxPostgresConnector};
use sqlx::postgres::{PgConnectOptions, PgConnection, PgPoolOptions};
use sqlx::{ConnectOptions, Connection, Executor, PgPool, Postgres, Transaction};
use std::time::Duration;

use super::schema::bootstrap;

const DEFAULT_POOL_SIZE: u32 = 12;
const DEFAULT_POOL_MIN: u32 = 1;
const DEFAULT_ACQUIRE_TIMEOUT_SECS: u64 = 10;
const DEFAULT_SLOW_QUERY_MS: u64 = 250;

fn env_u32(name: &str, default: u32) -> Result<u32> {
    match std::env::var(name) {
        Ok(value) => value
            .parse::<u32>()
            .with_context(|| format!("{name} must be a positive integer")),
        Err(std::env::VarError::NotPresent) => Ok(default),
        Err(error) => Err(error).with_context(|| format!("failed to read {name}")),
    }
}

fn env_u64(name: &str, default: u64) -> Result<u64> {
    match std::env::var(name) {
        Ok(value) => value
            .parse::<u64>()
            .with_context(|| format!("{name} must be a positive integer")),
        Err(std::env::VarError::NotPresent) => Ok(default),
        Err(error) => Err(error).with_context(|| format!("failed to read {name}")),
    }
}

fn pool_session_options(schema: Option<&str>) -> Vec<(&'static str, String)> {
    let mut options = vec![("client_min_messages", "warning".to_string())];
    if let Some(schema) = schema {
        options.push(("search_path", format!("{schema},public")));
    }
    options
}

async fn ensure_schema(options: &PgConnectOptions, schema: Option<&str>) -> Result<()> {
    let Some(schema) = schema else {
        return Ok(());
    };
    let mut connection = PgConnection::connect_with(options)
        .await
        .context("Failed to connect for schema setup")?;
    connection
        .execute("SET client_min_messages = WARNING")
        .await
        .context("Failed to configure schema setup connection")?;
    connection
        .execute(sqlx::AssertSqlSafe(format!(
            "CREATE SCHEMA IF NOT EXISTS \"{schema}\""
        )))
        .await
        .context("Failed to create environment schema")?;
    connection
        .close()
        .await
        .context("Failed to close schema setup connection")?;
    Ok(())
}

/// Postgres-backed database client wrapping a shared `sqlx::PgPool`.
#[derive(Clone)]
pub struct Db {
    pool: PgPool,
    sea: DatabaseConnection,
}

/// User-scoped database access. Holds a pool handle plus the owning user id.
#[derive(Clone)]
pub struct UserDb {
    pool: PgPool,
    sea: DatabaseConnection,
    user_id: String,
}

impl UserDb {
    // Create new UserDb for a user.
    pub fn new(pool: PgPool, user_id: String) -> Self {
        let sea = sea_orm_connection(&pool);
        Self { pool, sea, user_id }
    }

    // Get the connection pool for issuing queries.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    // Get the user ID for this database.
    pub fn user_id(&self) -> &str {
        &self.user_id
    }

    pub fn connection(&self) -> &DatabaseConnection {
        &self.sea
    }
}

impl Db {
    /// Build the connection pool and finish SeaORM schema bootstrap.
    pub async fn new() -> Result<Self> {
        let url = std::env::var("POSTGRES_URL").context("POSTGRES_URL not set")?;
        let slow_query_ms = env_u64("DB_SLOW_QUERY_MS", DEFAULT_SLOW_QUERY_MS)?.max(1);
        let opts: PgConnectOptions = url
            .parse::<PgConnectOptions>()
            .context("Failed to parse POSTGRES_URL")?
            .log_statements(log::LevelFilter::Debug)
            .log_slow_statements(log::LevelFilter::Warn, Duration::from_millis(slow_query_ms));

        // Per-environment schema (POSTGRES_DATABASE -> tradstry_<env>). When set,
        // create it once, then set each pool connection's search_path at startup.
        let schema = super::config::env_schema()?;
        ensure_schema(&opts, schema.as_deref()).await?;
        let opts = opts.options(pool_session_options(schema.as_deref()));
        let max_connections = env_u32("DB_MAX_CONNECTIONS", DEFAULT_POOL_SIZE)?.max(1);
        let min_connections = env_u32("DB_MIN_CONNECTIONS", DEFAULT_POOL_MIN)?.min(max_connections);
        let acquire_timeout =
            env_u64("DB_ACQUIRE_TIMEOUT_SECS", DEFAULT_ACQUIRE_TIMEOUT_SECS)?.max(1);

        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .min_connections(min_connections)
            .acquire_timeout(Duration::from_secs(acquire_timeout))
            .idle_timeout(Duration::from_secs(600))
            .max_lifetime(Duration::from_secs(1_800))
            // PostgreSQL detects broken connections on the next operation.
            // Pinging every idle checkout adds a full network round trip to
            // otherwise fast indexed queries.
            .test_before_acquire(false)
            .before_acquire(|conn, meta| {
                Box::pin(async move {
                    if meta.idle_for > Duration::from_secs(60) {
                        conn.ping().await?;
                    }
                    Ok(true)
                })
            })
            .connect_with(opts)
            .await
            .context("Failed to connect to Postgres")?;

        let where_ = schema.unwrap_or_else(|| "public".into());
        let sea = bootstrap(&pool, &where_)
            .await
            .context("Schema bootstrap failed")?;
        log::info!(
            "Postgres pool established and schema migrated (schema={where_}, min={min_connections}, max={max_connections})"
        );

        Ok(Self { pool, sea })
    }

    /// Wrap an already-established pool. Skips env-driven setup and bootstrap, so
    /// the caller owns those — used by integration tests holding a migrated pool.
    pub fn from_pool(pool: PgPool) -> Self {
        let sea = sea_orm_connection(&pool);
        Self { pool, sea }
    }

    /// Borrow the connection pool. sqlx acquires/returns a connection per query.
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub fn connection(&self) -> &DatabaseConnection {
        &self.sea
    }

    /// Begin a transaction for atomic multi-statement writes.
    pub async fn begin(&self) -> Result<Transaction<'static, Postgres>> {
        self.pool
            .begin()
            .await
            .context("Failed to begin transaction")
    }

    /// Get a user-specific database handle.
    pub fn get_user_db(&self, user_id: &str) -> UserDb {
        UserDb::new(self.pool.clone(), user_id.to_string())
    }

    /// Perform a database health check.
    pub async fn health_check(&self) -> Result<()> {
        sqlx::query("SELECT 1").execute(&self.pool).await?;
        Ok(())
    }
}

pub fn sea_orm_connection(pool: &PgPool) -> DatabaseConnection {
    SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone())
}

#[cfg(test)]
mod tests {
    use super::pool_session_options;

    #[test]
    fn pool_session_options_are_session_only() {
        assert_eq!(
            pool_session_options(Some("tradstry_dev")),
            vec![
                ("client_min_messages", "warning".to_string()),
                ("search_path", "tradstry_dev,public".to_string()),
            ]
        );
        assert_eq!(
            pool_session_options(None),
            vec![("client_min_messages", "warning".to_string())]
        );
    }
}
