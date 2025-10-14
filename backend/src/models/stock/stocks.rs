use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use libsql::{Connection, params};

/// Time range enum for calculations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TimeRange {
    #[serde(rename = "7d")]
    SevenDays,
    #[serde(rename = "30d")]
    ThirtyDays,
    #[serde(rename = "90d")]
    NinetyDays,
    #[serde(rename = "1y")]
    OneYear,
    #[serde(rename = "ytd")]
    YearToDate,
    #[serde(rename = "custom")]
    Custom { start_date: Option<DateTime<Utc>>, end_date: Option<DateTime<Utc>> },
    #[serde(rename = "all_time")]
    AllTime,
}

impl TimeRange {
    /// Convert TimeRange to SQL WHERE clause fragment
    pub fn to_sql_condition(&self) -> (String, Vec<DateTime<Utc>>) {
        match self {
            TimeRange::SevenDays => (
                "exit_date >= date('now', '-7 days')".to_string(),
                vec![]
            ),
            TimeRange::ThirtyDays => (
                "exit_date >= date('now', '-30 days')".to_string(),
                vec![]
            ),
            TimeRange::NinetyDays => (
                "exit_date >= date('now', '-90 days')".to_string(),
                vec![]
            ),
            TimeRange::OneYear => (
                "exit_date >= date('now', '-1 year')".to_string(),
                vec![]
            ),
            TimeRange::YearToDate => (
                "exit_date >= date('now', 'start of year')".to_string(),
                vec![]
            ),
            TimeRange::Custom { start_date, end_date } => {
                let mut conditions = vec![];
                let mut params = vec![];
                
                if let Some(start) = start_date {
                    conditions.push("exit_date >= ?".to_string());
                    params.push(*start);
                }
                
                if let Some(end) = end_date {
                    conditions.push("exit_date <= ?".to_string());
                    params.push(*end);
                }
                
                if conditions.is_empty() {
                    ("1=1".to_string(), params)
                } else {
                    (conditions.join(" AND "), params)
                }
            },
            TimeRange::AllTime => ("1=1".to_string(), vec![]),
        }
    }
}

/// Trade type enum matching the PostgreSQL enum in your schema
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum TradeType {
    BUY,
    SELL,
}

impl std::fmt::Display for TradeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TradeType::BUY => write!(f, "BUY"),
            TradeType::SELL => write!(f, "SELL"),
        }
    }
}

impl std::str::FromStr for TradeType {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "BUY" => Ok(TradeType::BUY),
            "SELL" => Ok(TradeType::SELL),
            _ => Err("Invalid trade type"),
        }
    }
}

/// Order type enum matching the PostgreSQL enum in your schema
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum OrderType {
    MARKET,
    LIMIT,
    STOP,
    #[serde(rename = "STOP_LIMIT")]
    StopLimit,
}

impl std::fmt::Display for OrderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OrderType::MARKET => write!(f, "MARKET"),
            OrderType::LIMIT => write!(f, "LIMIT"),
            OrderType::STOP => write!(f, "STOP"),
            OrderType::StopLimit => write!(f, "STOP_LIMIT"),
        }
    }
}

impl std::str::FromStr for OrderType {
    type Err = &'static str;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_uppercase().as_str() {
            "MARKET" => Ok(OrderType::MARKET),
            "LIMIT" => Ok(OrderType::LIMIT),
            "STOP" => Ok(OrderType::STOP),
            "STOP_LIMIT" => Ok(OrderType::StopLimit),
            _ => Err("Invalid order type"),
        }
    }
}

/// Stock trade model for user's isolated database
/// No user_id needed since each user has their own database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stock {
    pub id: i64,
    pub symbol: String,
    pub trade_type: TradeType,
    pub order_type: OrderType,
    pub entry_price: f64,
    pub exit_price: Option<f64>,
    pub stop_loss: f64,
    pub commissions: f64,
    pub number_shares: f64,
    pub take_profit: Option<f64>,
    pub entry_date: DateTime<Utc>,
    pub exit_date: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Data Transfer Object for creating new stock trades
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateStockRequest {
    pub symbol: String,
    pub trade_type: TradeType,
    pub order_type: OrderType,
    pub entry_price: f64,
    pub stop_loss: f64,
    pub commissions: f64,
    pub number_shares: f64,
    pub take_profit: Option<f64>,
    pub entry_date: DateTime<Utc>,
}

