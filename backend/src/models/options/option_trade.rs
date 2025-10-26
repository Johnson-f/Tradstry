use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use libsql::{Connection, params};

/// Re-use the TimeRange enum from the stock model
use crate::models::stock::stocks::TimeRange;

/// Trade status enum matching the PostgreSQL enum in your schema
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TradeStatus {
    Open,
    Closed,
}

impl std::fmt::Display for TradeStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TradeStatus::Open => write!(f, "open"),
            TradeStatus::Closed => write!(f, "closed"),
        }
    }
}

impl std::str::FromStr for TradeStatus {
    type Err = &'static str;
    
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "open" => Ok(TradeStatus::Open),
            "closed" => Ok(TradeStatus::Closed),
            _ => Err("Invalid trade status"),
        }
    }
}

/// Trade direction enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TradeDirection {
    Bullish,
    Bearish,
    Neutral,
}

impl std::fmt::Display for TradeDirection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TradeDirection::Bullish => write!(f, "Bullish"),
            TradeDirection::Bearish => write!(f, "Bearish"),
            TradeDirection::Neutral => write!(f, "Neutral"),
        }
    }
}

impl std::str::FromStr for TradeDirection {
    type Err = &'static str;
    
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Bullish" => Ok(TradeDirection::Bullish),
            "Bearish" => Ok(TradeDirection::Bearish),
            "Neutral" => Ok(TradeDirection::Neutral),
            _ => Err("Invalid trade direction"),
        }
    }
}

/// Option type enum
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum OptionType {
    Call,
    Put,
}

impl std::fmt::Display for OptionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OptionType::Call => write!(f, "Call"),
            OptionType::Put => write!(f, "Put"),
        }
    }
}

impl std::str::FromStr for OptionType {
    type Err = &'static str;
    
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Call" => Ok(OptionType::Call),
            "Put" => Ok(OptionType::Put),
            _ => Err("Invalid option type"),
        }
    }
}

/// Option trade model for user's isolated database
/// No user_id needed since each user has their own database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionTrade {
    pub id: i64,
    pub symbol: String,
    pub strategy_type: String,
    pub trade_direction: TradeDirection,
    pub number_of_contracts: i32,
    pub option_type: OptionType,
    pub strike_price: f64,
    pub expiration_date: DateTime<Utc>,
    pub entry_price: f64,
    pub exit_price: Option<f64>,
    pub total_premium: f64,
    pub commissions: f64,
    pub implied_volatility: f64,
    pub entry_date: DateTime<Utc>,
    pub exit_date: Option<DateTime<Utc>>,
    pub status: TradeStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Data Transfer Object for creating new option trades
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateOptionRequest {
    pub symbol: String,
    pub strategy_type: String,
    pub trade_direction: TradeDirection,
    pub number_of_contracts: i32,
    pub option_type: OptionType,
    pub strike_price: f64,
    pub expiration_date: DateTime<Utc>,
    pub entry_price: f64,
    pub total_premium: f64,
    pub commissions: f64,
    pub implied_volatility: f64,
    pub entry_date: DateTime<Utc>,
}

/// Data Transfer Object for updating option trades
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateOptionRequest {
    pub symbol: Option<String>,
    pub strategy_type: Option<String>,
    pub trade_direction: Option<TradeDirection>,
    pub number_of_contracts: Option<i32>,
    pub option_type: Option<OptionType>,
    pub strike_price: Option<f64>,
    pub expiration_date: Option<DateTime<Utc>>,
    pub entry_price: Option<f64>,
    pub exit_price: Option<f64>,
    pub total_premium: Option<f64>,
    pub commissions: Option<f64>,
    pub implied_volatility: Option<f64>,
    pub entry_date: Option<DateTime<Utc>>,
    pub exit_date: Option<DateTime<Utc>>,
    pub status: Option<TradeStatus>,
}

