use chrono::{DateTime, Utc};
use libsql::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Playbook setup for trading strategies
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playbook {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Data Transfer Object for creating new playbook setups
#[derive(Debug, Serialize, Deserialize)]
pub struct CreatePlaybookRequest {
    pub name: String,
    pub description: Option<String>,
}

/// Data Transfer Object for updating playbook setups
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdatePlaybookRequest {
    pub name: Option<String>,
    pub description: Option<String>,
}

/// Playbook query parameters for filtering and pagination
#[derive(Debug, Serialize, Deserialize)]
pub struct PlaybookQuery {
    pub name: Option<String>,
    pub search: Option<String>, // Search in both name and description
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Stock trade playbook association
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StockTradePlaybook {
    pub stock_trade_id: i64,
    pub setup_id: String,
    pub created_at: DateTime<Utc>,
}

/// Option trade playbook association
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionTradePlaybook {
    pub option_trade_id: i64,
    pub setup_id: String,
    pub created_at: DateTime<Utc>,
}

/// Data Transfer Object for tagging trades with playbook setups
#[derive(Debug, Serialize, Deserialize)]
pub struct TagTradeRequest {
    pub trade_id: i64,
    pub setup_id: String,
    pub trade_type: TradeType,
}

/// Trade type enum for tagging
#[derive(Debug, Serialize, Deserialize)]
pub enum TradeType {
    #[serde(rename = "stock")]
    Stock,
    #[serde(rename = "option")]
    Option,
}

/// Playbook operations implementation using libsql
impl Playbook {
    /// Create a new playbook setup in the user's database
    pub async fn create(
        conn: &Connection,
        request: CreatePlaybookRequest,
    ) -> Result<Playbook, Box<dyn std::error::Error + Send + Sync>> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO playbook (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            libsql::params![
                id,
                request.name,
                request.description,
                now,
                now
            ],
        ).await?;

        Self::find_by_id(conn, &id).await
    }

    /// Find a playbook by ID
    pub async fn find_by_id(
        conn: &Connection,
        playbook_id: &str,
    ) -> Result<Option<Playbook>, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare("SELECT id, name, description, created_at, updated_at FROM playbook WHERE id = ?")
            .await?
            .query(libsql::params![playbook_id])
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(Self::from_row(row)?))
        } else {
            Ok(None)
        }
    }

    /// Find all playbooks with optional filtering
    pub async fn find_all(
        conn: &Connection,
        query: PlaybookQuery,
    ) -> Result<Vec<Playbook>, Box<dyn std::error::Error + Send + Sync>> {
        let mut sql = "SELECT id, name, description, created_at, updated_at FROM playbook".to_string();
        let mut params = Vec::new();
        let mut conditions = Vec::new();

        if let Some(name) = query.name {
            conditions.push("name LIKE ?");
            params.push(format!("%{}%", name));
        }

        if let Some(search) = query.search {
            conditions.push("(name LIKE ? OR description LIKE ?)");
            params.push(format!("%{}%", search));
            params.push(format!("%{}%", search));
        }

        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }

        sql.push_str(" ORDER BY updated_at DESC, name");

        if let Some(limit) = query.limit {
            sql.push_str(" LIMIT ?");
            params.push(limit.to_string());
        }

        if let Some(offset) = query.offset {
            sql.push_str(" OFFSET ?");
            params.push(offset.to_string());
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(params))
            .await?;

        let mut playbooks = Vec::new();
        while let Some(row) = rows.next().await? {
            playbooks.push(Self::from_row(row)?);
        }

        Ok(playbooks)
    }

    /// Update a playbook setup
    pub async fn update(
        conn: &Connection,
        playbook_id: &str,
        request: UpdatePlaybookRequest,
    ) -> Result<Option<Playbook>, Box<dyn std::error::Error + Send + Sync>> {
        let mut set_clauses = Vec::new();
        let mut params = Vec::new();

        if let Some(name) = request.name {
            set_clauses.push("name = ?");
            params.push(name);
        }

        if let Some(description) = request.description {
            set_clauses.push("description = ?");
            params.push(description);
        }

        if set_clauses.is_empty() {
            return Self::find_by_id(conn, playbook_id).await;
        }

        set_clauses.push("updated_at = ?");
        params.push(Utc::now().to_rfc3339());
        params.push(playbook_id.to_string());

        let sql = format!(
            "UPDATE playbook SET {} WHERE id = ?",
            set_clauses.join(", ")
        );

        conn.execute(&sql, libsql::params_from_iter(params)).await?;
        Self::find_by_id(conn, playbook_id).await
    }

    /// Delete a playbook setup
    pub async fn delete(
        conn: &Connection,
        playbook_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let result = conn
            .execute("DELETE FROM playbook WHERE id = ?", libsql::params![playbook_id])
            .await?;
        
        Ok(result > 0)
    }

    /// Count playbooks with optional filtering
    pub async fn count(
        conn: &Connection,
        query: &PlaybookQuery,
    ) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
        let mut sql = "SELECT COUNT(*) FROM playbook".to_string();
        let mut params = Vec::new();
        let mut conditions = Vec::new();

        if let Some(name) = &query.name {
            conditions.push("name LIKE ?");
            params.push(format!("%{}%", name));
        }

        if let Some(search) = &query.search {
            conditions.push("(name LIKE ? OR description LIKE ?)");
            params.push(format!("%{}%", search));
            params.push(format!("%{}%", search));
        }

        if !conditions.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&conditions.join(" AND "));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get(0)?)
        } else {
            Ok(0)
        }
    }

    /// Get total count of all playbooks
    pub async fn total_count(conn: &Connection) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare("SELECT COUNT(*) FROM playbook")
            .await?
            .query(libsql::params![])
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get(0)?)
        } else {
            Ok(0)
        }
    }

    /// Check if a playbook exists
    pub async fn exists(conn: &Connection, playbook_id: &str) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare("SELECT 1 FROM playbook WHERE id = ? LIMIT 1")
            .await?
            .query(libsql::params![playbook_id])
            .await?;

        Ok(rows.next().await?.is_some())
    }

    /// Get playbooks with pagination
    pub async fn get_paginated(
        conn: &Connection,
        page: i64,
        page_size: i64,
    ) -> Result<Vec<Playbook>, Box<dyn std::error::Error + Send + Sync>> {
        let offset = (page - 1) * page_size;
        
        let mut rows = conn
            .prepare("SELECT id, name, description, created_at, updated_at FROM playbook ORDER BY updated_at DESC, name LIMIT ? OFFSET ?")
            .await?
            .query(libsql::params![page_size, offset])
            .await?;

        let mut playbooks = Vec::new();
        while let Some(row) = rows.next().await? {
            playbooks.push(Self::from_row(row)?);
        }

        Ok(playbooks)
    }

    /// Tag a stock trade with a playbook setup
    pub async fn tag_stock_trade(
        conn: &Connection,
        stock_trade_id: i64,
        setup_id: &str,
    ) -> Result<StockTradePlaybook, Box<dyn std::error::Error + Send + Sync>> {
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT OR IGNORE INTO stock_trade_playbook (stock_trade_id, setup_id, created_at) VALUES (?, ?, ?)",
            libsql::params![stock_trade_id, setup_id, now],
        ).await?;

        let mut rows = conn
            .prepare("SELECT stock_trade_id, setup_id, created_at FROM stock_trade_playbook WHERE stock_trade_id = ? AND setup_id = ?")
            .await?
            .query(libsql::params![stock_trade_id, setup_id])
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(StockTradePlaybook {
                stock_trade_id: row.get(0)?,
                setup_id: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<String>(2)?)?.with_timezone(&Utc),
            })
        } else {
            Err("Failed to create stock trade playbook association".into())
        }
    }

    /// Tag an option trade with a playbook setup
    pub async fn tag_option_trade(
        conn: &Connection,
        option_trade_id: i64,
        setup_id: &str,
    ) -> Result<OptionTradePlaybook, Box<dyn std::error::Error + Send + Sync>> {
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT OR IGNORE INTO option_trade_playbook (option_trade_id, setup_id, created_at) VALUES (?, ?, ?)",
            libsql::params![option_trade_id, setup_id, now],
        ).await?;

        let mut rows = conn
            .prepare("SELECT option_trade_id, setup_id, created_at FROM option_trade_playbook WHERE option_trade_id = ? AND setup_id = ?")
            .await?
            .query(libsql::params![option_trade_id, setup_id])
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(OptionTradePlaybook {
                option_trade_id: row.get(0)?,
                setup_id: row.get(1)?,
                created_at: DateTime::parse_from_rfc3339(&row.get::<String>(2)?)?.with_timezone(&Utc),
            })
        } else {
            Err("Failed to create option trade playbook association".into())
        }
    }

    /// Remove a playbook tag from a stock trade
    pub async fn untag_stock_trade(
        conn: &Connection,
        stock_trade_id: i64,
        setup_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let result = conn
            .execute(
                "DELETE FROM stock_trade_playbook WHERE stock_trade_id = ? AND setup_id = ?",
                libsql::params![stock_trade_id, setup_id],
            )
            .await?;
        
        Ok(result > 0)
    }

    /// Remove a playbook tag from an option trade
    pub async fn untag_option_trade(
        conn: &Connection,
        option_trade_id: i64,
        setup_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let result = conn
            .execute(
                "DELETE FROM option_trade_playbook WHERE option_trade_id = ? AND setup_id = ?",
                libsql::params![option_trade_id, setup_id],
            )
            .await?;
        
        Ok(result > 0)
    }

    /// Get all playbook setups for a stock trade
    pub async fn get_stock_trade_playbooks(
        conn: &Connection,
        stock_trade_id: i64,
    ) -> Result<Vec<Playbook>, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare(
                "SELECT p.id, p.name, p.description, p.created_at, p.updated_at 
                 FROM playbook p 
                 INNER JOIN stock_trade_playbook stp ON p.id = stp.setup_id 
                 WHERE stp.stock_trade_id = ? 
                 ORDER BY p.name"
            )
            .await?
            .query(libsql::params![stock_trade_id])
            .await?;

        let mut playbooks = Vec::new();
        while let Some(row) = rows.next().await? {
            playbooks.push(Self::from_row(row)?);
        }

        Ok(playbooks)
    }

    /// Get all playbook setups for an option trade
    pub async fn get_option_trade_playbooks(
        conn: &Connection,
        option_trade_id: i64,
    ) -> Result<Vec<Playbook>, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare(
                "SELECT p.id, p.name, p.description, p.created_at, p.updated_at 
                 FROM playbook p 
                 INNER JOIN option_trade_playbook otp ON p.id = otp.setup_id 
                 WHERE otp.option_trade_id = ? 
                 ORDER BY p.name"
            )
            .await?
            .query(libsql::params![option_trade_id])
            .await?;

        let mut playbooks = Vec::new();
        while let Some(row) = rows.next().await? {
            playbooks.push(Self::from_row(row)?);
        }

        Ok(playbooks)
    }

    /// Get all trades tagged with a specific playbook setup
    pub async fn get_playbook_trades(
        conn: &Connection,
        setup_id: &str,
    ) -> Result<(Vec<i64>, Vec<i64>), Box<dyn std::error::Error + Send + Sync>> {
        // Get stock trades
        let mut stock_rows = conn
            .prepare("SELECT stock_trade_id FROM stock_trade_playbook WHERE setup_id = ?")
            .await?
            .query(libsql::params![setup_id])
            .await?;

        let mut stock_trades = Vec::new();
        while let Some(row) = stock_rows.next().await? {
            stock_trades.push(row.get(0)?);
        }

        // Get option trades
        let mut option_rows = conn
            .prepare("SELECT option_trade_id FROM option_trade_playbook WHERE setup_id = ?")
            .await?
            .query(libsql::params![setup_id])
            .await?;

        let mut option_trades = Vec::new();
        while let Some(row) = option_rows.next().await? {
            option_trades.push(row.get(0)?);
        }

        Ok((stock_trades, option_trades))
    }

    /// Helper method to convert database row to Playbook struct
    fn from_row(row: &libsql::Row) -> Result<Playbook, Box<dyn std::error::Error + Send + Sync>> {
        Ok(Playbook {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            created_at: DateTime::parse_from_rfc3339(&row.get::<String>(3)?)?.with_timezone(&Utc),
            updated_at: DateTime::parse_from_rfc3339(&row.get::<String>(4)?)?.with_timezone(&Utc),
        })
    }
}
