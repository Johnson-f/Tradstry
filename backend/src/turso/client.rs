use anyhow::{Context, Result};
use libsql::{Connection, Database, Builder};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use log::{info, warn, error};

use super::config::TursoConfig;
use super::schema::{
    SchemaVersion, TableSchema, ColumnInfo,
    initialize_user_database_schema,
    get_current_schema_version,
    get_expected_schema,
    initialize_schema_version_table,
    update_schema_version,
    get_current_tables,
    create_table,
    update_table_schema,
    ensure_indexes,
    ensure_triggers,
};

/// Turso client for managing user databases
pub struct TursoClient {
    config: TursoConfig,
    registry_db: Database,
    http_client: Client,
}

/// User database registry entry
#[derive(Debug, Serialize, Deserialize)]
pub struct UserDatabaseEntry {
    pub user_id: String,
    pub email: String,
    pub db_name: String,
    pub db_url: String,
    pub db_token: String,
    pub storage_used_bytes: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

/// Turso API response for database creation
#[derive(Debug, Serialize, Deserialize)]
pub struct TursoCreateDbResponse {
    pub database: TursoDatabaseInfo,
}

/// Turso database information
#[derive(Debug, Serialize, Deserialize)]
pub struct TursoDatabaseInfo {
    #[serde(rename = "Name")]
    #[allow(dead_code)]
    pub name: String,
    #[serde(rename = "Hostname")]
    pub hostname: String,
    #[serde(rename = "primaryRegion")]
    #[allow(dead_code)]
    pub primary_region: String,
}

/// Turso API response for token creation
#[derive(Debug, Deserialize)]
pub struct TursoTokenResponse {
    pub jwt: String,
}

// Schema types are now defined in super::schema

impl TursoClient {
    /// Create a new Turso client
    pub async fn new(config: TursoConfig) -> Result<Self> {
        // Connect to the central registry database
        let registry_db = Builder::new_remote(
            config.registry_db_url.clone(),
            config.registry_db_token.clone(),
        )
        .build()
        .await
        .context("Failed to connect to registry database")?;

        let http_client = Client::new();

        // Added this
        // Run registry database migration
        let conn = registry_db
            .connect()
            .context("Failed to get registry database connection for migration")?;
        
        // Add storage_used_bytes column if it doesn't exist
        conn.execute(
            "ALTER TABLE user_databases ADD COLUMN storage_used_bytes INTEGER DEFAULT 0",
            libsql::params![],
        ).await.ok(); // Ignore error if column already exists
        
        info!("Registry database migration completed");

        Ok(Self {
            config,
            registry_db,
            http_client,
        })
    }

    /// Get a connection to the registry database
    pub async fn get_registry_connection(&self) -> Result<Connection> {
        self.registry_db
            .connect()
            .context("Failed to get registry database connection")
    }

    /// Create a new user database in Turso
    pub async fn create_user_database(&self, user_id: &str, email: &str) -> Result<UserDatabaseEntry> {
        info!("Creating database for user: {}", user_id);

        // Create database name (sanitize user_id for Turso requirements)
        // Turso requires: numbers, lowercase letters, and dashes only
        let sanitized_id = user_id
            .to_lowercase()           // Convert to lowercase
            .replace("_", "-");        // Replace underscores with dashes
        let db_name = format!("user-{}", sanitized_id);

        info!("Generated database name: {}", db_name);

        // Create database via Turso API
        let db_info = self.create_database_via_api(&db_name).await?;

        // Create auth token for the database
        let token = self.create_database_token(&db_name).await?;

        // Construct the database URL
        let db_url = format!("libsql://{}", db_info.hostname);

        // Initialize the database schema
        initialize_user_database_schema(&db_url, &token).await?;

        // Create user database entry
        let user_db_entry = UserDatabaseEntry {
            user_id: user_id.to_string(),
            email: email.to_string(),
            db_name: db_name.clone(),
            db_url: db_url.clone(),
            db_token: token,
            storage_used_bytes: Some(0), // Initialize to 0 for new databases
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        };

        // Store in registry
        self.store_user_database_entry(&user_db_entry).await?;

        info!("Successfully created database {} for user {}", db_name, user_id);
        Ok(user_db_entry)
    }

    /// Create database via Turso API
    async fn create_database_via_api(&self, db_name: &str) -> Result<TursoDatabaseInfo> {
        let url = format!("https://api.turso.tech/v1/organizations/{}/databases", self.config.turso_org);

        let mut payload = HashMap::new();
        payload.insert("name", db_name);
        payload.insert("group", "users-group"); // Use users-group for user databases

        let response = self.http_client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.turso_api_token))
            .json(&payload)
            .send()
            .await
            .context("Failed to send database creation request")?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();