/// Data Transfer Object for updating stock trades
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateStockRequest {
    pub symbol: Option<String>,
    pub trade_type: Option<TradeType>,
    pub order_type: Option<OrderType>,
    pub entry_price: Option<f64>,
    pub exit_price: Option<f64>,
    pub stop_loss: Option<f64>,
    pub commissions: Option<f64>,
    pub number_shares: Option<f64>,
    pub take_profit: Option<f64>,
    pub entry_date: Option<DateTime<Utc>>,
    pub exit_date: Option<DateTime<Utc>>,
}

/// Stock query parameters for filtering and pagination
#[derive(Debug, Serialize, Deserialize)]
pub struct StockQuery {
    pub symbol: Option<String>,
    pub trade_type: Option<TradeType>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub updated_after: Option<DateTime<Utc>>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Stock operations implementation using LibSQL
impl Stock {
    fn get_f64(row: &libsql::Row, idx: usize) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let i = idx as i32;
        // Try as f64
        if let Ok(v) = row.get::<f64>(i) {
            return Ok(v);
        }
        // Try as Option<f64>
        if let Ok(v) = row.get::<Option<f64>>(i) {
            return Ok(v.unwrap_or(0.0));
        }
        // Try as i64
        if let Ok(v) = row.get::<i64>(i) {
            return Ok(v as f64);
        }
        // Try as Option<i64>
        if let Ok(v) = row.get::<Option<i64>>(i) {
            return Ok(v.unwrap_or(0) as f64);
        }
        // Try as String
        if let Ok(s) = row.get::<String>(i) {
            if let Ok(parsed) = s.parse::<f64>() {
                return Ok(parsed);
            }
        }
        // Fallback to 0.0
        Ok(0.0)
    }

