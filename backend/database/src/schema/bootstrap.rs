use anyhow::{Context, Result, bail};
use sea_orm::{ConnectionTrait, DatabaseConnection, SqlxPostgresConnector};
use sqlx::PgPool;
use tradstry_migration::{Migrator, MigratorTrait};

use super::{contract, pg};

pub async fn bootstrap(pool: &PgPool, schema: &str) -> Result<DatabaseConnection> {
    if pool.options().get_max_connections() < 2 {
        bail!("DB_MAX_CONNECTIONS must be at least 2 for schema bootstrap");
    }

    let db = SqlxPostgresConnector::from_sqlx_postgres_pool(pool.clone());
    let lock_key = format!("tradstry:schema:{schema}");
    let mut lock_connection = pool
        .acquire()
        .await
        .context("acquire schema lock connection")?;
    sqlx::query("SELECT pg_advisory_lock(hashtextextended($1, 0))")
        .bind(&lock_key)
        .execute(&mut *lock_connection)
        .await
        .context("acquire schema advisory lock")?;

    let result = bootstrap_locked(pool, &db).await;
    let unlock = sqlx::query("SELECT pg_advisory_unlock(hashtextextended($1, 0))")
        .bind(&lock_key)
        .execute(&mut *lock_connection)
        .await;
    if let Err(error) = unlock {
        lock_connection.close().await.ok();
        return Err(error).context("release schema advisory lock");
    }
    result?;
    Ok(db)
}

async fn bootstrap_locked(pool: &PgPool, db: &DatabaseConnection) -> Result<()> {
    ensure_extensions(db).await?;
    finish_sqlx_migrations(pool).await?;
    let managed_tables = contract::managed_table_names()?;
    let existing_before = existing_managed_table_count(pool, &managed_tables).await?;
    if existing_before == 0 {
        db.get_schema_registry("tradstry_database::entities::*")
            .sync(db)
            .await
            .context("SeaORM entity schema sync failed")?;
        prepare_fresh_adoption_compatibility(db).await?;
        Migrator::up(db, None)
            .await
            .context("SeaORM migrations failed")?;
    } else {
        if existing_before < managed_tables.len() && !has_migration_history(pool).await? {
            bail!(
                "partial unmanaged schema: found {existing_before} of {} tables",
                managed_tables.len()
            );
        }
        Migrator::up(db, None)
            .await
            .context("SeaORM migrations failed")?;
        validate_schema_state(pool, &managed_tables).await?;
    }
    contract::verify(db).await
}

pub async fn prepare_fresh_adoption_compatibility(db: &DatabaseConnection) -> Result<()> {
    // The released adoption migration replaces generated indexes. Reinstall these
    // new composite ownership constraints in the journal migration after adoption.
    db.execute_unprepared(
        "DO $journal_compat$ DECLARE item record; BEGIN
           FOR item IN
             SELECT c.conrelid::regclass AS table_name, c.conname
             FROM pg_constraint c JOIN pg_class i ON i.oid=c.conindid
             JOIN pg_namespace n ON n.oid=i.relnamespace
             WHERE c.contype='f' AND n.nspname=current_schema()
               AND i.relname LIKE 'idx-%'
               AND c.conrelid IN (
                 'journal_workspace_state'::regclass,'journal_projection_jobs'::regclass,
                 'brokerage_transaction_versions'::regclass,'journal_mutations'::regclass,
                 'journal_grouping_operations'::regclass,'journal_grouping_suggestions'::regclass,
                 'journal_grouping_feedback'::regclass,'journal_trade_context'::regclass,
                 'journal_trade_context_events'::regclass,'journal_review_sessions'::regclass,
                 'journal_trade_reviews'::regclass,'journal_review_drafts'::regclass,'journal_changes'::regclass)
           LOOP EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',item.table_name,item.conname);
           END LOOP;
         END $journal_compat$;",
    )
    .await
    .context("prepare generated journal ownership indexes for adoption")?;
    db.execute_unprepared(
        "ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS lane text NOT NULL DEFAULT 'deep';
         ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'queued';
         CREATE TABLE IF NOT EXISTS agent_checkpoints (
             id text PRIMARY KEY,
             run_id text NOT NULL,
             user_id text NOT NULL,
             workspace_id text NOT NULL,
             stage text NOT NULL,
             sequence bigint NOT NULL,
             state_json jsonb NOT NULL,
             created_at timestamptz NOT NULL,
             updated_at timestamptz NOT NULL
         );
         CREATE TABLE IF NOT EXISTS notebook_images (
             id text PRIMARY KEY,
             note_id text NOT NULL,
             user_id text NOT NULL,
             workspace_id text NOT NULL,
             cloudinary_asset_id text NOT NULL DEFAULT '',
             cloudinary_public_id text NOT NULL DEFAULT '',
             secure_url text NOT NULL DEFAULT '',
             width bigint NOT NULL DEFAULT 0,
             height bigint NOT NULL DEFAULT 0,
             format text NOT NULL DEFAULT '',
             bytes bigint NOT NULL DEFAULT 0,
             original_filename text NOT NULL DEFAULT '',
             media_type text NOT NULL DEFAULT 'image',
             content_type text NOT NULL DEFAULT '',
             duration_seconds double precision NOT NULL DEFAULT 0,
             created_at timestamptz NOT NULL DEFAULT now(),
             content_hash text NOT NULL DEFAULT ''
         );",
    )
    .await
    .context("prepare fresh schema for adoption baseline migration")?;
    Ok(())
}

async fn ensure_extensions(db: &DatabaseConnection) -> Result<()> {
    db.execute_unprepared(
        "CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public; \
         CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public; \
         DO $extensions$ \
         BEGIN \
             IF EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace \
                        WHERE e.extname = 'pg_trgm' AND n.nspname <> 'public') THEN \
                 ALTER EXTENSION pg_trgm SET SCHEMA public; \
             END IF; \
             IF EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace \
                        WHERE e.extname = 'vector' AND n.nspname <> 'public') THEN \
                 ALTER EXTENSION vector SET SCHEMA public; \
             END IF; \
         END \
         $extensions$;",
    )
    .await
    .context("install PostgreSQL extensions in public")?;
    Ok(())
}

async fn finish_sqlx_migrations(pool: &PgPool) -> Result<()> {
    let has_history: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables \
         WHERE table_schema = current_schema() AND table_name = '_sqlx_migrations')",
    )
    .fetch_one(pool)
    .await?;
    if has_history {
        pg::migrate(pool)
            .await
            .context("finish archived SQLx migrations before SeaORM adoption")?;
    }
    Ok(())
}

async fn existing_managed_table_count(pool: &PgPool, managed_tables: &[String]) -> Result<usize> {
    let existing: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM information_schema.tables \
         WHERE table_schema = current_schema() AND table_name = ANY($1)",
    )
    .bind(managed_tables)
    .fetch_one(pool)
    .await?;
    usize::try_from(existing).context("managed table count exceeds usize")
}

async fn has_migration_history(pool: &PgPool) -> Result<bool> {
    Ok(sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables \
         WHERE table_schema = current_schema() \
           AND table_name IN ('_sqlx_migrations', 'seaql_migrations'))",
    )
    .fetch_one(pool)
    .await?)
}

async fn validate_schema_state(pool: &PgPool, managed_tables: &[String]) -> Result<()> {
    let existing = existing_managed_table_count(pool, managed_tables).await?;
    if existing == managed_tables.len() {
        return Ok(());
    }
    bail!(
        "partial managed schema: found {} of {} tables",
        existing,
        managed_tables.len()
    )
}