            // Check if the error is because database already exists
            if error_text.contains("already exists") {
                info!("Database {} already exists, fetching existing info", db_name);
                return self.get_existing_database_info(db_name).await;
            }

            anyhow::bail!("Failed to create database: {}", error_text);
        }

        let create_response: TursoCreateDbResponse = response
            .json()
            .await
            .context("Failed to parse database creation response")?;

        Ok(create_response.database)
    }

    /// Get existing database info from Turso API
    async fn get_existing_database_info(&self, db_name: &str) -> Result<TursoDatabaseInfo> {
        let url = format!(
            "https://api.turso.tech/v1/organizations/{}/databases/{}",
            self.config.turso_org, db_name
        );

        let response = self.http_client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.config.turso_api_token))
            .send()
            .await
            .context("Failed to get existing database info")?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to get existing database info: {}", error_text);
        }

        #[derive(Deserialize)]
        struct GetDbResponse {
            database: TursoDatabaseInfo,
        }

        let db_response: GetDbResponse = response
            .json()
            .await
            .context("Failed to parse existing database response")?;

        Ok(db_response.database)
    }

    /// Create a database token for the given database
    pub async fn create_database_token(&self, db_name: &str) -> Result<String> {
        let url = format!(
            "https://api.turso.tech/v1/organizations/{}/databases/{}/auth/tokens",
            self.config.turso_org, db_name
        );

        let mut payload = HashMap::new();
        payload.insert("expiration", "never");
        payload.insert("authorization", "full-access");

        let response = self.http_client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.turso_api_token))
            .json(&payload)
            .send()
            .await
            .context("Failed to create database token")?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            anyhow::bail!("Failed to create database token: {}", error_text);
        }

        let token_response: TursoTokenResponse = response
            .json()
            .await
            .context("Failed to parse token response")?;

        Ok(token_response.jwt)
    }

    /// Initialize user database with trading schema
    /// Creates the stocks table and other necessary tables for the trading journal
    #[allow(dead_code)]
    async fn initialize_user_database_schema(&self, db_url: &str, token: &str) -> Result<()> {
        initialize_user_database_schema(db_url, token).await
    }


    /// Store user database entry in registry
    async fn store_user_database_entry(&self, entry: &UserDatabaseEntry) -> Result<()> {
        let conn = self.get_registry_connection().await?;

        conn.execute(
            "INSERT OR REPLACE INTO user_databases
             (user_id, email, db_name, db_url, db_token, storage_used_bytes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            libsql::params![
                entry.user_id.as_str(),
                entry.email.as_str(),
                entry.db_name.as_str(),
                entry.db_url.as_str(),
                entry.db_token.as_str(),
                entry.storage_used_bytes.unwrap_or(0),
                entry.created_at.as_str(),
                entry.updated_at.as_str(),
            ],
        ).await.context("Failed to store user database entry")?;

        Ok(())
    }

    /// Get user database entry by user ID
    pub async fn get_user_database(&self, user_id: &str) -> Result<Option<UserDatabaseEntry>> {
        let conn = self.get_registry_connection().await?;

        let mut rows = conn
            .prepare("SELECT user_id, email, db_name, db_url, db_token, storage_used_bytes, created_at, updated_at FROM user_databases WHERE user_id = ?")
            .await
            .context("Failed to prepare query")?
            .query(libsql::params![user_id.to_string()])
            .await
            .context("Failed to execute query")?;

        if let Some(row) = rows.next().await? {
            let entry = UserDatabaseEntry {
                user_id: row.get(0)?,
                email: row.get(1)?,
                db_name: row.get(2)?,
                db_url: row.get(3)?,
                db_token: row.get(4)?,
                storage_used_bytes: row.get::<Option<i64>>(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            };
            Ok(Some(entry))
        } else {
            Ok(None)
        }
    }

    /// Get user database connection
    pub async fn get_user_database_connection(&self, user_id: &str) -> Result<Option<Connection>> {
        if let Some(entry) = self.get_user_database(user_id).await? {
            let user_db = Builder::new_remote(entry.db_url, entry.db_token)
                .build()
                .await
                .context("Failed to connect to user database")?;

            let conn = user_db.connect().context("Failed to get user database connection")?;
            Ok(Some(conn))
        } else {
            Ok(None)
        }
    }

    /// Delete a user database via Turso API
    pub async fn delete_user_database(&self, db_name: &str) -> Result<()> {
        info!("Deleting Turso database: {}", db_name);

        let url = format!(
            "https://api.turso.tech/v1/organizations/{}/databases/{}",
            self.config.turso_org, db_name
        );

        let response = self.http_client
            .delete(&url)
            .header("Authorization", format!("Bearer {}", self.config.turso_api_token))
            .send()
            .await
            .context("Failed to send database deletion request")?;

        let status = response.status();
        if !status.is_success() {
            let error_text = response.text().await.unwrap_or_default();
            
            // If database doesn't exist, consider it a success (idempotent)
            if error_text.contains("not found") || status == 404 {
                info!("Database {} does not exist (already deleted?)", db_name);
                return Ok(());
            }

            anyhow::bail!("Failed to delete database: {} - {}", status, error_text);
        }

        info!("Successfully deleted Turso database: {}", db_name);
        Ok(())
    }

    /// Remove user database entry from registry
    pub async fn remove_user_database_entry(&self, user_id: &str) -> Result<()> {
        info!("Removing user database entry from registry: {}", user_id);

        let conn = self.get_registry_connection().await?;

        conn.execute(
            "DELETE FROM user_databases WHERE user_id = ?",
            libsql::params![user_id],
        ).await
        .context("Failed to remove user database entry from registry")?;

        info!("Successfully removed user database entry from registry: {}", user_id);
        Ok(())
    }

    /// Health check for registry database
    pub async fn health_check(&self) -> Result<()> {
        let conn = self.get_registry_connection().await?;
        conn.execute("SELECT 1", libsql::params![]).await?;
        Ok(())
    }



    /// Get current schema version from user database
    pub async fn get_user_schema_version(&self, user_id: &str) -> Result<Option<SchemaVersion>> {
        if let Some(conn) = self.get_user_database_connection(user_id).await? {
            // Check if schema_version table exists
            let mut rows = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
                .await
                .context("Failed to check schema_version table")?
                .query(libsql::params![])
                .await
                .context("Failed to execute schema_version check")?;

            if rows.next().await?.is_none() {
                return Ok(None); // No schema version table, means old schema
            }

            // Get the latest schema version
            let mut rows = conn
                .prepare("SELECT version, description, created_at FROM schema_version ORDER BY created_at DESC LIMIT 1")
                .await
                .context("Failed to prepare schema version query")?
                .query(libsql::params![])
                .await
                .context("Failed to execute schema version query")?;

            if let Some(row) = rows.next().await? {
                Ok(Some(SchemaVersion {
                    version: row.get(0)?,
                    description: row.get(1)?,
                    created_at: row.get(2)?,
                }))
            } else {
                Ok(None)
            }
        } else {
            Ok(None)
        }
    }

    /// Synchronize user database schema with current application schema
    pub async fn sync_user_database_schema(&self, user_id: &str) -> Result<()> {
        info!("Starting schema synchronization for user: {}", user_id);

        if let Some(conn) = self.get_user_database_connection(user_id).await? {
            let current_version = self.get_user_schema_version(user_id).await?;
            let expected_version = get_current_schema_version();
            let expected_schema = get_expected_schema();

            // If no version exists, this is a new database or very old one
            if current_version.is_none() {
                info!("No schema version found, initializing with current schema");
                initialize_schema_version_table(&conn).await?;
                self.apply_schema_migrations(&conn, &expected_schema).await?;
                update_schema_version(&conn, &expected_version).await?;
                return Ok(());
            }

            let current_version = current_version.unwrap();

            // Compare versions
            if current_version.version != expected_version.version {
                info!("Schema version mismatch: current={}, expected={}",
                      current_version.version, expected_version.version);

                // Apply schema migrations
                self.apply_schema_migrations(&conn, &expected_schema).await?;
                update_schema_version(&conn, &expected_version).await?;

                info!("Schema synchronized successfully for user: {}", user_id);
            } else {
                info!("Schema is up to date for user: {}", user_id);
            }
        } else {
            anyhow::bail!("Could not get database connection for user: {}", user_id);
        }

        Ok(())
    }

    /// Initialize the schema version table
    #[allow(dead_code)]
    async fn initialize_schema_version_table(&self, conn: &Connection) -> Result<()> { initialize_schema_version_table(conn).await }

    /// Update schema version in the database
    #[allow(dead_code)]
    async fn update_schema_version(&self, conn: &Connection, version: &SchemaVersion) -> Result<()> { update_schema_version(conn, version).await }

    /// Apply schema migrations to bring database up to current schema
    /// This function makes schema.rs the source of truth - it will drop any tables
    /// that exist in the database but are not in the expected schema
    #[allow(dead_code)]
    async fn apply_schema_migrations(&self, conn: &Connection, expected_schema: &[TableSchema]) -> Result<()> {
        info!("Applying schema migrations");
        
        // Get list of expected table names (source of truth)
        let expected_table_names: std::collections::HashSet<String> = expected_schema
            .iter()
            .map(|s| s.name.clone())
            .collect();
        
        // Also include system tables that should never be dropped
        let protected_tables: std::collections::HashSet<String> = [
            "schema_version".to_string(),
            "sqlite_sequence".to_string(), // SQLite internal table
        ].iter().cloned().collect();
        
        // Get current tables in database
        let current_tables = get_current_tables(conn).await?;
        
        // Drop tables that exist in database but are not in expected schema
        // Temporarily disable foreign key constraints to allow dropping tables with dependencies
        conn.execute("PRAGMA foreign_keys = OFF", libsql::params![]).await?;
        
        for table_name in &current_tables {
            if !expected_table_names.contains(table_name) && !protected_tables.contains(table_name) {
                info!("Dropping table '{}' - not in expected schema (schema.rs is source of truth)", table_name);
                
                // Drop all indexes for this table first
                let mut index_rows = conn
                    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=? AND name NOT LIKE 'sqlite_autoindex_%'")
                    .await?
                    .query(libsql::params![table_name.clone()])
                    .await?;
                
                while let Some(index_row) = index_rows.next().await? {
                    let index_name: String = index_row.get(0)?;
                    info!("Dropping index '{}' for table '{}'", index_name, table_name);
                    if let Err(e) = conn.execute(&format!("DROP INDEX IF EXISTS {}", index_name), libsql::params![]).await {
                        warn!("Failed to drop index '{}': {}", index_name, e);
                    }
                }
                
                // Drop all triggers for this table
                let mut trigger_rows = conn
                    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=?")
                    .await?
                    .query(libsql::params![table_name.clone()])
                    .await?;
                
                while let Some(trigger_row) = trigger_rows.next().await? {
                    let trigger_name: String = trigger_row.get(0)?;
                    info!("Dropping trigger '{}' for table '{}'", trigger_name, table_name);
                    if let Err(e) = conn.execute(&format!("DROP TRIGGER IF EXISTS {}", trigger_name), libsql::params![]).await {
                        warn!("Failed to drop trigger '{}': {}", trigger_name, e);
                    }
                }
                
                // Finally, drop the table
                if let Err(e) = conn.execute(&format!("DROP TABLE IF EXISTS {}", table_name), libsql::params![]).await {
                    error!("Failed to drop table '{}': {}", table_name, e);
                } else {
                    info!("Successfully dropped table '{}'", table_name);
                }
            }
        }
        
        // Re-enable foreign key constraints
        conn.execute("PRAGMA foreign_keys = ON", libsql::params![]).await?;
        
        // Create or update expected tables
        for table_schema in expected_schema {
            if !current_tables.contains(&table_schema.name) {
                info!("Creating missing table: {}", table_schema.name);
                create_table(conn, table_schema).await?;
            } else {
                info!("Checking table schema for: {}", table_schema.name);
                update_table_schema(conn, table_schema).await?;
            }
        }
        
        // Ensure indexes and triggers for all expected tables
        for table_schema in expected_schema {
            ensure_indexes(conn, table_schema).await?;
            ensure_triggers(conn, table_schema).await?;
        }
        
        info!("Schema migrations completed - database now matches schema.rs (source of truth)");
        Ok(())
    }

    /// Get list of current tables in the database
    #[allow(dead_code)]
    async fn get_current_tables(&self, conn: &Connection) -> Result<Vec<String>> { get_current_tables(conn).await }

    /// Create a table based on schema definition
    #[allow(dead_code)]
    async fn create_table(&self, conn: &Connection, table_schema: &TableSchema) -> Result<()> { create_table(conn, table_schema).await }

    /// Update table schema if needed
    #[allow(dead_code)]
    async fn update_table_schema(&self, conn: &Connection, table_schema: &TableSchema) -> Result<()> { update_table_schema(conn, table_schema).await }

    /// Get current columns for a table
    #[allow(dead_code)]
    async fn get_table_columns(&self, conn: &Connection, table_name: &str) -> Result<Vec<ColumnInfo>> { super::schema::get_table_columns(conn, table_name).await }

    /// Ensure indexes exist for a table
    #[allow(dead_code)]
    async fn ensure_indexes(&self, conn: &Connection, table_schema: &TableSchema) -> Result<()> { ensure_indexes(conn, table_schema).await }

    /// Ensure triggers exist for a table
    #[allow(dead_code)]
    async fn ensure_triggers(&self, conn: &Connection, table_schema: &TableSchema) -> Result<()> { ensure_triggers(conn, table_schema).await }
}

impl TursoClient {
    /// Public helper to be called by the auth/init flow: ensures the user's DB schema
    /// is up-to-date with the application schema definition. This will add missing
    /// columns like `stocks.version` or attempt to remove deprecated columns.
    pub async fn ensure_user_schema_on_login(&self, user_id: &str) -> Result<()> {
        info!("Ensuring user schema is up to date for {}", user_id);
        self.sync_user_database_schema(user_id).await
    }
}
