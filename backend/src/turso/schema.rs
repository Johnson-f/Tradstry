use anyhow::Result;
use libsql::Connection;
use log::info;

/// Schema version information
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct SchemaVersion {
    pub version: String,
    pub description: String,
    pub created_at: String,
}

/// Table schema information for comparison
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct TableSchema {
    pub name: String,
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<IndexInfo>,
    pub triggers: Vec<TriggerInfo>,
}

/// Column information for schema comparison
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub default_value: Option<String>,
    pub is_primary_key: bool,
}

/// Index information for schema comparison
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct IndexInfo {
    pub name: String,
    pub table_name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
}

/// Trigger information for schema comparison
#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct TriggerInfo {
    pub name: String,
    pub table_name: String,
    pub event: String,
    pub timing: String,
    pub action: String,
}

/// Initialize user database with base trading + notebook schema
pub async fn initialize_user_database_schema(db_url: &str, token: &str) -> Result<()> {
    info!("Initializing trading+notebook schema for database: {}", db_url);

    let user_db = libsql::Builder::new_remote(db_url.to_string(), token.to_string())
        .build()
        .await?;
    let conn = user_db.connect()?;

    // Stocks table
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
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            version INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_stocks_trade_type ON stocks(trade_type)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_stocks_entry_date ON stocks(entry_date)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_stocks_exit_date ON stocks(exit_date)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_stocks_is_deleted ON stocks(is_deleted)", libsql::params![]).await?;

    // User profile
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
    ).await?;

    // Options
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
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            version INTEGER NOT NULL DEFAULT 0,
            is_deleted INTEGER NOT NULL DEFAULT 0
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_options_symbol ON options(symbol)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_options_strategy_type ON options(strategy_type)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_options_trade_direction ON options(trade_direction)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_options_option_type ON options(option_type)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_options_status ON options(status)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_options_entry_date ON options(entry_date)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_options_exit_date ON options(exit_date)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_options_expiration_date ON options(expiration_date)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_options_is_deleted ON options(is_deleted)", libsql::params![]).await?;

    // Trade notes (existing)
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS trade_notes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            content TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            version INTEGER NOT NULL DEFAULT 0
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_notes_updated_at ON trade_notes(updated_at)", libsql::params![]).await?;

    // Images (existing)
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
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_images_trade_note_id ON images(trade_note_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_images_uploadcare_file_id ON images(uploadcare_file_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_images_is_deleted ON images(is_deleted)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_images_position ON images(trade_note_id, position_in_note)", libsql::params![]).await?;

    // Playbook (existing)
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS playbook (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            version INTEGER NOT NULL DEFAULT 0
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE TABLE IF NOT EXISTS stock_trade_playbook (stock_trade_id INTEGER NOT NULL, setup_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (stock_trade_id, setup_id), FOREIGN KEY (stock_trade_id) REFERENCES stocks(id) ON DELETE CASCADE, FOREIGN KEY (setup_id) REFERENCES playbook(id) ON DELETE CASCADE)", libsql::params![]).await?;
    conn.execute("CREATE TABLE IF NOT EXISTS option_trade_playbook (option_trade_id INTEGER NOT NULL, setup_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (option_trade_id, setup_id), FOREIGN KEY (option_trade_id) REFERENCES options(id) ON DELETE CASCADE, FOREIGN KEY (setup_id) REFERENCES playbook(id) ON DELETE CASCADE)", libsql::params![]).await?;

    // Replicache (existing)
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS replicache_clients (
          client_group_id TEXT NOT NULL,
          client_id TEXT NOT NULL,
          last_mutation_id INTEGER NOT NULL DEFAULT 0,
          last_modified_version INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          PRIMARY KEY (client_group_id, client_id)
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS replicache_space_version (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          version INTEGER NOT NULL DEFAULT 0
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("INSERT OR IGNORE INTO replicache_space_version (id, version) VALUES (1, 0)", libsql::params![]).await?;

    // Notebook: notes (NO version column per requirement)
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS notebook_notes (
            id TEXT PRIMARY KEY,
            parent_id TEXT,
            title TEXT NOT NULL,
            content TEXT DEFAULT '',
            position INTEGER NOT NULL DEFAULT 0,
            is_deleted BOOLEAN NOT NULL DEFAULT false,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (parent_id) REFERENCES notebook_notes(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notebook_notes_parent_id ON notebook_notes(parent_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notebook_notes_is_deleted ON notebook_notes(is_deleted)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notebook_notes_created_at ON notebook_notes(created_at)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notebook_notes_position ON notebook_notes(parent_id, position)", libsql::params![]).await?;

    // Notebook: tags and note-tags
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS notebook_tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT '#gray',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS notebook_note_tags (
            note_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (note_id, tag_id),
            FOREIGN KEY (note_id) REFERENCES notebook_notes(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES notebook_tags(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;

    // Notebook: templates
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS notebook_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notebook_templates_created_at ON notebook_templates(created_at)", libsql::params![]).await?;

    // Notebook: reminders
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS notebook_reminders (
            id TEXT PRIMARY KEY,
            note_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            reminder_time TEXT NOT NULL,
            is_completed BOOLEAN NOT NULL DEFAULT false,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (note_id) REFERENCES notebook_notes(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notebook_reminders_note_id ON notebook_reminders(note_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notebook_reminders_reminder_time ON notebook_reminders(reminder_time)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_notebook_reminders_is_completed ON notebook_reminders(is_completed)", libsql::params![]).await?;

    // Calendar events (internal)
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS calendar_events (
            id TEXT PRIMARY KEY,
            reminder_id TEXT NOT NULL,
            event_title TEXT NOT NULL,
            event_description TEXT,
            event_time TEXT NOT NULL,
            is_synced BOOLEAN NOT NULL DEFAULT false,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (reminder_id) REFERENCES notebook_reminders(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_calendar_events_reminder_id ON calendar_events(reminder_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_calendar_events_event_time ON calendar_events(event_time)", libsql::params![]).await?;

    // External calendars (connections and events cache)
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS external_calendar_connections (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            token_expiry TEXT NOT NULL,
            calendar_id TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS external_calendar_events (
            id TEXT PRIMARY KEY,
            connection_id TEXT NOT NULL,
            external_event_id TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            location TEXT,
            last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (connection_id) REFERENCES external_calendar_connections(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_external_calendar_events_connection_id ON external_calendar_events(connection_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_external_calendar_events_start_time ON external_calendar_events(start_time)", libsql::params![]).await?;

    // Triggers
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
    ).await?;
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
    ).await?;
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
    ).await?;
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
    ).await?;
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
    ).await?;

    conn.execute(
        r#"
        CREATE TRIGGER IF NOT EXISTS update_playbook_timestamp
        AFTER UPDATE ON playbook
        FOR EACH ROW
        BEGIN
            UPDATE playbook SET updated_at = datetime('now') WHERE id = NEW.id;
        END
        "#,
        libsql::params![],
    ).await?;

    conn.execute(
        r#"
        CREATE TRIGGER IF NOT EXISTS update_notebook_notes_timestamp
        AFTER UPDATE ON notebook_notes
        FOR EACH ROW
        BEGIN
            UPDATE notebook_notes SET updated_at = datetime('now') WHERE id = NEW.id;
        END
        "#,
        libsql::params![],
    ).await?;

    conn.execute(
        r#"
        CREATE TRIGGER IF NOT EXISTS update_notebook_templates_timestamp
        AFTER UPDATE ON notebook_templates
        FOR EACH ROW
        BEGIN
            UPDATE notebook_templates SET updated_at = datetime('now') WHERE id = NEW.id;
        END
        "#,
        libsql::params![],
    ).await?;

    conn.execute(
        r#"
        CREATE TRIGGER IF NOT EXISTS update_notebook_reminders_timestamp
        AFTER UPDATE ON notebook_reminders
        FOR EACH ROW
        BEGIN
            UPDATE notebook_reminders SET updated_at = datetime('now') WHERE id = NEW.id;
        END
        "#,
        libsql::params![],
    ).await?;

    conn.execute(
        r#"
        CREATE TRIGGER IF NOT EXISTS update_calendar_events_timestamp
        AFTER UPDATE ON calendar_events
        FOR EACH ROW
        BEGIN
            UPDATE calendar_events SET updated_at = datetime('now') WHERE id = NEW.id;
        END
        "#,
        libsql::params![],
    ).await?;

    info!("Trading+notebook schema initialized successfully");
    Ok(())
}

/// Current schema version (bumped for notebook feature)
pub fn get_current_schema_version() -> SchemaVersion {
    SchemaVersion {
        version: "0.0.7".to_string(),
        description: "Add notebook (notes, tags, templates, reminders, calendar, external calendars) and bump schema".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}

/// Expected schema for synchronization
pub fn get_expected_schema() -> Vec<TableSchema> {
    let mut schemas: Vec<TableSchema> = vec![
        // Stocks
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
                ColumnInfo { name: "version".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false },
                ColumnInfo { name: "is_deleted".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false },
            ],
            indexes: vec![
                IndexInfo { name: "idx_stocks_symbol".to_string(), table_name: "stocks".to_string(), columns: vec!["symbol".to_string()], is_unique: false },
                IndexInfo { name: "idx_stocks_trade_type".to_string(), table_name: "stocks".to_string(), columns: vec!["trade_type".to_string()], is_unique: false },
                IndexInfo { name: "idx_stocks_entry_date".to_string(), table_name: "stocks".to_string(), columns: vec!["entry_date".to_string()], is_unique: false },
                IndexInfo { name: "idx_stocks_exit_date".to_string(), table_name: "stocks".to_string(), columns: vec!["exit_date".to_string()], is_unique: false },
                IndexInfo { name: "idx_stocks_is_deleted".to_string(), table_name: "stocks".to_string(), columns: vec!["is_deleted".to_string()], is_unique: false },
            ],
            triggers: vec![
                TriggerInfo { name: "update_stocks_timestamp".to_string(), table_name: "stocks".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE stocks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id".to_string() },
            ],
        },
        // Options
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
                ColumnInfo { name: "version".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false },
                ColumnInfo { name: "is_deleted".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false },
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
                IndexInfo { name: "idx_options_is_deleted".to_string(), table_name: "options".to_string(), columns: vec!["is_deleted".to_string()], is_unique: false },
            ],
            triggers: vec![
                TriggerInfo { name: "update_options_timestamp".to_string(), table_name: "options".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE options SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id".to_string() },
            ],
        },
        // Trade notes (existing)
        TableSchema {
            name: "trade_notes".to_string(),
            columns: vec![
                ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
                ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                ColumnInfo { name: "content".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: Some("''".to_string()), is_primary_key: false },
                ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
                ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
                ColumnInfo { name: "version".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false },
            ],
            indexes: vec![ IndexInfo { name: "idx_trade_notes_updated_at".to_string(), table_name: "trade_notes".to_string(), columns: vec!["updated_at".to_string()], is_unique: false } ],
            triggers: vec![ TriggerInfo { name: "update_trade_notes_timestamp".to_string(), table_name: "trade_notes".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE trade_notes SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ],
        },
        // User profile
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
            triggers: vec![ TriggerInfo { name: "update_user_profile_timestamp".to_string(), table_name: "user_profile".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE user_profile SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id".to_string() } ],
        },
        // Trade tags
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
        // Images
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
            triggers: vec![ TriggerInfo { name: "update_images_timestamp".to_string(), table_name: "images".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE images SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ],
        },
        // Playbook + junction tables
        TableSchema { name: "playbook".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "version".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_playbook_updated_at".to_string(), table_name: "playbook".to_string(), columns: vec!["updated_at".to_string()], is_unique: false } ], triggers: vec![ TriggerInfo { name: "update_playbook_timestamp".to_string(), table_name: "playbook".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE playbook SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ] },
        TableSchema { name: "stock_trade_playbook".to_string(), columns: vec![ ColumnInfo { name: "stock_trade_id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "setup_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_stock_trade_playbook_stock_trade_id".to_string(), table_name: "stock_trade_playbook".to_string(), columns: vec!["stock_trade_id".to_string()], is_unique: false }, IndexInfo { name: "idx_stock_trade_playbook_setup_id".to_string(), table_name: "stock_trade_playbook".to_string(), columns: vec!["setup_id".to_string()], is_unique: false } ], triggers: vec![] },
        TableSchema { name: "option_trade_playbook".to_string(), columns: vec![ ColumnInfo { name: "option_trade_id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "setup_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_option_trade_playbook_option_trade_id".to_string(), table_name: "option_trade_playbook".to_string(), columns: vec!["option_trade_id".to_string()], is_unique: false }, IndexInfo { name: "idx_option_trade_playbook_setup_id".to_string(), table_name: "option_trade_playbook".to_string(), columns: vec!["setup_id".to_string()], is_unique: false } ], triggers: vec![] },
    ];

    // Notebook tables
    schemas.push(
        TableSchema { name: "notebook_notes".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "parent_id".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "content".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: Some("''".to_string()), is_primary_key: false }, ColumnInfo { name: "position".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false }, ColumnInfo { name: "is_deleted".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_notebook_notes_parent_id".to_string(), table_name: "notebook_notes".to_string(), columns: vec!["parent_id".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_notes_is_deleted".to_string(), table_name: "notebook_notes".to_string(), columns: vec!["is_deleted".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_notes_created_at".to_string(), table_name: "notebook_notes".to_string(), columns: vec!["created_at".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_notes_position".to_string(), table_name: "notebook_notes".to_string(), columns: vec!["parent_id".to_string(), "position".to_string()], is_unique: false } ], triggers: vec![ TriggerInfo { name: "update_notebook_notes_timestamp".to_string(), table_name: "notebook_notes".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE notebook_notes SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ] });

    schemas.push(TableSchema { name: "notebook_tags".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "color".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("'#gray'".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![], triggers: vec![] });

    schemas.push(TableSchema { name: "notebook_note_tags".to_string(), columns: vec![ ColumnInfo { name: "note_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "tag_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_notebook_note_tags_note_id".to_string(), table_name: "notebook_note_tags".to_string(), columns: vec!["note_id".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_note_tags_tag_id".to_string(), table_name: "notebook_note_tags".to_string(), columns: vec!["tag_id".to_string()], is_unique: false } ], triggers: vec![] });

    schemas.push(TableSchema { name: "notebook_templates".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "content".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_notebook_templates_created_at".to_string(), table_name: "notebook_templates".to_string(), columns: vec!["created_at".to_string()], is_unique: false } ], triggers: vec![ TriggerInfo { name: "update_notebook_templates_timestamp".to_string(), table_name: "notebook_templates".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE notebook_templates SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ] });

    schemas.push(TableSchema { name: "notebook_reminders".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "note_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "reminder_time".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "is_completed".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_notebook_reminders_note_id".to_string(), table_name: "notebook_reminders".to_string(), columns: vec!["note_id".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_reminders_reminder_time".to_string(), table_name: "notebook_reminders".to_string(), columns: vec!["reminder_time".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_reminders_is_completed".to_string(), table_name: "notebook_reminders".to_string(), columns: vec!["is_completed".to_string()], is_unique: false } ], triggers: vec![ TriggerInfo { name: "update_notebook_reminders_timestamp".to_string(), table_name: "notebook_reminders".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE notebook_reminders SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ] });

    schemas.push(TableSchema { name: "calendar_events".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "reminder_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "event_title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "event_description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "event_time".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "is_synced".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_calendar_events_reminder_id".to_string(), table_name: "calendar_events".to_string(), columns: vec!["reminder_id".to_string()], is_unique: false }, IndexInfo { name: "idx_calendar_events_event_time".to_string(), table_name: "calendar_events".to_string(), columns: vec!["event_time".to_string()], is_unique: false } ], triggers: vec![ TriggerInfo { name: "update_calendar_events_timestamp".to_string(), table_name: "calendar_events".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE calendar_events SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ] });

    schemas.push(TableSchema { name: "external_calendar_connections".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "provider".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "access_token".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "refresh_token".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "token_expiry".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "calendar_id".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "is_active".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("true".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![], triggers: vec![] });

    schemas.push(TableSchema { name: "external_calendar_events".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "connection_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "external_event_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "start_time".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "end_time".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "location".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "last_synced_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_external_calendar_events_connection_id".to_string(), table_name: "external_calendar_events".to_string(), columns: vec!["connection_id".to_string()], is_unique: false }, IndexInfo { name: "idx_external_calendar_events_start_time".to_string(), table_name: "external_calendar_events".to_string(), columns: vec!["start_time".to_string()], is_unique: false } ], triggers: vec![] });

    schemas
}

/// Initialize the schema version table if needed
pub async fn initialize_schema_version_table(conn: &Connection) -> Result<()> {
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
    ).await?;
    Ok(())
}

/// Update schema version in the database
pub async fn update_schema_version(conn: &Connection, version: &SchemaVersion) -> Result<()> {
    conn.execute(
        "INSERT INTO schema_version (version, description, created_at) VALUES (?, ?, ?)",
        libsql::params![version.version.clone(), version.description.clone(), version.created_at.clone()],
    ).await?;
    Ok(())
}

/// Ensure indexes for a table
pub async fn ensure_indexes(conn: &Connection, table_schema: &TableSchema) -> Result<()> {
    for index in &table_schema.indexes {
        let mut rows = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
            .await?
            .query(libsql::params![index.name.clone()])
            .await?;
        if rows.next().await?.is_none() {
            let create_index_sql = format!(
                "CREATE INDEX IF NOT EXISTS {} ON {} ({})",
                index.name,
                index.table_name,
                index.columns.join(", ")
            );
            conn.execute(&create_index_sql, libsql::params![]).await?;
        }
    }
    Ok(())
}

/// Ensure triggers for a table
pub async fn ensure_triggers(conn: &Connection, table_schema: &TableSchema) -> Result<()> {
    for trigger in &table_schema.triggers {
        let mut rows = conn
            .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?")
            .await?
            .query(libsql::params![trigger.name.clone()])
            .await?;
        if rows.next().await?.is_none() {
            let create_trigger_sql = format!(
                "CREATE TRIGGER IF NOT EXISTS {} {} {} ON {} FOR EACH ROW BEGIN {}; END",
                trigger.name,
                trigger.timing,
                trigger.event,
                trigger.table_name,
                trigger.action
            );
            conn.execute(&create_trigger_sql, libsql::params![]).await?;
        }
    }
    Ok(())
}

/// Get list of current tables in the database
pub async fn get_current_tables(conn: &Connection) -> Result<Vec<String>> {
    let mut tables = Vec::new();
    let mut rows = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .await?
        .query(libsql::params![])
        .await?;
    while let Some(row) = rows.next().await? { tables.push(row.get(0)?); }
    Ok(tables)
}

/// Create a table based on schema definition
pub async fn create_table(conn: &Connection, table_schema: &TableSchema) -> Result<()> {
    let mut create_sql = format!("CREATE TABLE IF NOT EXISTS {} (", table_schema.name);
    let primary_keys: Vec<String> = table_schema.columns.iter().filter(|c| c.is_primary_key).map(|c| c.name.clone()).collect();
    let column_definitions: Vec<String> = table_schema.columns.iter().map(|col| {
        let mut def = format!("{} {}", col.name, col.data_type);
        if col.is_primary_key && primary_keys.len() == 1 {
            if col.data_type.to_uppercase().contains("INTEGER") { def.push_str(" PRIMARY KEY AUTOINCREMENT"); } else { def.push_str(" PRIMARY KEY"); }
        } else if !col.is_nullable { def.push_str(" NOT NULL"); }
        if let Some(default) = &col.default_value { def.push_str(&format!(" DEFAULT {}", default)); }
        def
    }).collect();
    create_sql.push_str(&column_definitions.join(", "));
    if primary_keys.len() > 1 { create_sql.push_str(&format!(", PRIMARY KEY ({})", primary_keys.join(", "))); }
    create_sql.push_str(")");
    conn.execute(&create_sql, libsql::params![]).await?;
    Ok(())
}

/// Get current columns for a table
pub async fn get_table_columns(conn: &Connection, table_name: &str) -> Result<Vec<ColumnInfo>> {
    let mut columns = Vec::new();
    let mut rows = conn
        .prepare(&format!("PRAGMA table_info({})", table_name))
        .await?
        .query(libsql::params![])
        .await?;
    while let Some(row) = rows.next().await? {
        columns.push(ColumnInfo {
            name: row.get(1)?,
            data_type: row.get(2)?,
            is_nullable: row.get::<i32>(3)? == 0,
            default_value: row.get(4)?,
            is_primary_key: row.get::<i32>(5)? == 1,
        });
    }
    Ok(columns)
}

/// Update table schema if needed
pub async fn update_table_schema(conn: &Connection, table_schema: &TableSchema) -> Result<()> {
    let current_columns = get_table_columns(conn, &table_schema.name).await?;
    for expected_col in &table_schema.columns {
        if !current_columns.iter().any(|c| c.name == expected_col.name) {
            let mut alter_sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table_schema.name, expected_col.name, expected_col.data_type);
            if !expected_col.is_nullable { alter_sql.push_str(" NOT NULL"); }
            if let Some(default) = &expected_col.default_value { alter_sql.push_str(&format!(" DEFAULT {}", default)); }
            conn.execute(&alter_sql, libsql::params![]).await?;
        }
    }
    // Best-effort: attempt to drop removed columns (may be unsupported; ignore failures)
    let expected_names: std::collections::HashSet<String> = table_schema.columns.iter().map(|c| c.name.clone()).collect();
    for existing in &current_columns {
        if !expected_names.contains(&existing.name) && !existing.is_primary_key {
            let drop_sql = format!("ALTER TABLE {} DROP COLUMN {}", table_schema.name, existing.name);
            let _ = conn.execute(&drop_sql, libsql::params![]).await; // ignore
        }
    }
    Ok(())
}