    fn get_opt_f64(row: &libsql::Row, idx: usize) -> Result<Option<f64>, Box<dyn std::error::Error + Send + Sync>> {
        let i = idx as i32;
        // Try Option<f64>
        if let Ok(v) = row.get::<Option<f64>>(i) {
            return Ok(v);
        }
        // Try f64
        if let Ok(v) = row.get::<f64>(i) {
            return Ok(Some(v));
        }
        // Try Option<i64>
        if let Ok(v) = row.get::<Option<i64>>(i) {
            return Ok(v.map(|x| x as f64));
        }
        // Try i64
        if let Ok(v) = row.get::<i64>(i) {
            return Ok(Some(v as f64));
        }
        // Try String
        if let Ok(s) = row.get::<String>(i) {
            if let Ok(parsed) = s.parse::<f64>() {
                return Ok(Some(parsed));
            }
        }
        Ok(None)
    }
    /// Create a new stock trade in the user's database
    pub async fn create(
        conn: &Connection,
        request: CreateStockRequest,
    ) -> Result<Stock, Box<dyn std::error::Error + Send + Sync>> {
        let now = Utc::now().to_rfc3339();
        
        let mut rows = conn.prepare(
            r#"
            INSERT INTO stocks (
                symbol, trade_type, order_type, entry_price, 
                stop_loss, commissions, number_shares, take_profit, 
                entry_date, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id, symbol, trade_type, order_type, entry_price,
                     exit_price, stop_loss, commissions, number_shares, take_profit,
                     entry_date, exit_date, created_at, updated_at
            "#,
        )
        .await?
        .query(params![
            request.symbol,
            request.trade_type.to_string(),
            request.order_type.to_string(),
            request.entry_price,
            request.stop_loss,
            request.commissions,
            request.number_shares,
            request.take_profit,
            request.entry_date.to_rfc3339(),
            now.clone(),
            now
        ])
        .await?;

        if let Some(row) = rows.next().await? {
        Ok(Stock::from_row(&row)?)
        } else {
            Err("Failed to create stock trade".into())
        }
    }

    /// Find a stock trade by ID in the user's database
    pub async fn find_by_id(
        conn: &Connection,
        stock_id: i64,
    ) -> Result<Option<Stock>, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare(
            r#"
            SELECT id, symbol, trade_type, order_type, entry_price,
                   exit_price, stop_loss, commissions, number_shares, take_profit,
                   entry_date, exit_date, created_at, updated_at
            FROM stocks 
            WHERE id = ?
            "#,
        )
            .await?
            .query(params![stock_id])
        .await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(Stock::from_row(&row)?))
        } else {
            Ok(None)
        }
    }

    /// Find all stock trades with optional filtering
    pub async fn find_all(
        conn: &Connection,
        query: StockQuery,
    ) -> Result<Vec<Stock>, Box<dyn std::error::Error + Send + Sync>> {
        let mut sql = String::from(
            r#"
            SELECT id, symbol, trade_type, order_type, entry_price,
                   exit_price, stop_loss, commissions, number_shares, take_profit,
                   entry_date, exit_date, created_at, updated_at
            FROM stocks 
            WHERE 1=1
            "#,
        );
        
        let mut query_params = Vec::new();
        
        // Add optional filters
        if let Some(symbol) = &query.symbol {
            sql.push_str(" AND symbol = ?");
            query_params.push(libsql::Value::Text(symbol.clone()));
        }
        
        if let Some(trade_type) = &query.trade_type {
            sql.push_str(" AND trade_type = ?");
            query_params.push(libsql::Value::Text(trade_type.to_string()));
        }
        
        if let Some(start_date) = query.start_date {
            sql.push_str(" AND entry_date >= ?");
            query_params.push(libsql::Value::Text(start_date.to_rfc3339()));
        }
        
        if let Some(end_date) = query.end_date {
            sql.push_str(" AND entry_date <= ?");
            query_params.push(libsql::Value::Text(end_date.to_rfc3339()));
        }

        if let Some(updated_after) = query.updated_after {
            sql.push_str(" AND updated_at >= ?");
            query_params.push(libsql::Value::Text(updated_after.to_rfc3339()));
        }

        sql.push_str(" ORDER BY entry_date DESC");

        // Add pagination
        if let Some(limit) = query.limit {
            sql.push_str(" LIMIT ?");
            query_params.push(libsql::Value::Integer(limit));
        }
        
        if let Some(offset) = query.offset {
            sql.push_str(" OFFSET ?");
            query_params.push(libsql::Value::Integer(offset));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        let mut stocks = Vec::new();
        while let Some(row) = rows.next().await? {
            stocks.push(Stock::from_row(&row)?);
        }

        Ok(stocks)
    }

    /// Update a stock trade
    pub async fn update(
        conn: &Connection,
        stock_id: i64,
        request: UpdateStockRequest,
    ) -> Result<Option<Stock>, Box<dyn std::error::Error + Send + Sync>> {
        // Check if stock exists first
        let current_stock = Self::find_by_id(conn, stock_id).await?;
        
        if current_stock.is_none() {
            return Ok(None);
        }

        let now = Utc::now().to_rfc3339();

        let mut rows = conn
            .prepare(
            r#"
            UPDATE stocks SET 
                symbol = COALESCE(?, symbol),
                trade_type = COALESCE(?, trade_type),
                order_type = COALESCE(?, order_type),
                entry_price = COALESCE(?, entry_price),
                exit_price = COALESCE(?, exit_price),
                stop_loss = COALESCE(?, stop_loss),
                commissions = COALESCE(?, commissions),
                number_shares = COALESCE(?, number_shares),
                take_profit = COALESCE(?, take_profit),
                entry_date = COALESCE(?, entry_date),
                exit_date = COALESCE(?, exit_date),
                updated_at = ?
            WHERE id = ?
            RETURNING id, symbol, trade_type, order_type, entry_price,
                     exit_price, stop_loss, commissions, number_shares, take_profit,
                     entry_date, exit_date, created_at, updated_at
            "#,
        )
            .await?
            .query(params![
                request.symbol,
                request.trade_type.map(|t| t.to_string()),
                request.order_type.map(|t| t.to_string()),
                request.entry_price,
                request.exit_price,
                request.stop_loss,
                request.commissions,
                request.number_shares,
                request.take_profit,
                request.entry_date.map(|d| d.to_rfc3339()),
                request.exit_date.map(|d| d.to_rfc3339()),
                now,
                stock_id
            ])
        .await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(Stock::from_row(&row)?))
        } else {
            Ok(None)
        }
    }

    /// Delete a stock trade
    pub async fn delete(
        conn: &Connection,
        stock_id: i64,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let result = conn
            .execute("DELETE FROM stocks WHERE id = ?", params![stock_id])
        .await?;

        Ok(result > 0)
    }

    /// Get total count of stocks (for pagination)
    pub async fn count(
        conn: &Connection,
        query: &StockQuery,
    ) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
        let mut sql = String::from("SELECT COUNT(*) FROM stocks WHERE 1=1");
        let mut query_params = Vec::new();
        
        // Add the same filters as in find_all
        if let Some(symbol) = &query.symbol {
            sql.push_str(" AND symbol = ?");
            query_params.push(libsql::Value::Text(symbol.clone()));
        }
        
        if let Some(trade_type) = &query.trade_type {
            sql.push_str(" AND trade_type = ?");
            query_params.push(libsql::Value::Text(trade_type.to_string()));
        }
        
        if let Some(start_date) = query.start_date {
            sql.push_str(" AND entry_date >= ?");
            query_params.push(libsql::Value::Text(start_date.to_rfc3339()));
        }
        
        if let Some(end_date) = query.end_date {
            sql.push_str(" AND entry_date <= ?");
            query_params.push(libsql::Value::Text(end_date.to_rfc3339()));
        }

        if let Some(updated_after) = query.updated_after {
            sql.push_str(" AND updated_at >= ?");
            query_params.push(libsql::Value::Text(updated_after.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<i64>(0)?)
        } else {
            Ok(0)
        }
    }

    /// Calculations here
    /// Calculate total P&L for all stocks in the user's database 
    pub async fn calculate_total_pnl(
        conn: &Connection,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare(
            r#"
            SELECT SUM(
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        CASE 
                            WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                            WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                        END
                    ELSE 0
                END
            ) as total_pnl
            FROM stocks
            "#,
        )
            .await?
            .query(params![])
        .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Calculate profit factor (gross profit / gross loss)
    pub async fn calculate_profit_factor(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            WITH trade_profits AS (
                SELECT
                    CASE
                        WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
                        WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
                    END AS profit
                FROM stocks
                WHERE exit_date IS NOT NULL 
                  AND exit_price IS NOT NULL
                  AND ({})
            ),
            profit_metrics AS (
                SELECT
                    SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END) AS gross_profit,
                    ABS(SUM(CASE WHEN profit < 0 THEN profit ELSE 0 END)) AS gross_loss,
                    COUNT(*) AS total_trades
                FROM trade_profits
            )
            SELECT
                CASE
                    WHEN total_trades = 0 THEN 0
                    WHEN gross_loss = 0 AND gross_profit > 0 THEN 999.99
                    WHEN gross_loss = 0 THEN 0
                    ELSE ROUND(gross_profit / gross_loss, 2)
                END AS profit_factor
            FROM profit_metrics
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Calculate win rate percentage
    pub async fn calculate_win_rate(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            WITH trade_results AS (
                SELECT
                    CASE
                        WHEN (trade_type = 'BUY' AND exit_price > entry_price) OR
                             (trade_type = 'SELL' AND exit_price < entry_price) THEN 1
                        ELSE 0
                    END AS is_winning_trade
                FROM stocks
                WHERE exit_date IS NOT NULL
                  AND exit_price IS NOT NULL
                  AND entry_price IS NOT NULL
                  AND ({})
            ),
            win_rate_stats AS (
                SELECT
                    COUNT(*) AS total_trades,
                    SUM(is_winning_trade) AS winning_trades
                FROM trade_results
            )
            SELECT
                CASE
                    WHEN total_trades = 0 THEN 0
                    ELSE ROUND((CAST(winning_trades AS REAL) / CAST(total_trades AS REAL)) * 100, 2)
                END AS win_rate_percentage
            FROM win_rate_stats
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Calculate average hold time for winning trades (in days)
    pub async fn calculate_avg_hold_time_winners(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            SELECT 
                COALESCE(ROUND(AVG(
                    (julianday(exit_date) - julianday(entry_date))
                ), 2), 0) as avg_hold_days
            FROM stocks
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND (
                  (trade_type = 'BUY' AND exit_price > entry_price) OR
                  (trade_type = 'SELL' AND exit_price < entry_price)
              )
              AND ({})
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Calculate average hold time for losing trades (in days)
    pub async fn calculate_avg_hold_time_losers(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            SELECT 
                COALESCE(ROUND(AVG(
                    (julianday(exit_date) - julianday(entry_date))
                ), 2), 0) as avg_hold_days
            FROM stocks
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND (
                  (trade_type = 'BUY' AND exit_price < entry_price) OR
                  (trade_type = 'SELL' AND exit_price > entry_price)
              )
              AND ({})
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Get biggest winner (highest profit trade)
    pub async fn calculate_biggest_winner(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            SELECT 
                COALESCE(MAX(
                    CASE 
                        WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                        WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
                    END
                ), 0) as biggest_winner
            FROM stocks
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND (
                  (trade_type = 'BUY' AND exit_price > entry_price) OR
                  (trade_type = 'SELL' AND exit_price < entry_price)
              )
              AND ({})
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Get biggest loser (largest loss trade)
    pub async fn calculate_biggest_loser(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            SELECT 
                COALESCE(MIN(
                    CASE 
                        WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                        WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
                    END
                ), 0) as biggest_loser
            FROM stocks
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND (
                  (trade_type = 'BUY' AND exit_price < entry_price) OR
                  (trade_type = 'SELL' AND exit_price > entry_price)
              )
              AND ({})
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Calculate average gain for winning trades
    pub async fn calculate_avg_gain(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            SELECT 
                COALESCE(ROUND(AVG(
                    CASE 
                        WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                        WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
                    END
                ), 2), 0) as avg_gain
            FROM stocks
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND (
                  (trade_type = 'BUY' AND exit_price > entry_price) OR
                  (trade_type = 'SELL' AND exit_price < entry_price)
              )
              AND ({})
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Calculate average loss for losing trades
    pub async fn calculate_avg_loss(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            SELECT 
                COALESCE(ROUND(AVG(
                    CASE 
                        WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                        WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
                    END
                ), 2), 0) as avg_loss
            FROM stocks
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND (
                  (trade_type = 'BUY' AND exit_price < entry_price) OR
                  (trade_type = 'SELL' AND exit_price > entry_price)
              )
              AND ({})
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Calculate risk-reward ratio
    pub async fn calculate_risk_reward_ratio(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let avg_gain = Self::calculate_avg_gain(conn, time_range.clone()).await?;
        let avg_loss = Self::calculate_avg_loss(conn, time_range).await?;
        
        if avg_loss == 0.0 {
            Ok(0.0)
        } else {
            Ok((avg_gain / avg_loss.abs()).round())
        }
    }

    /// Calculate trade expectancy
    pub async fn calculate_trade_expectancy(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let win_rate = Self::calculate_win_rate(conn, time_range.clone()).await?;
        let avg_gain = Self::calculate_avg_gain(conn, time_range.clone()).await?;
        let avg_loss = Self::calculate_avg_loss(conn, time_range).await?;
        
        let win_rate_decimal = win_rate / 100.0; // Convert percentage to decimal
        let loss_rate_decimal = 1.0 - win_rate_decimal;
        
        let expectancy = (win_rate_decimal * avg_gain) + (loss_rate_decimal * avg_loss);
        Ok((expectancy * 100.0).round() / 100.0)
    }

    /// Calculate average position size
    pub async fn calculate_avg_position_size(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            SELECT 
                COALESCE(ROUND(AVG(entry_price * number_shares), 2), 0) as avg_position_size
            FROM stocks
            WHERE exit_date IS NOT NULL
              AND ({})
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Calculate average risk per trade (based on stop loss)
    #[allow(dead_code)]
    pub async fn calculate_avg_risk_per_trade(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            SELECT 
                COALESCE(ROUND(AVG(
                    CASE 
                        WHEN trade_type = 'BUY' THEN (entry_price - stop_loss) * number_shares
                        WHEN trade_type = 'SELL' THEN (stop_loss - entry_price) * number_shares
                    END
                ), 2), 0) as avg_risk
            FROM stocks
            WHERE stop_loss IS NOT NULL
              AND exit_date IS NOT NULL
              AND ({})
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Calculate loss rate percentage
    pub async fn calculate_loss_rate(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let win_rate = Self::calculate_win_rate(conn, time_range).await?;
        Ok((100.0 - win_rate).round())
    }

    /// Calculate net P&L for the time range
    pub async fn calculate_net_pnl(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            SELECT 
                COALESCE(SUM(
                    CASE 
                        WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, entry_price) - entry_price) * number_shares - COALESCE(commissions, 0)
                        WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, entry_price)) * number_shares - COALESCE(commissions, 0)
                    END
                ), 0) as net_pnl
            FROM stocks
            WHERE ({})
            "#,
            time_condition
        );

        let mut query_params = Vec::new();
        for param in time_params {
            query_params.push(libsql::Value::Text(param.to_rfc3339()));
        }

        let mut rows = conn
            .prepare(&sql)
            .await?
            .query(libsql::params_from_iter(query_params))
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(row.get::<Option<f64>>(0)?.unwrap_or(0.0))
        } else {
            Ok(0.0)
        }
    }

    /// Convert from libsql row to Stock struct
    /// Get playbook setups associated with this stock trade
    #[allow(dead_code)]
    pub async fn get_playbooks(
        &self,
        conn: &Connection,
    ) -> Result<Vec<crate::models::playbook::playbook::Playbook>, Box<dyn std::error::Error + Send + Sync>> {
        crate::models::playbook::playbook::Playbook::get_stock_trade_playbooks(conn, self.id).await
    }

    /// Tag this stock trade with a playbook setup
    #[allow(dead_code)]
    pub async fn tag_with_playbook(
        &self,
        conn: &Connection,
        setup_id: &str,
    ) -> Result<crate::models::playbook::playbook::StockTradePlaybook, Box<dyn std::error::Error + Send + Sync>> {
        crate::models::playbook::playbook::Playbook::tag_stock_trade(conn, self.id, setup_id).await
    }

    /// Remove a playbook tag from this stock trade
    #[allow(dead_code)]
    pub async fn untag_playbook(
        &self,
        conn: &Connection,
        setup_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        crate::models::playbook::playbook::Playbook::untag_stock_trade(conn, self.id, setup_id).await
    }

    fn from_row(row: &libsql::Row) -> Result<Stock, Box<dyn std::error::Error + Send + Sync>> {
        let trade_type_str: String = row.get(2)?;
        let order_type_str: String = row.get(3)?;
        
        let trade_type = trade_type_str.parse::<TradeType>()
            .map_err(|e| format!("Invalid trade type: {}", e))?;
            
        let order_type = order_type_str.parse::<OrderType>()
            .map_err(|e| format!("Invalid order type: {}", e))?;

        // Parse datetime strings
        let entry_date_str: String = row.get(10)?;
        let exit_date_str: Option<String> = row.get(11)?;
        let created_at_str: String = row.get(12)?;
        let updated_at_str: String = row.get(13)?;
        
        let entry_date = DateTime::parse_from_rfc3339(&entry_date_str)
            .map_err(|e| format!("Failed to parse entry_date: {}", e))?
            .with_timezone(&Utc);
            
        let exit_date = if let Some(exit_str) = exit_date_str {
            Some(DateTime::parse_from_rfc3339(&exit_str)
                .map_err(|e| format!("Failed to parse exit_date: {}", e))?
                .with_timezone(&Utc))
        } else {
            None
        };
        
        let created_at = DateTime::parse_from_rfc3339(&created_at_str)
            .map_err(|e| format!("Failed to parse created_at: {}", e))?
            .with_timezone(&Utc);
            
        let updated_at = DateTime::parse_from_rfc3339(&updated_at_str)
            .map_err(|e| format!("Failed to parse updated_at: {}", e))?
            .with_timezone(&Utc);
        
        Ok(Stock {
            id: row.get(0)?,
            symbol: row.get(1)?,
            trade_type,
            order_type,
            entry_price: Self::get_f64(row, 4)?,
            exit_price: Self::get_opt_f64(row, 5)?,
            stop_loss: Self::get_f64(row, 6)?,
            commissions: Self::get_f64(row, 7)?,
            number_shares: Self::get_f64(row, 8)?,
            take_profit: Self::get_opt_f64(row, 9)?,
            entry_date,
            exit_date,
            created_at,
            updated_at,
        })
    }
}

