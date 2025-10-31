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
            initial_target DECIMAL(15,8),
            profit_target DECIMAL(15,8),
            trade_ratings INTEGER CHECK (trade_ratings >= 1 AND trade_ratings <= 5),
            entry_date TIMESTAMP NOT NULL,
            exit_date TIMESTAMP,
            reviewed BOOLEAN NOT NULL DEFAULT false,
            mistakes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
            initial_target DECIMAL(15,8),
            profit_target DECIMAL(15,8),
            trade_ratings INTEGER CHECK (trade_ratings >= 1 AND trade_ratings <= 5),
            reviewed BOOLEAN NOT NULL DEFAULT false,
            mistakes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

    // Trade notes (linked to trades with AI metadata)
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS trade_notes (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            content TEXT DEFAULT '',
            trade_type TEXT CHECK (trade_type IN ('stock', 'option')),
            stock_trade_id INTEGER,
            option_trade_id INTEGER,
            ai_metadata TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            CHECK (
                (trade_type = 'stock' AND stock_trade_id IS NOT NULL AND option_trade_id IS NULL) OR
                (trade_type = 'option' AND option_trade_id IS NOT NULL AND stock_trade_id IS NULL) OR
                (trade_type IS NULL AND stock_trade_id IS NULL AND option_trade_id IS NULL)
            ),
            FOREIGN KEY (stock_trade_id) REFERENCES stocks(id) ON DELETE CASCADE,
            FOREIGN KEY (option_trade_id) REFERENCES options(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    // Migration: Add missing columns if they don't exist (for existing databases)
    // SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN, so we check first
    {
        let check_col = conn.prepare("SELECT COUNT(*) FROM pragma_table_info('trade_notes') WHERE name = 'trade_type'").await?;
        let mut rows = check_col.query(libsql::params![]).await?;
        if let Some(row) = rows.next().await? {
            let count: i64 = row.get(0)?;
            if count == 0 {
                // Column doesn't exist, add it
                conn.execute("ALTER TABLE trade_notes ADD COLUMN trade_type TEXT", libsql::params![]).await.ok();
            }
        }
    }
    
    {
        let check_col = conn.prepare("SELECT COUNT(*) FROM pragma_table_info('trade_notes') WHERE name = 'stock_trade_id'").await?;
        let mut rows = check_col.query(libsql::params![]).await?;
        if let Some(row) = rows.next().await? {
            let count: i64 = row.get(0)?;
            if count == 0 {
                conn.execute("ALTER TABLE trade_notes ADD COLUMN stock_trade_id INTEGER", libsql::params![]).await.ok();
            }
        }
    }
    
    {
        let check_col = conn.prepare("SELECT COUNT(*) FROM pragma_table_info('trade_notes') WHERE name = 'option_trade_id'").await?;
        let mut rows = check_col.query(libsql::params![]).await?;
        if let Some(row) = rows.next().await? {
            let count: i64 = row.get(0)?;
            if count == 0 {
                conn.execute("ALTER TABLE trade_notes ADD COLUMN option_trade_id INTEGER", libsql::params![]).await.ok();
            }
        }
    }
    
    {
        let check_col = conn.prepare("SELECT COUNT(*) FROM pragma_table_info('trade_notes') WHERE name = 'ai_metadata'").await?;
        let mut rows = check_col.query(libsql::params![]).await?;
        if let Some(row) = rows.next().await? {
            let count: i64 = row.get(0)?;
            if count == 0 {
                conn.execute("ALTER TABLE trade_notes ADD COLUMN ai_metadata TEXT", libsql::params![]).await.ok();
            }
        }
    }

    conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_notes_updated_at ON trade_notes(updated_at)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_notes_stock_trade_id ON trade_notes(stock_trade_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_notes_option_trade_id ON trade_notes(option_trade_id)", libsql::params![]).await?;
    // Unique constraint: one note per trade
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_notes_stock_unique ON trade_notes(stock_trade_id) WHERE stock_trade_id IS NOT NULL", libsql::params![]).await?;
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_notes_option_unique ON trade_notes(option_trade_id) WHERE option_trade_id IS NOT NULL", libsql::params![]).await?;

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

    // Playbook (existing with new fields)
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS playbook (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            icon TEXT,
            emoji TEXT,
            color TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            version INTEGER NOT NULL DEFAULT 0
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE TABLE IF NOT EXISTS stock_trade_playbook (stock_trade_id INTEGER NOT NULL, setup_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (stock_trade_id, setup_id), FOREIGN KEY (stock_trade_id) REFERENCES stocks(id) ON DELETE CASCADE, FOREIGN KEY (setup_id) REFERENCES playbook(id) ON DELETE CASCADE)", libsql::params![]).await?;
    conn.execute("CREATE TABLE IF NOT EXISTS option_trade_playbook (option_trade_id INTEGER NOT NULL, setup_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (option_trade_id, setup_id), FOREIGN KEY (option_trade_id) REFERENCES options(id) ON DELETE CASCADE, FOREIGN KEY (setup_id) REFERENCES playbook(id) ON DELETE CASCADE)", libsql::params![]).await?;

    // Playbook rules
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS playbook_rules (
            id TEXT PRIMARY KEY,
            playbook_id TEXT NOT NULL,
            rule_type TEXT NOT NULL CHECK (rule_type IN ('entry_criteria', 'exit_criteria', 'market_factor')),
            title TEXT NOT NULL,
            description TEXT,
            order_position INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (playbook_id) REFERENCES playbook(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_playbook_rules_playbook_id ON playbook_rules(playbook_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_playbook_rules_type ON playbook_rules(rule_type)", libsql::params![]).await?;

    // Trade rule compliance
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS stock_trade_rule_compliance (
            id TEXT PRIMARY KEY,
            stock_trade_id INTEGER NOT NULL,
            playbook_id TEXT NOT NULL,
            rule_id TEXT NOT NULL,
            is_followed BOOLEAN NOT NULL DEFAULT false,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (stock_trade_id) REFERENCES stocks(id) ON DELETE CASCADE,
            FOREIGN KEY (playbook_id) REFERENCES playbook(id) ON DELETE CASCADE,
            FOREIGN KEY (rule_id) REFERENCES playbook_rules(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE TABLE IF NOT EXISTS option_trade_rule_compliance (
            id TEXT PRIMARY KEY,
            option_trade_id INTEGER NOT NULL,
            playbook_id TEXT NOT NULL,
            rule_id TEXT NOT NULL,
            is_followed BOOLEAN NOT NULL DEFAULT false,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (option_trade_id) REFERENCES options(id) ON DELETE CASCADE,
            FOREIGN KEY (playbook_id) REFERENCES playbook(id) ON DELETE CASCADE,
            FOREIGN KEY (rule_id) REFERENCES playbook_rules(id) ON DELETE CASCADE
        )", libsql::params![]).await?;

    // Missed trades
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS missed_trades (
            id TEXT PRIMARY KEY,
            playbook_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            trade_type TEXT NOT NULL CHECK (trade_type IN ('stock', 'option')),
            reason TEXT NOT NULL,
            potential_entry_price REAL,
            opportunity_date TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (playbook_id) REFERENCES playbook(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_missed_trades_playbook_id ON missed_trades(playbook_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_missed_trades_opportunity_date ON missed_trades(opportunity_date)", libsql::params![]).await?;

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

    // Trade tags
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS trade_tags (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            name TEXT NOT NULL,
            color TEXT,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(category, name)
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_tags_category ON trade_tags(category)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_trade_tags_name ON trade_tags(name)", libsql::params![]).await?;

    // Stock trade tags junction table
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS stock_trade_tags (
            stock_trade_id INTEGER NOT NULL,
            tag_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (stock_trade_id, tag_id),
            FOREIGN KEY (stock_trade_id) REFERENCES stocks(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES trade_tags(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_stock_trade_tags_stock_id ON stock_trade_tags(stock_trade_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_stock_trade_tags_tag_id ON stock_trade_tags(tag_id)", libsql::params![]).await?;

    // Option trade tags junction table
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS option_trade_tags (
            option_trade_id INTEGER NOT NULL,
            tag_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (option_trade_id, tag_id),
            FOREIGN KEY (option_trade_id) REFERENCES options(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES trade_tags(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_option_trade_tags_option_id ON option_trade_tags(option_trade_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_option_trade_tags_tag_id ON option_trade_tags(tag_id)", libsql::params![]).await?;

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
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            start_time TIME,
            end_time TIME,
            is_all_day BOOLEAN NOT NULL DEFAULT false,
            is_synced BOOLEAN NOT NULL DEFAULT false,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (reminder_id) REFERENCES notebook_reminders(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_calendar_events_reminder_id ON calendar_events(reminder_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events(start_date)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_calendar_events_end_date ON calendar_events(end_date)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range ON calendar_events(start_date, end_date)", libsql::params![]).await?;

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
            last_sync_timestamp TEXT DEFAULT (datetime('now')),
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
            external_updated_at TEXT,
            last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (connection_id) REFERENCES external_calendar_connections(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_external_calendar_events_connection_id ON external_calendar_events(connection_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_external_calendar_events_start_time ON external_calendar_events(start_time)", libsql::params![]).await?;
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_external_calendar_events_unique ON external_calendar_events(connection_id, external_event_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_external_calendar_connections_last_sync ON external_calendar_connections(last_sync_timestamp)", libsql::params![]).await?;

    // Public holidays table
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS public_holidays (
            id TEXT PRIMARY KEY,
            country_code TEXT NOT NULL,
            holiday_name TEXT NOT NULL,
            holiday_date TEXT NOT NULL,
            is_national BOOLEAN DEFAULT true,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_public_holidays_country_date ON public_holidays(country_code, holiday_date)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_public_holidays_date ON public_holidays(holiday_date)", libsql::params![]).await?;

    // AI Chat Tables
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            title TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            message_count INTEGER DEFAULT 0,
            last_message_at TEXT
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at)", libsql::params![]).await?;

    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
            content TEXT NOT NULL,
            context_vectors TEXT, -- JSON array of vector IDs
            token_count INTEGER,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)", libsql::params![]).await?;

    // AI Insights Tables
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS ai_insights (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            time_range TEXT NOT NULL CHECK (time_range IN ('7d', '30d', '90d', 'ytd', '1y')),
            insight_type TEXT NOT NULL CHECK (insight_type IN ('trading_patterns', 'performance_analysis', 'risk_assessment', 'behavioral_analysis', 'market_analysis', 'opportunity_detection')),
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            key_findings TEXT, -- JSON array
            recommendations TEXT, -- JSON array
            data_sources TEXT, -- JSON array
            confidence_score REAL DEFAULT 0.0,
            generated_at TEXT NOT NULL,
            expires_at TEXT,
            metadata TEXT, -- JSON object with additional metadata
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_insights_user_id ON ai_insights(user_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_insights_time_range ON ai_insights(time_range)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(insight_type)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_insights_generated_at ON ai_insights(generated_at)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_insights_expires_at ON ai_insights(expires_at)", libsql::params![]).await?;

    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS insight_generation_tasks (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            time_range TEXT NOT NULL,
            insight_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            started_at TEXT,
            completed_at TEXT,
            error_message TEXT,
            result_insight_id TEXT,
            FOREIGN KEY (result_insight_id) REFERENCES ai_insights(id) ON DELETE SET NULL
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_insight_tasks_user_id ON insight_generation_tasks(user_id)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_insight_tasks_status ON insight_generation_tasks(status)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_insight_tasks_created_at ON insight_generation_tasks(created_at)", libsql::params![]).await?;

    // AI Reports Tables
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS ai_reports (
            id TEXT PRIMARY KEY,
            time_range TEXT NOT NULL CHECK (time_range IN ('7d', '30d', '90d', 'ytd', '1y')),
            report_type TEXT NOT NULL CHECK (report_type IN ('comprehensive', 'performance', 'risk', 'trading', 'behavioral', 'market')),
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            analytics TEXT NOT NULL, -- JSON object with analytics data
            insights TEXT NOT NULL, -- JSON array of insights
            trades TEXT NOT NULL, -- JSON array of trade data
            recommendations TEXT NOT NULL, -- JSON array of recommendations
            patterns TEXT, -- JSON array of trading patterns
            risk_metrics TEXT, -- JSON object with risk metrics
            performance_metrics TEXT, -- JSON object with performance metrics
            behavioral_insights TEXT, -- JSON array of behavioral insights
            market_analysis TEXT, -- JSON object with market analysis
            generated_at TEXT NOT NULL,
            expires_at TEXT,
            metadata TEXT, -- JSON object with additional metadata
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_reports_time_range ON ai_reports(time_range)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_reports_type ON ai_reports(report_type)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_reports_generated_at ON ai_reports(generated_at)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ai_reports_expires_at ON ai_reports(expires_at)", libsql::params![]).await?;

    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS report_generation_tasks (
            id TEXT PRIMARY KEY,
            time_range TEXT NOT NULL,
            report_type TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'expired')),
            progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            started_at TEXT,
            completed_at TEXT,
            error_message TEXT,
            result_report_id TEXT,
            FOREIGN KEY (result_report_id) REFERENCES ai_reports(id) ON DELETE SET NULL
        )
        "#,
        libsql::params![],
    ).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_report_tasks_status ON report_generation_tasks(status)", libsql::params![]).await?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_report_tasks_created_at ON report_generation_tasks(created_at)", libsql::params![]).await?;

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
        CREATE TRIGGER IF NOT EXISTS update_trade_tags_timestamp
        AFTER UPDATE ON trade_tags
        FOR EACH ROW
        BEGIN
            UPDATE trade_tags SET updated_at = datetime('now') WHERE id = NEW.id;
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

/// Current schema version (bumped for trade tags system)
pub fn get_current_schema_version() -> SchemaVersion {
    SchemaVersion {
        version: "0.0.18".to_string(),
        description: "Added trade_tags table with category field and junction tables for stock_trade_tags and option_trade_tags. Tags can be organized by categories and linked to trades.".to_string(),
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
                ColumnInfo { name: "initial_target".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "profit_target".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "trade_ratings".to_string(), data_type: "INTEGER".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "entry_date".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                ColumnInfo { name: "exit_date".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "reviewed".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false },
                ColumnInfo { name: "mistakes".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "created_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
                ColumnInfo { name: "updated_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
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
                ColumnInfo { name: "initial_target".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "profit_target".to_string(), data_type: "DECIMAL(15,8)".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "trade_ratings".to_string(), data_type: "INTEGER".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "reviewed".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false },
                ColumnInfo { name: "mistakes".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "created_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
                ColumnInfo { name: "updated_at".to_string(), data_type: "TIMESTAMP".to_string(), is_nullable: false, default_value: Some("CURRENT_TIMESTAMP".to_string()), is_primary_key: false },
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
        // Trade notes (linked to trades with AI metadata)
        TableSchema {
            name: "trade_notes".to_string(),
            columns: vec![
                ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
                ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                ColumnInfo { name: "content".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: Some("''".to_string()), is_primary_key: false },
                ColumnInfo { name: "trade_type".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "stock_trade_id".to_string(), data_type: "INTEGER".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "option_trade_id".to_string(), data_type: "INTEGER".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "ai_metadata".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
                ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
            ],
            indexes: vec![
                IndexInfo { name: "idx_trade_notes_updated_at".to_string(), table_name: "trade_notes".to_string(), columns: vec!["updated_at".to_string()], is_unique: false },
                IndexInfo { name: "idx_trade_notes_stock_trade_id".to_string(), table_name: "trade_notes".to_string(), columns: vec!["stock_trade_id".to_string()], is_unique: false },
                IndexInfo { name: "idx_trade_notes_option_trade_id".to_string(), table_name: "trade_notes".to_string(), columns: vec!["option_trade_id".to_string()], is_unique: false },
                IndexInfo { name: "idx_trade_notes_stock_unique".to_string(), table_name: "trade_notes".to_string(), columns: vec!["stock_trade_id".to_string()], is_unique: true },
                IndexInfo { name: "idx_trade_notes_option_unique".to_string(), table_name: "trade_notes".to_string(), columns: vec!["option_trade_id".to_string()], is_unique: true },
            ],
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
                ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
                ColumnInfo { name: "category".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                ColumnInfo { name: "color".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
                ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
                ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
            ],
            indexes: vec![
                IndexInfo { name: "idx_trade_tags_category".to_string(), table_name: "trade_tags".to_string(), columns: vec!["category".to_string()], is_unique: false },
                IndexInfo { name: "idx_trade_tags_name".to_string(), table_name: "trade_tags".to_string(), columns: vec!["name".to_string()], is_unique: false },
                IndexInfo { name: "idx_trade_tags_category_name_unique".to_string(), table_name: "trade_tags".to_string(), columns: vec!["category".to_string(), "name".to_string()], is_unique: true },
            ],
            triggers: vec![ TriggerInfo { name: "update_trade_tags_timestamp".to_string(), table_name: "trade_tags".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE trade_tags SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ],
        },
        // Stock trade tags junction
        TableSchema {
            name: "stock_trade_tags".to_string(),
            columns: vec![
                ColumnInfo { name: "stock_trade_id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                ColumnInfo { name: "tag_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
            ],
            indexes: vec![
                IndexInfo { name: "idx_stock_trade_tags_stock_id".to_string(), table_name: "stock_trade_tags".to_string(), columns: vec!["stock_trade_id".to_string()], is_unique: false },
                IndexInfo { name: "idx_stock_trade_tags_tag_id".to_string(), table_name: "stock_trade_tags".to_string(), columns: vec!["tag_id".to_string()], is_unique: false },
            ],
            triggers: vec![],
        },
        // Option trade tags junction
        TableSchema {
            name: "option_trade_tags".to_string(),
            columns: vec![
                ColumnInfo { name: "option_trade_id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                ColumnInfo { name: "tag_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
                ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
            ],
            indexes: vec![
                IndexInfo { name: "idx_option_trade_tags_option_id".to_string(), table_name: "option_trade_tags".to_string(), columns: vec!["option_trade_id".to_string()], is_unique: false },
                IndexInfo { name: "idx_option_trade_tags_tag_id".to_string(), table_name: "option_trade_tags".to_string(), columns: vec!["tag_id".to_string()], is_unique: false },
            ],
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
        TableSchema { name: "playbook".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "icon".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "emoji".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "color".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "version".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_playbook_updated_at".to_string(), table_name: "playbook".to_string(), columns: vec!["updated_at".to_string()], is_unique: false } ], triggers: vec![ TriggerInfo { name: "update_playbook_timestamp".to_string(), table_name: "playbook".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE playbook SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ] },
        TableSchema { name: "stock_trade_playbook".to_string(), columns: vec![ ColumnInfo { name: "stock_trade_id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "setup_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_stock_trade_playbook_stock_trade_id".to_string(), table_name: "stock_trade_playbook".to_string(), columns: vec!["stock_trade_id".to_string()], is_unique: false }, IndexInfo { name: "idx_stock_trade_playbook_setup_id".to_string(), table_name: "stock_trade_playbook".to_string(), columns: vec!["setup_id".to_string()], is_unique: false } ], triggers: vec![] },
        TableSchema { name: "option_trade_playbook".to_string(), columns: vec![ ColumnInfo { name: "option_trade_id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "setup_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_option_trade_playbook_option_trade_id".to_string(), table_name: "option_trade_playbook".to_string(), columns: vec!["option_trade_id".to_string()], is_unique: false }, IndexInfo { name: "idx_option_trade_playbook_setup_id".to_string(), table_name: "option_trade_playbook".to_string(), columns: vec!["setup_id".to_string()], is_unique: false } ], triggers: vec![] },

        // Playbook rules
        TableSchema { name: "playbook_rules".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "playbook_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "rule_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "order_position".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_playbook_rules_playbook_id".to_string(), table_name: "playbook_rules".to_string(), columns: vec!["playbook_id".to_string()], is_unique: false }, IndexInfo { name: "idx_playbook_rules_type".to_string(), table_name: "playbook_rules".to_string(), columns: vec!["rule_type".to_string()], is_unique: false } ], triggers: vec![] },

        // Trade rule compliance
        TableSchema { name: "stock_trade_rule_compliance".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "stock_trade_id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "playbook_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "rule_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "is_followed".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false }, ColumnInfo { name: "notes".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![], triggers: vec![] },
        TableSchema { name: "option_trade_rule_compliance".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "option_trade_id".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "playbook_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "rule_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "is_followed".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false }, ColumnInfo { name: "notes".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![], triggers: vec![] },

        // Missed trades
        TableSchema { name: "missed_trades".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "playbook_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "symbol".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "trade_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "reason".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "potential_entry_price".to_string(), data_type: "REAL".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "opportunity_date".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "notes".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_missed_trades_playbook_id".to_string(), table_name: "missed_trades".to_string(), columns: vec!["playbook_id".to_string()], is_unique: false }, IndexInfo { name: "idx_missed_trades_opportunity_date".to_string(), table_name: "missed_trades".to_string(), columns: vec!["opportunity_date".to_string()], is_unique: false } ], triggers: vec![] },
    ];

    // Notebook tables
    schemas.push(
        TableSchema { name: "notebook_notes".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "parent_id".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "content".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: Some("''".to_string()), is_primary_key: false }, ColumnInfo { name: "position".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false }, ColumnInfo { name: "is_deleted".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_notebook_notes_parent_id".to_string(), table_name: "notebook_notes".to_string(), columns: vec!["parent_id".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_notes_is_deleted".to_string(), table_name: "notebook_notes".to_string(), columns: vec!["is_deleted".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_notes_created_at".to_string(), table_name: "notebook_notes".to_string(), columns: vec!["created_at".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_notes_position".to_string(), table_name: "notebook_notes".to_string(), columns: vec!["parent_id".to_string(), "position".to_string()], is_unique: false } ], triggers: vec![ TriggerInfo { name: "update_notebook_notes_timestamp".to_string(), table_name: "notebook_notes".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE notebook_notes SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ] });

    schemas.push(TableSchema { name: "notebook_tags".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "color".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("'#gray'".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![], triggers: vec![] });

    schemas.push(TableSchema { name: "notebook_note_tags".to_string(), columns: vec![ ColumnInfo { name: "note_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "tag_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_notebook_note_tags_note_id".to_string(), table_name: "notebook_note_tags".to_string(), columns: vec!["note_id".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_note_tags_tag_id".to_string(), table_name: "notebook_note_tags".to_string(), columns: vec!["tag_id".to_string()], is_unique: false } ], triggers: vec![] });

    schemas.push(TableSchema { name: "notebook_templates".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "content".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_notebook_templates_created_at".to_string(), table_name: "notebook_templates".to_string(), columns: vec!["created_at".to_string()], is_unique: false } ], triggers: vec![ TriggerInfo { name: "update_notebook_templates_timestamp".to_string(), table_name: "notebook_templates".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE notebook_templates SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ] });

    schemas.push(TableSchema { name: "notebook_reminders".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "note_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "reminder_time".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "is_completed".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_notebook_reminders_note_id".to_string(), table_name: "notebook_reminders".to_string(), columns: vec!["note_id".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_reminders_reminder_time".to_string(), table_name: "notebook_reminders".to_string(), columns: vec!["reminder_time".to_string()], is_unique: false }, IndexInfo { name: "idx_notebook_reminders_is_completed".to_string(), table_name: "notebook_reminders".to_string(), columns: vec!["is_completed".to_string()], is_unique: false } ], triggers: vec![ TriggerInfo { name: "update_notebook_reminders_timestamp".to_string(), table_name: "notebook_reminders".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE notebook_reminders SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ] });

    schemas.push(TableSchema { name: "calendar_events".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "reminder_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "event_title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "event_description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "start_date".to_string(), data_type: "DATE".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "end_date".to_string(), data_type: "DATE".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "start_time".to_string(), data_type: "TIME".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "end_time".to_string(), data_type: "TIME".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "is_all_day".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false }, ColumnInfo { name: "is_synced".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("false".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_calendar_events_reminder_id".to_string(), table_name: "calendar_events".to_string(), columns: vec!["reminder_id".to_string()], is_unique: false }, IndexInfo { name: "idx_calendar_events_start_date".to_string(), table_name: "calendar_events".to_string(), columns: vec!["start_date".to_string()], is_unique: false }, IndexInfo { name: "idx_calendar_events_end_date".to_string(), table_name: "calendar_events".to_string(), columns: vec!["end_date".to_string()], is_unique: false }, IndexInfo { name: "idx_calendar_events_date_range".to_string(), table_name: "calendar_events".to_string(), columns: vec!["start_date".to_string(), "end_date".to_string()], is_unique: false } ], triggers: vec![ TriggerInfo { name: "update_calendar_events_timestamp".to_string(), table_name: "calendar_events".to_string(), event: "UPDATE".to_string(), timing: "AFTER".to_string(), action: "UPDATE calendar_events SET updated_at = datetime('now') WHERE id = NEW.id".to_string() } ] });

    schemas.push(TableSchema { name: "external_calendar_connections".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "provider".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "access_token".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "refresh_token".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "token_expiry".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "calendar_id".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "is_active".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("true".to_string()), is_primary_key: false }, ColumnInfo { name: "last_sync_timestamp".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: Some("''".to_string()), is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("''".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("''".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_external_calendar_connections_last_sync".to_string(), table_name: "external_calendar_connections".to_string(), columns: vec!["last_sync_timestamp".to_string()], is_unique: false } ], triggers: vec![] });

    schemas.push(TableSchema { name: "external_calendar_events".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "connection_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "external_event_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "start_time".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "end_time".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "location".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "external_updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "last_synced_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("''".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_external_calendar_events_connection_id".to_string(), table_name: "external_calendar_events".to_string(), columns: vec!["connection_id".to_string()], is_unique: false }, IndexInfo { name: "idx_external_calendar_events_start_time".to_string(), table_name: "external_calendar_events".to_string(), columns: vec!["start_time".to_string()], is_unique: false }, IndexInfo { name: "idx_external_calendar_events_unique".to_string(), table_name: "external_calendar_events".to_string(), columns: vec!["connection_id".to_string(), "external_event_id".to_string()], is_unique: true } ], triggers: vec![] });

    schemas.push(TableSchema { name: "public_holidays".to_string(), columns: vec![ ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true }, ColumnInfo { name: "country_code".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "holiday_name".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "holiday_date".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false }, ColumnInfo { name: "is_national".to_string(), data_type: "BOOLEAN".to_string(), is_nullable: false, default_value: Some("true".to_string()), is_primary_key: false }, ColumnInfo { name: "description".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false }, ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("''".to_string()), is_primary_key: false }, ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("''".to_string()), is_primary_key: false } ], indexes: vec![ IndexInfo { name: "idx_public_holidays_country_date".to_string(), table_name: "public_holidays".to_string(), columns: vec!["country_code".to_string(), "holiday_date".to_string()], is_unique: false }, IndexInfo { name: "idx_public_holidays_date".to_string(), table_name: "public_holidays".to_string(), columns: vec!["holiday_date".to_string()], is_unique: false } ], triggers: vec![] });

    // AI Chat Tables
    schemas.push(TableSchema {
        name: "chat_sessions".to_string(),
        columns: vec![
            ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
            ColumnInfo { name: "user_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "title".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "updated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "message_count".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false },
            ColumnInfo { name: "last_message_at".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
        ],
        indexes: vec![
            IndexInfo { name: "idx_chat_sessions_user_id".to_string(), table_name: "chat_sessions".to_string(), columns: vec!["user_id".to_string()], is_unique: false },
            IndexInfo { name: "idx_chat_sessions_updated_at".to_string(), table_name: "chat_sessions".to_string(), columns: vec!["updated_at".to_string()], is_unique: false },
        ],
        triggers: vec![],
    });

    schemas.push(TableSchema {
        name: "chat_messages".to_string(),
        columns: vec![
            ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
            ColumnInfo { name: "session_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "role".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "content".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "context_vectors".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "token_count".to_string(), data_type: "INTEGER".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
        ],
        indexes: vec![
            IndexInfo { name: "idx_chat_messages_session_id".to_string(), table_name: "chat_messages".to_string(), columns: vec!["session_id".to_string()], is_unique: false },
            IndexInfo { name: "idx_chat_messages_created_at".to_string(), table_name: "chat_messages".to_string(), columns: vec!["created_at".to_string()], is_unique: false },
        ],
        triggers: vec![],
    });

    // AI Insights Tables
    schemas.push(TableSchema {
        name: "ai_insights".to_string(),
        columns: vec![
            ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
            ColumnInfo { name: "user_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "time_range".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "insight_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "content".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "key_findings".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "recommendations".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "data_sources".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "confidence_score".to_string(), data_type: "REAL".to_string(), is_nullable: false, default_value: Some("0.0".to_string()), is_primary_key: false },
            ColumnInfo { name: "generated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "expires_at".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "metadata".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
        ],
        indexes: vec![
            IndexInfo { name: "idx_ai_insights_user_id".to_string(), table_name: "ai_insights".to_string(), columns: vec!["user_id".to_string()], is_unique: false },
            IndexInfo { name: "idx_ai_insights_time_range".to_string(), table_name: "ai_insights".to_string(), columns: vec!["time_range".to_string()], is_unique: false },
            IndexInfo { name: "idx_ai_insights_type".to_string(), table_name: "ai_insights".to_string(), columns: vec!["insight_type".to_string()], is_unique: false },
            IndexInfo { name: "idx_ai_insights_generated_at".to_string(), table_name: "ai_insights".to_string(), columns: vec!["generated_at".to_string()], is_unique: false },
            IndexInfo { name: "idx_ai_insights_expires_at".to_string(), table_name: "ai_insights".to_string(), columns: vec!["expires_at".to_string()], is_unique: false },
        ],
        triggers: vec![],
    });

    schemas.push(TableSchema {
        name: "insight_generation_tasks".to_string(),
        columns: vec![
            ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
            ColumnInfo { name: "user_id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "time_range".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "insight_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "status".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("'pending'".to_string()), is_primary_key: false },
            ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
            ColumnInfo { name: "started_at".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "completed_at".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "error_message".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "result_insight_id".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
        ],
        indexes: vec![
            IndexInfo { name: "idx_insight_tasks_user_id".to_string(), table_name: "insight_generation_tasks".to_string(), columns: vec!["user_id".to_string()], is_unique: false },
            IndexInfo { name: "idx_insight_tasks_status".to_string(), table_name: "insight_generation_tasks".to_string(), columns: vec!["status".to_string()], is_unique: false },
            IndexInfo { name: "idx_insight_tasks_created_at".to_string(), table_name: "insight_generation_tasks".to_string(), columns: vec!["created_at".to_string()], is_unique: false },
        ],
        triggers: vec![],
    });

    // AI Reports Tables
    schemas.push(TableSchema {
        name: "ai_reports".to_string(),
        columns: vec![
            ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
            ColumnInfo { name: "time_range".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "report_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "title".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "summary".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "analytics".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "insights".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "trades".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "recommendations".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "patterns".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "risk_metrics".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "performance_metrics".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "behavioral_insights".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "market_analysis".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "generated_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "expires_at".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "metadata".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
        ],
        indexes: vec![
            IndexInfo { name: "idx_ai_reports_time_range".to_string(), table_name: "ai_reports".to_string(), columns: vec!["time_range".to_string()], is_unique: false },
            IndexInfo { name: "idx_ai_reports_type".to_string(), table_name: "ai_reports".to_string(), columns: vec!["report_type".to_string()], is_unique: false },
            IndexInfo { name: "idx_ai_reports_generated_at".to_string(), table_name: "ai_reports".to_string(), columns: vec!["generated_at".to_string()], is_unique: false },
            IndexInfo { name: "idx_ai_reports_expires_at".to_string(), table_name: "ai_reports".to_string(), columns: vec!["expires_at".to_string()], is_unique: false },
        ],
        triggers: vec![],
    });

    schemas.push(TableSchema {
        name: "report_generation_tasks".to_string(),
        columns: vec![
            ColumnInfo { name: "id".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: true },
            ColumnInfo { name: "time_range".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "report_type".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: None, is_primary_key: false },
            ColumnInfo { name: "status".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("'pending'".to_string()), is_primary_key: false },
            ColumnInfo { name: "progress_percentage".to_string(), data_type: "INTEGER".to_string(), is_nullable: false, default_value: Some("0".to_string()), is_primary_key: false },
            ColumnInfo { name: "created_at".to_string(), data_type: "TEXT".to_string(), is_nullable: false, default_value: Some("(datetime('now'))".to_string()), is_primary_key: false },
            ColumnInfo { name: "started_at".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "completed_at".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "error_message".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
            ColumnInfo { name: "result_report_id".to_string(), data_type: "TEXT".to_string(), is_nullable: true, default_value: None, is_primary_key: false },
        ],
        indexes: vec![
            IndexInfo { name: "idx_report_tasks_status".to_string(), table_name: "report_generation_tasks".to_string(), columns: vec!["status".to_string()], is_unique: false },
            IndexInfo { name: "idx_report_tasks_created_at".to_string(), table_name: "report_generation_tasks".to_string(), columns: vec!["created_at".to_string()], is_unique: false },
        ],
        triggers: vec![],
    });

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
    create_sql.push(')');
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
    
    // Add missing columns
    for expected_col in &table_schema.columns {
        if !current_columns.iter().any(|c| c.name == expected_col.name) {
            let mut alter_sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table_schema.name, expected_col.name, expected_col.data_type);
            
            // For NOT NULL columns without explicit defaults, provide appropriate defaults
            if !expected_col.is_nullable {
                if let Some(default) = &expected_col.default_value {
                    alter_sql.push_str(&format!(" NOT NULL DEFAULT {}", default));
                } else {
                    // Provide default values for NOT NULL columns based on data type
                    match expected_col.data_type.to_uppercase().as_str() {
                        "TEXT" | "VARCHAR" => alter_sql.push_str(" NOT NULL DEFAULT ''"),
                        "INTEGER" => alter_sql.push_str(" NOT NULL DEFAULT 0"),
                        "REAL" | "DECIMAL" => alter_sql.push_str(" NOT NULL DEFAULT 0.0"),
                        "BOOLEAN" => alter_sql.push_str(" NOT NULL DEFAULT false"),
                        "DATE" => alter_sql.push_str(" NOT NULL DEFAULT '1970-01-01'"),
                        "TIME" => alter_sql.push_str(" NOT NULL DEFAULT '00:00:00'"),
                        _ => alter_sql.push_str(" NOT NULL DEFAULT ''"),
                    }
                }
            } else if let Some(default) = &expected_col.default_value {
                alter_sql.push_str(&format!(" DEFAULT {}", default));
            }
            
            conn.execute(&alter_sql, libsql::params![]).await?;
        }
    }
    
    // Remove columns that are not in the expected schema
    let expected_names: std::collections::HashSet<String> = table_schema.columns.iter().map(|c| c.name.clone()).collect();
    let columns_to_remove: Vec<String> = current_columns.iter()
        .filter(|c| !expected_names.contains(&c.name) && !c.is_primary_key)
        .map(|c| c.name.clone())
        .collect();
    
    if !columns_to_remove.is_empty() {
        log::info!("Removing obsolete columns from {}: {:?}", table_schema.name, columns_to_remove);
        
        // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
        // First, create a backup of existing data
        let backup_table = format!("{}_backup", table_schema.name);
        conn.execute(&format!("CREATE TABLE {} AS SELECT * FROM {}", backup_table, table_schema.name), libsql::params![]).await?;
        
        // Drop the original table
        conn.execute(&format!("DROP TABLE {}", table_schema.name), libsql::params![]).await?;
        
        // Recreate the table with the correct schema
        create_table(conn, table_schema).await?;
        
        // Copy data back (only for columns that exist in both schemas)
        let common_columns: Vec<String> = current_columns.iter()
            .filter(|c| expected_names.contains(&c.name))
            .map(|c| c.name.clone())
            .collect();
        
        if !common_columns.is_empty() {
            let columns_str = common_columns.join(", ");
            conn.execute(&format!("INSERT INTO {} ({}) SELECT {} FROM {}", 
                table_schema.name, columns_str, columns_str, backup_table), libsql::params![]).await?;
        }
        
        // Drop the backup table
        conn.execute(&format!("DROP TABLE {}", backup_table), libsql::params![]).await?;
        
        // Recreate indexes and triggers
        ensure_indexes(conn, table_schema).await?;
        ensure_triggers(conn, table_schema).await?;
    }
    
    Ok(())
}