/// Option query parameters for filtering and pagination
#[derive(Debug, Serialize, Deserialize)]
pub struct OptionQuery {
    pub symbol: Option<String>,
    pub strategy_type: Option<String>,
    pub trade_direction: Option<TradeDirection>,
    pub option_type: Option<OptionType>,
    pub status: Option<TradeStatus>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Option operations implementation using libsql
impl OptionTrade {
    /// Create a new option trade in the user's database
    pub async fn create(
        conn: &Connection,
        request: CreateOptionRequest,
    ) -> Result<OptionTrade, Box<dyn std::error::Error + Send + Sync>> {
        let now = Utc::now().to_rfc3339();
        
        let mut rows = conn.prepare(
            r#"
            INSERT INTO options (
                symbol, strategy_type, trade_direction, number_of_contracts, 
                option_type, strike_price, expiration_date, entry_price, 
                total_premium, commissions, implied_volatility, entry_date, 
                status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id, symbol, strategy_type, trade_direction, number_of_contracts,
                     option_type, strike_price, expiration_date, entry_price, exit_price,
                     total_premium, commissions, implied_volatility, entry_date, exit_date,
                     status, created_at, updated_at
            "#,
        )
        .await?
        .query(params![
            request.symbol,
            request.strategy_type,
            request.trade_direction.to_string(),
            request.number_of_contracts,
            request.option_type.to_string(),
            request.strike_price,
            request.expiration_date.to_rfc3339(),
            request.entry_price,
            request.total_premium,
            request.commissions,
            request.implied_volatility,
            request.entry_date.to_rfc3339(),
            TradeStatus::Open.to_string(),
            now.clone(),
            now
        ])
        .await?;

        if let Some(row) = rows.next().await? {
            Ok(OptionTrade::from_row(&row)?)
        } else {
            Err("Failed to create option trade".into())
        }
    }

    /// Find an option trade by ID in the user's database
    pub async fn find_by_id(
        conn: &Connection,
        option_id: i64,
    ) -> Result<Option<OptionTrade>, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare(
                r#"
                SELECT id, symbol, strategy_type, trade_direction, number_of_contracts,
                       option_type, strike_price, expiration_date, entry_price, exit_price,
                       total_premium, commissions, implied_volatility, entry_date, exit_date,
                       status, created_at, updated_at
                FROM options 
                WHERE id = ?
                "#,
            )
            .await?
            .query(params![option_id])
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(OptionTrade::from_row(&row)?))
        } else {
            Ok(None)
        }
    }

    /// Find all option trades with optional filtering
    pub async fn find_all(
        conn: &Connection,
        query: OptionQuery,
    ) -> Result<Vec<OptionTrade>, Box<dyn std::error::Error + Send + Sync>> {
        let mut sql = String::from(
            r#"
            SELECT id, symbol, strategy_type, trade_direction, number_of_contracts,
                   option_type, strike_price, expiration_date, entry_price, exit_price,
                   total_premium, commissions, implied_volatility, entry_date, exit_date,
                   status, created_at, updated_at
            FROM options 
            WHERE 1=1
            "#,
        );
        
        let mut query_params = Vec::new();
        
        // Add optional filters
        if let Some(symbol) = &query.symbol {
            sql.push_str(" AND symbol = ?");
            query_params.push(libsql::Value::Text(symbol.clone()));
        }
        
        if let Some(strategy_type) = &query.strategy_type {
            sql.push_str(" AND strategy_type = ?");
            query_params.push(libsql::Value::Text(strategy_type.clone()));
        }
        
        if let Some(trade_direction) = &query.trade_direction {
            sql.push_str(" AND trade_direction = ?");
            query_params.push(libsql::Value::Text(trade_direction.to_string()));
        }
        
        if let Some(option_type) = &query.option_type {
            sql.push_str(" AND option_type = ?");
            query_params.push(libsql::Value::Text(option_type.to_string()));
        }
        
        if let Some(status) = &query.status {
            sql.push_str(" AND status = ?");
            query_params.push(libsql::Value::Text(status.to_string()));
        }
        
        if let Some(start_date) = query.start_date {
            sql.push_str(" AND entry_date >= ?");
            query_params.push(libsql::Value::Text(start_date.to_rfc3339()));
        }
        
        if let Some(end_date) = query.end_date {
            sql.push_str(" AND entry_date <= ?");
            query_params.push(libsql::Value::Text(end_date.to_rfc3339()));
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

        let mut options = Vec::new();
        while let Some(row) = rows.next().await? {
            options.push(OptionTrade::from_row(&row)?);
        }

        Ok(options)
    }

    /// Update an option trade
    pub async fn update(
        conn: &Connection,
        option_id: i64,
        request: UpdateOptionRequest,
    ) -> Result<Option<OptionTrade>, Box<dyn std::error::Error + Send + Sync>> {
        // Check if option exists first
        let current_option = Self::find_by_id(conn, option_id).await?;
        
        if current_option.is_none() {
            return Ok(None);
        }

        let now = Utc::now().to_rfc3339();

        let mut rows = conn
            .prepare(
                r#"
                UPDATE options SET 
                    symbol = COALESCE(?, symbol),
                    strategy_type = COALESCE(?, strategy_type),
                    trade_direction = COALESCE(?, trade_direction),
                    number_of_contracts = COALESCE(?, number_of_contracts),
                    option_type = COALESCE(?, option_type),
                    strike_price = COALESCE(?, strike_price),
                    expiration_date = COALESCE(?, expiration_date),
                    entry_price = COALESCE(?, entry_price),
                    exit_price = COALESCE(?, exit_price),
                    total_premium = COALESCE(?, total_premium),
                    commissions = COALESCE(?, commissions),
                    implied_volatility = COALESCE(?, implied_volatility),
                    entry_date = COALESCE(?, entry_date),
                    exit_date = COALESCE(?, exit_date),
                    status = COALESCE(?, status),
                    updated_at = ?
                WHERE id = ?
                RETURNING id, symbol, strategy_type, trade_direction, number_of_contracts,
                         option_type, strike_price, expiration_date, entry_price, exit_price,
                         total_premium, commissions, implied_volatility, entry_date, exit_date,
                         status, created_at, updated_at
                "#,
            )
            .await?
            .query(params![
                request.symbol,
                request.strategy_type,
                request.trade_direction.map(|t| t.to_string()),
                request.number_of_contracts,
                request.option_type.map(|t| t.to_string()),
                request.strike_price,
                request.expiration_date.map(|d| d.to_rfc3339()),
                request.entry_price,
                request.exit_price,
                request.total_premium,
                request.commissions,
                request.implied_volatility,
                request.entry_date.map(|d| d.to_rfc3339()),
                request.exit_date.map(|d| d.to_rfc3339()),
                request.status.map(|t| t.to_string()),
                now,
                option_id
            ])
            .await?;

        if let Some(row) = rows.next().await? {
            Ok(Some(OptionTrade::from_row(&row)?))
        } else {
            Ok(None)
        }
    }

    /// Delete an option trade
    pub async fn delete(
        conn: &Connection,
        option_id: i64,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        let result = conn
            .execute("DELETE FROM options WHERE id = ?", params![option_id])
            .await?;

        Ok(result > 0)
    }

    /// Get total count of options (for pagination)
    pub async fn count(
        conn: &Connection,
        query: &OptionQuery,
    ) -> Result<i64, Box<dyn std::error::Error + Send + Sync>> {
        let mut sql = String::from("SELECT COUNT(*) FROM options WHERE 1=1");
        let mut query_params = Vec::new();
        
        // Add the same filters as in find_all
        if let Some(symbol) = &query.symbol {
            sql.push_str(" AND symbol = ?");
            query_params.push(libsql::Value::Text(symbol.clone()));
        }
        
        if let Some(strategy_type) = &query.strategy_type {
            sql.push_str(" AND strategy_type = ?");
            query_params.push(libsql::Value::Text(strategy_type.clone()));
        }
        
        if let Some(trade_direction) = &query.trade_direction {
            sql.push_str(" AND trade_direction = ?");
            query_params.push(libsql::Value::Text(trade_direction.to_string()));
        }
        
        if let Some(option_type) = &query.option_type {
            sql.push_str(" AND option_type = ?");
            query_params.push(libsql::Value::Text(option_type.to_string()));
        }
        
        if let Some(status) = &query.status {
            sql.push_str(" AND status = ?");
            query_params.push(libsql::Value::Text(status.to_string()));
        }
        
        if let Some(start_date) = query.start_date {
            sql.push_str(" AND entry_date >= ?");
            query_params.push(libsql::Value::Text(start_date.to_rfc3339()));
        }
        
        if let Some(end_date) = query.end_date {
            sql.push_str(" AND entry_date <= ?");
            query_params.push(libsql::Value::Text(end_date.to_rfc3339()));
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

    /// Calculate total P&L for all options in the user's database 
    pub async fn calculate_total_pnl(
        conn: &Connection,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let mut rows = conn
            .prepare(
                r#"
                SELECT SUM(
                    CASE 
                        WHEN exit_price IS NOT NULL THEN 
                            (exit_price - entry_price) * number_of_contracts * 100 - commissions
                        ELSE 0
                    END
                ) as total_pnl
                FROM options
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
                    (exit_price - entry_price) * number_of_contracts * 100 - commissions AS profit
                FROM options
                WHERE exit_date IS NOT NULL 
                  AND exit_price IS NOT NULL
                  AND status = 'closed'
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
                        WHEN (exit_price - entry_price) > 0 THEN 1
                        ELSE 0
                    END AS is_winning_trade
                FROM options
                WHERE exit_date IS NOT NULL
                  AND exit_price IS NOT NULL
                  AND status = 'closed'
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
                    (exit_price - entry_price) * number_of_contracts * 100 - commissions
                ), 2), 0) as avg_gain
            FROM options
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND status = 'closed'
              AND (exit_price - entry_price) > 0
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
                    (exit_price - entry_price) * number_of_contracts * 100 - commissions
                ), 2), 0) as avg_loss
            FROM options
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND status = 'closed'
              AND (exit_price - entry_price) < 0
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
                    (exit_price - entry_price) * number_of_contracts * 100 - commissions
                ), 0) as biggest_winner
            FROM options
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND status = 'closed'
              AND (exit_price - entry_price) > 0
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
                    (exit_price - entry_price) * number_of_contracts * 100 - commissions
                ), 0) as biggest_loser
            FROM options
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND status = 'closed'
              AND (exit_price - entry_price) < 0
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
            FROM options
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND status = 'closed'
              AND (exit_price - entry_price) > 0
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
            FROM options
            WHERE exit_date IS NOT NULL
              AND exit_price IS NOT NULL
              AND status = 'closed'
              AND (exit_price - entry_price) < 0
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

    /// Calculate average position size (premium paid)
    pub async fn calculate_avg_position_size(
        conn: &Connection,
        time_range: TimeRange,
    ) -> Result<f64, Box<dyn std::error::Error + Send + Sync>> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        let sql = format!(
            r#"
            SELECT 
                COALESCE(ROUND(AVG(total_premium), 2), 0) as avg_position_size
            FROM options
            WHERE status = 'closed'
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
                        WHEN exit_price IS NOT NULL THEN 
                            (exit_price - entry_price) * number_of_contracts * 100 - commissions
                        ELSE -total_premium  -- Unrealized loss for open positions
                    END
                ), 0) as net_pnl
            FROM options
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

    /// Convert from libsql row to OptionTrade struct
    /// Get playbook setups associated with this option trade
    #[allow(dead_code)]
    pub async fn get_playbooks(
        &self,
        conn: &Connection,
    ) -> Result<Vec<crate::models::playbook::Playbook>, Box<dyn std::error::Error + Send + Sync>> {
        crate::models::playbook::Playbook::get_option_trade_playbooks(conn, self.id).await
    }

    /// Tag this option trade with a playbook setup
    #[allow(dead_code)]
    pub async fn tag_with_playbook(
        &self,
        conn: &Connection,
        setup_id: &str,
    ) -> Result<crate::models::playbook::OptionTradePlaybook, Box<dyn std::error::Error + Send + Sync>> {
        crate::models::playbook::Playbook::tag_option_trade(conn, self.id, setup_id).await
    }

    /// Remove a playbook tag from this option trade
    #[allow(dead_code)]
    pub async fn untag_playbook(
        &self,
        conn: &Connection,
        setup_id: &str,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        crate::models::playbook::Playbook::untag_option_trade(conn, self.id, setup_id).await
    }

    fn from_row(row: &libsql::Row) -> Result<OptionTrade, Box<dyn std::error::Error + Send + Sync>> {
        let trade_direction_str: String = row.get(3)?;
        let option_type_str: String = row.get(5)?;
        let status_str: String = row.get(15)?;
        
        let trade_direction = trade_direction_str.parse::<TradeDirection>()
            .map_err(|e| format!("Invalid trade direction: {}", e))?;
            
        let option_type = option_type_str.parse::<OptionType>()
            .map_err(|e| format!("Invalid option type: {}", e))?;

        let status = status_str.parse::<TradeStatus>()
            .map_err(|e| format!("Invalid trade status: {}", e))?;

        // Parse datetime strings
        let expiration_date_str: String = row.get(7)?;
        let entry_date_str: String = row.get(13)?;
        let exit_date_str: Option<String> = row.get(14)?;
        let created_at_str: String = row.get(16)?;
        let updated_at_str: String = row.get(17)?;
        
        let expiration_date = DateTime::parse_from_rfc3339(&expiration_date_str)
            .map_err(|e| format!("Failed to parse expiration_date: {}", e))?
            .with_timezone(&Utc);
        
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
        
        Ok(OptionTrade {
            id: row.get(0)?,
            symbol: row.get(1)?,
            strategy_type: row.get(2)?,
            trade_direction,
            number_of_contracts: row.get(4)?,
            option_type,
            strike_price: row.get(6)?,
            expiration_date,
            entry_price: row.get(8)?,
            exit_price: row.get(9)?,
            total_premium: row.get(10)?,
            commissions: row.get(11)?,
            implied_volatility: row.get(12)?,
            entry_date,
            exit_date,
            status,
            created_at,
            updated_at,
        })
    }
}