use anyhow::{Context, Result};
use libsql::{Connection, Database, Builder};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use log::{info, error};

use super::config::TursoConfig;

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

/// Schema version information
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SchemaVersion {
    pub version: String,
    pub description: String,
    pub created_at: String,
}

/// Table schema information for comparison
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableSchema {
    pub name: String,
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<IndexInfo>,
    pub triggers: Vec<TriggerInfo>,
}

/// Column information for schema comparison
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub default_value: Option<String>,
    pub is_primary_key: bool,
}

/// Index information for schema comparison
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IndexInfo {
    pub name: String,
    pub table_name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
}

/// Trigger information for schema comparison
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriggerInfo {
    pub name: String,
    pub table_name: String,
    pub event: String,
    pub timing: String,
    pub action: String,
}

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
        self.initialize_user_database_schema(&db_url, &token).await?;
        
        // Create user database entry
        let user_db_entry = UserDatabaseEntry {
            user_id: user_id.to_string(),
            email: email.to_string(),
            db_name: db_name.clone(),
            db_url: db_url.clone(),
            db_token: token,
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
    async fn initialize_user_database_schema(&self, db_url: &str, token: &str) -> Result<()> {
        info!("Initializing trading schema for database: {}", db_url);

        let user_db = Builder::new_remote(db_url.to_string(), token.to_string())
            .build()
            .await
            .context("Failed to connect to user database")?;

        let conn = user_db.connect().context("Failed to get user database connection")?;

        // Create the stocks table based on the Stock model schema
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS stocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
                order_type TEXT NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT')),
                entry_price DECIMAL(15,8) NOT NULL,
                exit_price DECIMAL(15,8),
                stop_loss DECIMAL(15,8) NOT NULL,
                commissions DECIMAL(10,4) NOT NULL DEFAULT 0.00,
                number_shares DECIMAL(15,8) NOT NULL,
                take_profit DECIMAL(15,8),
                entry_date TIMESTAMP NOT NULL,
                exit_date TIMESTAMP,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#,
            libsql::params![],
        ).await.context("Failed to create stocks table")?;

        // Create indexes for better query performance
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol)",
            libsql::params![],
        ).await.context("Failed to create symbol index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_stocks_trade_type ON stocks(trade_type)",
            libsql::params![],
        ).await.context("Failed to create trade_type index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_stocks_entry_date ON stocks(entry_date)",
            libsql::params![],
        ).await.context("Failed to create entry_date index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_stocks_exit_date ON stocks(exit_date)",
            libsql::params![],
        ).await.context("Failed to create exit_date index")?;

        // Create user profile table for user settings and preferences
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                display_name TEXT,
                timezone TEXT DEFAULT 'UTC',
                currency TEXT DEFAULT 'USD',
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#,
            libsql::params![],
        ).await.context("Failed to create user_profile table")?;

        // Create options table for options trading
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS options (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                strategy_type TEXT NOT NULL,
                trade_direction TEXT NOT NULL CHECK (trade_direction IN ('Bullish', 'Bearish', 'Neutral')),
                number_of_contracts INTEGER NOT NULL CHECK (number_of_contracts > 0),
                option_type TEXT NOT NULL CHECK (option_type IN ('Call', 'Put')),
                strike_price DECIMAL(15,8) NOT NULL,
                expiration_date TIMESTAMP NOT NULL,
                entry_price DECIMAL(15,8) NOT NULL,
                exit_price DECIMAL(15,8),
                total_premium DECIMAL(15,8) NOT NULL,
                commissions DECIMAL(10,4) NOT NULL DEFAULT 0.00,
                implied_volatility DECIMAL(8,4) NOT NULL,
                entry_date TIMESTAMP NOT NULL,
                exit_date TIMESTAMP,
                status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#,
            libsql::params![],
        ).await.context("Failed to create options table")?;

        // Create indexes for options table for better query performance
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_options_symbol ON options(symbol)",
            libsql::params![],
        ).await.context("Failed to create options symbol index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_options_strategy_type ON options(strategy_type)",
            libsql::params![],
        ).await.context("Failed to create options strategy_type index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_options_trade_direction ON options(trade_direction)",
            libsql::params![],
        ).await.context("Failed to create options trade_direction index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_options_option_type ON options(option_type)",
            libsql::params![],
        ).await.context("Failed to create options option_type index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_options_status ON options(status)",
            libsql::params![],
        ).await.context("Failed to create options status index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_options_entry_date ON options(entry_date)",
            libsql::params![],
        ).await.context("Failed to create options entry_date index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_options_exit_date ON options(exit_date)",
            libsql::params![],
        ).await.context("Failed to create options exit_date index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_options_expiration_date ON options(expiration_date)",
            libsql::params![],
        ).await.context("Failed to create options expiration_date index")?;

        // Create trade notes table
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS trade_notes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                content TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            "#,
            libsql::params![],
        ).await.context("Failed to create trade_notes table")?;

        // Create indexes for trade_notes table for better query performance
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_trade_notes_updated_at ON trade_notes(updated_at)",
            libsql::params![],
        ).await.context("Failed to create trade_notes updated_at index")?;

        // Create trade tags table for categorizing trades
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS trade_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT,
                description TEXT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            "#,
            libsql::params![],
        ).await.context("Failed to create trade_tags table")?;

        // Create trigger to update the updated_at timestamp on stocks table
        conn.execute(
            r#"
            CREATE TRIGGER IF NOT EXISTS update_stocks_timestamp 
            AFTER UPDATE ON stocks 
            FOR EACH ROW 
            BEGIN 
                UPDATE stocks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; 
            END
            "#,
            libsql::params![],
        ).await.context("Failed to create update trigger for stocks")?;

        // Create trigger to update the updated_at timestamp on options table
        conn.execute(
            r#"
            CREATE TRIGGER IF NOT EXISTS update_options_timestamp 
            AFTER UPDATE ON options 
            FOR EACH ROW 
            BEGIN 
                UPDATE options SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; 
            END
            "#,
            libsql::params![],
        ).await.context("Failed to create update trigger for options")?;

        // Create trigger to update the updated_at timestamp on user_profile table
        conn.execute(
            r#"
            CREATE TRIGGER IF NOT EXISTS update_user_profile_timestamp 
            AFTER UPDATE ON user_profile 
            FOR EACH ROW 
            BEGIN 
                UPDATE user_profile SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; 
            END
            "#,
            libsql::params![],
        ).await.context("Failed to create update trigger for user_profile")?;

        // Create trigger to update the updated_at timestamp on trade_notes table
        conn.execute(
            r#"
            CREATE TRIGGER IF NOT EXISTS update_trade_notes_timestamp 
            AFTER UPDATE ON trade_notes 
            FOR EACH ROW 
            BEGIN 
                UPDATE trade_notes SET updated_at = datetime('now') WHERE id = NEW.id; 
            END
            "#,
            libsql::params![],
        ).await.context("Failed to create update trigger for trade_notes")?;

        // Create images table for image uploads associated with trade notes
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                trade_note_id TEXT NOT NULL,
                uploadcare_file_id TEXT NOT NULL UNIQUE,
                original_filename TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                width INTEGER,
                height INTEGER,
                alt_text TEXT,
                caption TEXT,
                position_in_note INTEGER,
                is_deleted BOOLEAN NOT NULL DEFAULT false,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            "#,
            libsql::params![],
        ).await.context("Failed to create images table")?;

        // Create indexes for images table for better query performance
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_images_trade_note_id ON images(trade_note_id)",
            libsql::params![],
        ).await.context("Failed to create images trade_note_id index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_images_uploadcare_file_id ON images(uploadcare_file_id)",
            libsql::params![],
        ).await.context("Failed to create images uploadcare_file_id index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_images_is_deleted ON images(is_deleted)",
            libsql::params![],
        ).await.context("Failed to create images is_deleted index")?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_images_position ON images(trade_note_id, position_in_note)",
            libsql::params![],
        ).await.context("Failed to create images position index")?;

        // Create trigger to update the updated_at timestamp on images table
        conn.execute(
            r#"
            CREATE TRIGGER IF NOT EXISTS update_images_timestamp 
            AFTER UPDATE ON images 
            FOR EACH ROW 
            BEGIN 
                UPDATE images SET updated_at = datetime('now') WHERE id = NEW.id; 
            END
            "#,
            libsql::params![],
        ).await.context("Failed to create update trigger for images")?;

        // Create schema version table to track schema versions
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS schema_version (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            "#,
            libsql::params![],
        ).await.context("Failed to create schema_version table")?;

        // Insert initial schema version
        let current_version = Self::get_current_schema_version();
        conn.execute(
            "INSERT INTO schema_version (version, description, created_at) VALUES (?, ?, ?)",
            libsql::params![current_version.version, current_version.description, current_version.created_at],
        ).await.context("Failed to insert initial schema version")?;

        info!("Trading schema initialized successfully with stocks, options, trade_notes, tags tables, and schema version tracking");
        Ok(())
    }

    /// Store user database entry in registry
    async fn store_user_database_entry(&self, entry: &UserDatabaseEntry) -> Result<()> {
        let conn = self.get_registry_connection().await?;

        conn.execute(
            "INSERT OR REPLACE INTO user_databases 
             (user_id, email, db_name, db_url, db_token, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            libsql::params![
                entry.user_id.as_str(),
                entry.email.as_str(),
                entry.db_name.as_str(),
                entry.db_url.as_str(),
                entry.db_token.as_str(),
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
            .prepare("SELECT user_id, email, db_name, db_url, db_token, created_at, updated_at FROM user_databases WHERE user_id = ?")
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
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
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

    /// Health check for registry database
    pub async fn health_check(&self) -> Result<()> {
        let conn = self.get_registry_connection().await?;
        conn.execute("SELECT 1", libsql::params![]).await?;
        Ok(())
    }

    /// Get current schema version from the application
    pub fn get_current_schema_version() -> SchemaVersion {
        SchemaVersion {
            version: "0.0.2".to_string(),
            description: "Initial trading schema with stocks, options, trade_notes, images and user_profile tables".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Get the expected schema definition for the current version
    pub fn get_expected_schema() -> Vec<TableSchema> {
        vec![
            // Stocks table
            TableSchema {
                name: "stocks".to_string(),
                columns: vec![
                    ColumnInfo { name: "id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
                    ColumnInfo { name: "symbol".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "trade_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "order_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "entry_price".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "exit_price".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "stop_loss".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "commissions".to_string(), data_type: "DECIMAL(10,4)".to_string(), is_nullable: false, default_value: Some("0.00".to_string()), is_primary_key: false },
                    ColumnInfo { name: "number_shares".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "take_profit".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "entry_date".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "exit_date".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "created_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
                    ColumnInfo { name: "updated_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
                ],
                indexes: vec![
                    IndexInfo { name: "idx_stocks_symbol".to_string(), table_name: "stocks".to_string(), columns: vec!["symbol".to_string()], is_unique: false },
                    IndexInfo { name: "idx_stocks_trade_type".to_string(), table_name: "stocks".to_string(), columns: vec!["trade_type".to_string()], is_unique: false },
                    IndexInfo { name: "idx_stocks_entry_date".to_string(), table_name: "stocks".to_string(), columns: vec!["entry_date".to_string()], is_unique: false },
                    IndexInfo { name: "idx_stocks_exit_date".to_string(), table_name: "stocks".to_string(), columns: vec!["exit_date".to_string()], is_unique: false },
                ],
                triggers: vec![
                    TriggerInfo { name: "update_stocks_timestamp".to_string(), table_name: "stocks".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE stocks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id".to_string() },
                ],
            },
            // Options table
            TableSchema {
                name: "options".to_string(),
                columns: vec![
                    ColumnInfo { name: "id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
                    ColumnInfo { name: "symbol".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "strategy_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "trade_direction".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "number_of_contracts".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "option_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "strike_price".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "expiration_date".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "entry_price".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "exit_price".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "total_premium".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "commissions".to_string(), data_type: "DECIMAL(10,4)".to_string(), is_nullable: false, default_value: Some("0.00".to_string()), is_primary_key: false },
                    ColumnInfo { name: "implied_volatility".to_string(), data_type: "DECIMAL(8,4)".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "entry_date".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "exit_date".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "status".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("'open'".to_string()), is_primary_key: false },
                    ColumnInfo { name: "created_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
                    ColumnInfo { name: "updated_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
                ],
                indexes: vec![
                    IndexInfo { name: "idx_options_symbol".to_string(), table_name: "options".to_string(), columns: vec!["symbol".to_string()], is_unique: false },
                    IndexInfo { name: "idx_options_strategy_type".to_string(), table_name: "options".to_string(), columns: vec!["strategy_type".to_string()], is_unique: false },
                    IndexInfo { name: "idx_options_trade_direction".to_string(), table_name: "options".to_string(), columns: vec!["trade_direction".to_string()], is_unique: false },
                    IndexInfo { name: "idx_options_option_type".to_string(), table_name: "options".to_string(), columns: vec!["option_type".to_string()], is_unique: false },
                    IndexInfo { name: "idx_options_status".to_string(), table_name: "options".to_string(), columns: vec!["status".to_string()], is_unique: false },
                    IndexInfo { name: "idx_options_entry_date".to_string(), table_name: "options".to_string(), columns: vec!["entry_date".to_string()], is_unique: false },
                    IndexInfo { name: "idx_options_exit_date".to_string(), table_name: "options".to_string(), columns: vec!["exit_date".to_string()], is_unique: false },
                    IndexInfo { name: "idx_options_expiration_date".to_string(), table_name: "options".to_string(), columns: vec!["expiration_date".to_string()], is_unique: false },
                ],
                triggers: vec![
                    TriggerInfo { name: "update_options_timestamp".to_string(), table_name: "options".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE options SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id".to_string() },
                ],
            },
            // Trade notes table
            TableSchema {
                name: "trade_notes".to_string(),
                columns: vec![
                    ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
                    ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "content".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: Some("''".to_string()), is_primary_key: false },
                    ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
                    ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
                ],
                indexes: vec![
                    IndexInfo { name: "idx_trade_notes_updated_at".to_string(), table_name: "trade_notes".to_string(), columns: vec!["updated_at".to_string()], is_unique: false },
                ],
                triggers: vec![
                    TriggerInfo { name: "update_trade_notes_timestamp".to_string(), table_name: "trade_notes".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE trade_notes SET updated_at = datetime('now') WHERE id = NEW.id".to_string() },
                ],
            },
            // User profile table
            TableSchema {
                name: "user_profile".to_string(),
                columns: vec![
                    ColumnInfo { name: "id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
                    ColumnInfo { name: "display_name".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "timezone".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: Some("'UTC'".to_string()), is_primary_key: false },
                    ColumnInfo { name: "currency".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: Some("'USD'".to_string()), is_primary_key: false },
                    ColumnInfo { name: "created_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
                    ColumnInfo { name: "updated_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
                ],
                indexes: vec![],
                triggers: vec![
                    TriggerInfo { name: "update_user_profile_timestamp".to_string(), table_name: "user_profile".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE user_profile SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id".to_string() },
                ],
            },
            // Trade tags table
            TableSchema {
                name: "trade_tags".to_string(),
                columns: vec![
                    ColumnInfo { name: "id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
                    ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "color".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "created_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
                ],
                indexes: vec![],
                triggers: vec![],
            },
            // Images table
            TableSchema {
                name: "images".to_string(),
                columns: vec![
                    ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
                    ColumnInfo { name: "trade_note_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "uploadcare_file_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "original_filename".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "mime_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "file_size".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "width".to_string(), data_type: "INTEGER".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "height".to_string(), data_type: "INTEGER".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "alt_text".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "caption".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "position_in_note".to_string(), data_type: "INTEGER".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                    ColumnInfo { name: "is_deleted".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false },
                    ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
                    ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
                ],
                indexes: vec![
                    IndexInfo { name: "idx_images_trade_note_id".to_string(), table_name: "images".to_string(), columns: vec!["trade_note_id".to_string()], is_unique: false },
                    IndexInfo { name: "idx_images_uploadcare_file_id".to_string(), table_name: "images".to_string(), columns: vec!["uploadcare_file_id".to_string()], is_unique: true },
                    IndexInfo { name: "idx_images_is_deleted".to_string(), table_name: "images".to_string(), columns: vec!["is_deleted".to_string()], is_unique: false },
                    IndexInfo { name: "idx_images_position".to_string(), table_name: "images".to_string(), columns: vec!["trade_note_id".to_string(), "position_in_note".to_string()], is_unique: false },
                ],
                triggers: vec![
                    TriggerInfo { name: "update_images_timestamp".to_string(), table_name: "images".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE images SET updated_at = datetime('now') WHERE id = NEW.id".to_string() },
                ],
            },
        ]
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
            let expected_version = Self::get_current_schema_version();
            let expected_schema = Self::get_expected_schema();

            // If no version exists, this is a new database or very old one
            if current_version.is_none() {
                info!("No schema version found, initializing with current schema");
                self.initialize_schema_version_table(&conn).await?;
                self.apply_schema_migrations(&conn, &expected_schema).await?;
                self.update_schema_version(&conn, &expected_version).await?;
                return Ok(());
            }

            let current_version = current_version.unwrap();
            
            // Compare versions
            if current_version.version != expected_version.version {
                info!("Schema version mismatch: current={}, expected={}", 
                      current_version.version, expected_version.version);
                
                // Apply schema migrations
                self.apply_schema_migrations(&conn, &expected_schema).await?;
                self.update_schema_version(&conn, &expected_version).await?;
                
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
    async fn initialize_schema_version_table(&self, conn: &Connection) -> Result<()> {
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS schema_version (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            "#,
            libsql::params![],
        ).await.context("Failed to create schema_version table")?;

        Ok(())
    }

    /// Update schema version in the database
    async fn update_schema_version(&self, conn: &Connection, version: &SchemaVersion) -> Result<()> {
        conn.execute(
            "INSERT INTO schema_version (version, description, created_at) VALUES (?, ?, ?)",
            libsql::params![version.version.clone(), version.description.clone(), version.created_at.clone()],
        ).await.context("Failed to update schema version")?;

        Ok(())
    }

    /// Apply schema migrations to bring database up to current schema
    async fn apply_schema_migrations(&self, conn: &Connection, expected_schema: &[TableSchema]) -> Result<()> {
        info!("Applying schema migrations");

        // Get current tables in the database
        let current_tables = self.get_current_tables(conn).await?;

        for table_schema in expected_schema {
            if !current_tables.contains(&table_schema.name) {
                // Table doesn't exist, create it
                info!("Creating missing table: {}", table_schema.name);
                if let Err(e) = self.create_table(conn, table_schema).await {
                    error!("Failed to create table {}: {}", table_schema.name, e);
                    return Err(e);
                }
            } else {
                // Table exists, check if it needs updates
                info!("Checking table schema for: {}", table_schema.name);
                if let Err(e) = self.update_table_schema(conn, table_schema).await {
                    error!("Failed to update table schema for {}: {}", table_schema.name, e);
                    return Err(e);
                }
            }
        }

        // Create/update indexes and triggers
        for table_schema in expected_schema {
            if let Err(e) = self.ensure_indexes(conn, table_schema).await {
                error!("Failed to ensure indexes for table {}: {}", table_schema.name, e);
                return Err(e);
            }
            if let Err(e) = self.ensure_triggers(conn, table_schema).await {
                error!("Failed to ensure triggers for table {}: {}", table_schema.name, e);
                return Err(e);
            }
        }

        Ok(())
    }

    /// Get list of current tables in the database
    async fn get_current_tables(&self, conn: &Connection) -> Result<Vec<String>> {
        let mut tables = Vec::new();
        let mut rows = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            .await
            .context("Failed to prepare table list query")?
            .query(libsql::params![])
            .await
            .context("Failed to execute table list query")?;

        while let Some(row) = rows.next().await? {
            tables.push(row.get(0)?);
        }

        Ok(tables)
    }

    /// Create a table based on schema definition
    async fn create_table(&self, conn: &Connection, table_schema: &TableSchema) -> Result<()> {
        let mut create_sql = format!("CREATE TABLE IF NOT EXISTS {} (", table_schema.name);
        
        let column_definitions: Vec<String> = table_schema.columns.iter().map(|col| {
            let mut def = format!("{} {}", col.name, col.data_type);
            
            if col.is_primary_key {
                if col.data_type.to_uppercase().contains("INTEGER") {
                    def.push_str(" PRIMARY KEY AUTOINCREMENT");
                } else {
                    def.push_str(" PRIMARY KEY");
                }
            } else if !col.is_nullable {
                def.push_str(" NOT NULL");
            }
            
            if let Some(default) = &col.default_value {
                def.push_str(&format!(" DEFAULT {}", default));
            }
            
            def
        }).collect();

        create_sql.push_str(&column_definitions.join(", "));
        create_sql.push_str(")");

        info!("Creating table with SQL: {}", create_sql);
        conn.execute(&create_sql, libsql::params![])
            .await
            .context(format!("Failed to create table {}", table_schema.name))?;

        Ok(())
    }

    /// Update table schema if needed
    async fn update_table_schema(&self, conn: &Connection, table_schema: &TableSchema) -> Result<()> {
        // Get current columns
        let current_columns = self.get_table_columns(conn, &table_schema.name).await?;
        
        // Check for missing columns and add them
        for expected_col in &table_schema.columns {
            if !current_columns.iter().any(|col| col.name == expected_col.name) {
                info!("Adding missing column {} to table {}", expected_col.name, table_schema.name);
                
                let mut alter_sql = format!("ALTER TABLE {} ADD COLUMN {}", 
                                          table_schema.name, expected_col.name);
                alter_sql.push_str(&format!(" {}", expected_col.data_type));
                
                if !expected_col.is_nullable {
                    alter_sql.push_str(" NOT NULL");
                }
                
                if let Some(default) = &expected_col.default_value {
                    alter_sql.push_str(&format!(" DEFAULT {}", default));
                }

                conn.execute(&alter_sql, libsql::params![])
                    .await
                    .context(format!("Failed to add column {} to table {}", 
                                   expected_col.name, table_schema.name))?;
            }
        }

        Ok(())
    }

    /// Get current columns for a table
    async fn get_table_columns(&self, conn: &Connection, table_name: &str) -> Result<Vec<ColumnInfo>> {
        let mut columns = Vec::new();
        let mut rows = conn
            .prepare(&format!("PRAGMA table_info({})", table_name))
            .await
            .context("Failed to prepare column info query")?
            .query(libsql::params![])
            .await
            .context("Failed to execute column info query")?;

        while let Some(row) = rows.next().await? {
            columns.push(ColumnInfo {
                name: row.get(1)?, // cid, name, type, notnull, dflt_value, pk
                data_type: row.get(2)?,
                is_nullable: row.get::<i32>(3)? == 0,
                default_value: row.get(4)?,
                is_primary_key: row.get::<i32>(5)? == 1,
            });
        }

        Ok(columns)
    }

    /// Ensure indexes exist for a table
    async fn ensure_indexes(&self, conn: &Connection, table_schema: &TableSchema) -> Result<()> {
        for index in &table_schema.indexes {
            // Check if index exists
            let mut rows = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
                .await
                .context("Failed to prepare index check query")?
                .query(libsql::params![index.name.clone()])
                .await
                .context("Failed to execute index check query")?;

            if rows.next().await?.is_none() {
                info!("Creating missing index: {}", index.name);
                let create_index_sql = format!(
                    "CREATE INDEX IF NOT EXISTS {} ON {} ({})",
                    index.name,
                    index.table_name,
                    index.columns.join(", ")
                );

                conn.execute(&create_index_sql, libsql::params![])
                    .await
                    .context(format!("Failed to create index {}", index.name))?;
            }
        }

        Ok(())
    }

    /// Ensure triggers exist for a table
    async fn ensure_triggers(&self, conn: &Connection, table_schema: &TableSchema) -> Result<()> {
        for trigger in &table_schema.triggers {
            // Check if trigger exists
            let mut rows = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?")
                .await
                .context("Failed to prepare trigger check query")?
                .query(libsql::params![trigger.name.clone()])
                .await
                .context("Failed to execute trigger check query")?;

            if rows.next().await?.is_none() {
                info!("Creating missing trigger: {}", trigger.name);
                let create_trigger_sql = format!(
                    "CREATE TRIGGER IF NOT EXISTS {} {} {} ON {} FOR EACH ROW BEGIN {}; END",
                    trigger.name,
                    trigger.timing,
                    trigger.event,
                    trigger.table_name,
                    trigger.action
                );

                conn.execute(&create_trigger_sql, libsql::params![])
                    .await
                    .context(format!("Failed to create trigger {}", trigger.name))?;
            }
        }

        Ok(())
    }
}
