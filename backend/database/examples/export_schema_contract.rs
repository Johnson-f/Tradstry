use std::str::FromStr;

use anyhow::{Context, Result};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, SqlxPostgresConnector, Statement};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, Executor};
use tradstry_migration::{Migrator, MigratorTrait};

const CONTRACT_QUERY: &str = include_str!("../../schema/postgres/contract_query.sql");

#[tokio::main]
async fn main() -> Result<()> {
    let url = std::env::var("TEST_DATABASE_URL")
        .context("TEST_DATABASE_URL must point to a disposable PostgreSQL database")?;
    let options = PgConnectOptions::from_str(&url)
        .context("parse TEST_DATABASE_URL")?
        .disable_statement_logging();
    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(options.clone())
        .await
        .context("connect contract export admin pool")?;
    let schema = format!(
        "contract_export_{}_{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_micros()
    );
    admin
        .execute(sqlx::AssertSqlSafe(format!("CREATE SCHEMA \"{schema}\"")))
        .await
        .context("create contract export schema")?;

    let result = export_contract(options, &schema).await;
    admin
        .execute(sqlx::AssertSqlSafe(format!(
            "DROP SCHEMA \"{schema}\" CASCADE"
        )))
        .await
        .context("drop contract export schema")?;
    admin.close().await;
    println!("{}", serde_json::to_string(&result?)?);
    Ok(())
}

async fn export_contract(options: PgConnectOptions, schema: &str) -> Result<serde_json::Value> {
    let _ = tradstry_database::schema::contract::managed_table_names()?;
    let search_path = format!("\"{schema}\", public");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .after_connect(move |connection, _| {
            let search_path = search_path.clone();
            Box::pin(async move {
                connection
                    .execute(sqlx::AssertSqlSafe(format!(
                        "SET search_path TO {search_path}"
                    )))
                    .await?;
                Ok(())
            })
        })
        .connect_with(options)
        .await
        .context("connect contract export pool")?;
    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    db.get_schema_registry("tradstry_database::entities::*")
        .sync(&db)
        .await
        .context("sync entity schema")?;
    tradstry_database::schema::prepare_fresh_adoption_compatibility(&db).await?;
    Migrator::up(&db, None).await.context("run migrations")?;
    let contract = read_contract(&db).await;
    pool.close().await;
    contract
}

async fn read_contract(db: &DatabaseConnection) -> Result<serde_json::Value> {
    let row = db
        .query_one_raw(Statement::from_string(DbBackend::Postgres, CONTRACT_QUERY))
        .await?
        .context("contract query returned no row")?;
    Ok(row.try_get("", "contract")?)
}
