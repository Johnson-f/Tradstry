use anyhow::Result;
use libsql::Connection;
use crate::models::analytics::{CoreMetrics, RiskMetrics, PerformanceMetrics};
use crate::models::stock::stocks::TimeRange;

/// Aggregator for combining stocks and options data into unified analytics
pub struct DataAggregator;

impl DataAggregator {
    /// Combine stocks and options data for unified analytics
    pub async fn aggregate_trade_data(
        conn: &Connection,
        time_range: &TimeRange,
    ) -> Result<AggregatedTradeData> {
        let (time_condition, time_params) = time_range.to_sql_condition();
        
        // Fetch stocks data
        let stocks_data = Self::fetch_stocks_data(conn, &time_condition, &time_params).await?;
        
        // Fetch options data
        let options_data = Self::fetch_options_data(conn, &time_condition, &time_params).await?;
        
        // Combine the data
        let aggregated_data = Self::combine_trade_data(stocks_data, options_data);
        
        Ok(aggregated_data)
    }

    /// Fetch stocks trade data
    async fn fetch_stocks_data(
        conn: &Connection,
        time_condition: &str,
        time_params: &[chrono::DateTime<chrono::Utc>],
    ) -> Result<Vec<StockTradeData>> {
        let sql = format!(
            r#"
            SELECT 
                id,
                symbol,
                entry_price,
                exit_price,
                number_shares,
                commissions,
                entry_date,
                exit_date,
                trade_type,
                stop_loss,
                take_profit,
                created_at,
                updated_at
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
            ORDER BY exit_date
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

        let mut trades = Vec::new();
        while let Some(row) = rows.next().await? {
            let trade = StockTradeData {
                id: row.get::<String>(0).unwrap_or_default(),
                symbol: row.get::<String>(1).unwrap_or_default(),
                entry_price: row.get::<f64>(2).unwrap_or(0.0),
                exit_price: row.get::<f64>(3).unwrap_or(0.0),
                number_shares: row.get::<f64>(4).unwrap_or(0.0),
                commissions: row.get::<f64>(5).unwrap_or(0.0),
                entry_date: row.get::<String>(6).unwrap_or_default(),
                exit_date: row.get::<String>(7).unwrap_or_default(),
                trade_type: row.get::<String>(8).unwrap_or_default(),
                stop_loss: row.get::<f64>(9).ok(),
                take_profit: row.get::<f64>(10).ok(),
                created_at: row.get::<String>(11).unwrap_or_default(),
                updated_at: row.get::<String>(12).unwrap_or_default(),
            };
            trades.push(trade);
        }

        Ok(trades)
    }

    /// Fetch options trade data
    async fn fetch_options_data(
        conn: &Connection,
        time_condition: &str,
        time_params: &[chrono::DateTime<chrono::Utc>],
    ) -> Result<Vec<OptionTradeData>> {
        let sql = format!(
            r#"
            SELECT 
                id,
                symbol,
                entry_price,
                exit_price,
                number_of_contracts,
                total_premium,
                commissions,
                entry_date,
                exit_date,
                expiration_date,
                strategy_type,
                trade_direction,
                option_type,
                implied_volatility,
                status,
                created_at,
                updated_at
            FROM options
            WHERE status = 'closed' AND exit_price IS NOT NULL AND ({})
            ORDER BY exit_date
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

        let mut trades = Vec::new();
        while let Some(row) = rows.next().await? {
            let trade = OptionTradeData {
                id: row.get::<String>(0).unwrap_or_default(),
                symbol: row.get::<String>(1).unwrap_or_default(),
                entry_price: row.get::<f64>(2).unwrap_or(0.0),
                exit_price: row.get::<f64>(3).unwrap_or(0.0),
                number_of_contracts: row.get::<f64>(4).unwrap_or(0.0),
                total_premium: row.get::<f64>(5).unwrap_or(0.0),
                commissions: row.get::<f64>(6).unwrap_or(0.0),
                entry_date: row.get::<String>(7).unwrap_or_default(),
                exit_date: row.get::<String>(8).unwrap_or_default(),
                expiration_date: row.get::<String>(9).unwrap_or_default(),
                strategy_type: row.get::<String>(10).unwrap_or_default(),
                trade_direction: row.get::<String>(11).unwrap_or_default(),
                option_type: row.get::<String>(12).unwrap_or_default(),
                implied_volatility: row.get::<f64>(13).ok(),
                status: row.get::<String>(14).unwrap_or_default(),
                created_at: row.get::<String>(15).unwrap_or_default(),
                updated_at: row.get::<String>(16).unwrap_or_default(),
            };
            trades.push(trade);
        }

        Ok(trades)
    }

    /// Combine stocks and options data into unified format
    fn combine_trade_data(
        stocks_data: Vec<StockTradeData>,
        options_data: Vec<OptionTradeData>,
    ) -> AggregatedTradeData {
        let mut unified_trades = Vec::new();
        
        // Convert stocks trades to unified format
        for stock_trade in &stocks_data {
            let pnl = Self::calculate_stock_pnl(stock_trade);
            let position_size = stock_trade.number_shares * stock_trade.entry_price;
            let risk_amount = if let Some(stop_loss) = stock_trade.stop_loss {
                (stock_trade.entry_price - stop_loss).abs() * stock_trade.number_shares
            } else {
                0.0
            };
            
            unified_trades.push(UnifiedTradeData {
                id: stock_trade.id.clone(),
                symbol: stock_trade.symbol.clone(),
                trade_type: TradeType::Stock,
                entry_price: stock_trade.entry_price,
                exit_price: stock_trade.exit_price,
                quantity: stock_trade.number_shares,
                position_size,
                commissions: stock_trade.commissions,
                pnl,
                risk_amount,
                entry_date: stock_trade.entry_date.clone(),
                exit_date: stock_trade.exit_date.clone(),
                strategy: None,
                direction: if stock_trade.trade_type == "BUY" { "bullish" } else { "bearish" }.to_string(),
            });
        }
        
        // Convert options trades to unified format
        for option_trade in &options_data {
            let pnl = Self::calculate_option_pnl(option_trade);
            let position_size = option_trade.total_premium;
            let risk_amount = option_trade.total_premium; // For options, risk is typically the premium paid
            
            unified_trades.push(UnifiedTradeData {
                id: option_trade.id.clone(),
                symbol: option_trade.symbol.clone(),
                trade_type: TradeType::Option,
                entry_price: option_trade.entry_price,
                exit_price: option_trade.exit_price,
                quantity: option_trade.number_of_contracts,
                position_size,
                commissions: option_trade.commissions,
                pnl,
                risk_amount,
                entry_date: option_trade.entry_date.clone(),
                exit_date: option_trade.exit_date.clone(),
                strategy: Some(option_trade.strategy_type.clone()),
                direction: option_trade.trade_direction.clone(),
            });
        }
        
        // Sort by exit date
        unified_trades.sort_by(|a, b| a.exit_date.cmp(&b.exit_date));
        
        AggregatedTradeData {
            trades: unified_trades.clone(),
            total_trades: unified_trades.len(),
            stocks_count: stocks_data.len(),
            options_count: options_data.len(),
        }
    }

    /// Calculate PnL for stock trade
    fn calculate_stock_pnl(trade: &StockTradeData) -> f64 {
        match trade.trade_type.as_str() {
            "BUY" => (trade.exit_price - trade.entry_price) * trade.number_shares - trade.commissions,
            "SELL" => (trade.entry_price - trade.exit_price) * trade.number_shares - trade.commissions,
            _ => 0.0,
        }
    }

    /// Calculate PnL for option trade
    fn calculate_option_pnl(trade: &OptionTradeData) -> f64 {
        (trade.exit_price - trade.entry_price) * trade.number_of_contracts * 100.0 - trade.commissions
    }

    /// Calculate unified core metrics from aggregated data
    pub fn calculate_unified_core_metrics(data: &AggregatedTradeData) -> CoreMetrics {
        let total_trades = data.total_trades as u32;
        let winning_trades = data.trades.iter().filter(|t| t.pnl > 0.0).count() as u32;
        let losing_trades = data.trades.iter().filter(|t| t.pnl < 0.0).count() as u32;
        let break_even_trades = data.trades.iter().filter(|t| t.pnl == 0.0).count() as u32;
        
        let total_pnl: f64 = data.trades.iter().map(|t| t.pnl).sum();
        let gross_profit: f64 = data.trades.iter().filter(|t| t.pnl > 0.0).map(|t| t.pnl).sum();
        let gross_loss: f64 = data.trades.iter().filter(|t| t.pnl < 0.0).map(|t| t.pnl).sum();
        
        let average_win = if winning_trades > 0 {
            gross_profit / winning_trades as f64
        } else {
            0.0
        };
        
        let average_loss = if losing_trades > 0 {
            gross_loss / losing_trades as f64
        } else {
            0.0
        };
        
        let average_position_size = if total_trades > 0 {
            data.trades.iter().map(|t| t.position_size).sum::<f64>() / total_trades as f64
        } else {
            0.0
        };
        
        let biggest_winner = data.trades.iter().map(|t| t.pnl).fold(0.0, f64::max);
        let biggest_loser = data.trades.iter().map(|t| t.pnl).fold(0.0, f64::min);
        
        let win_rate = if total_trades > 0 {
            (winning_trades as f64 / total_trades as f64) * 100.0
        } else {
            0.0
        };
        
        let loss_rate = if total_trades > 0 {
            (losing_trades as f64 / total_trades as f64) * 100.0
        } else {
            0.0
        };
        
        let profit_factor = if gross_loss != 0.0 {
            gross_profit.abs() / gross_loss.abs()
        } else if gross_profit > 0.0 {
            f64::INFINITY
        } else {
            0.0
        };
        
        let win_loss_ratio = if average_loss != 0.0 {
            average_win.abs() / average_loss.abs()
        } else if average_win > 0.0 {
            f64::INFINITY
        } else {
            0.0
        };
        
        let total_commissions: f64 = data.trades.iter().map(|t| t.commissions).sum();
        let average_commission_per_trade = if total_trades > 0 {
            total_commissions / total_trades as f64
        } else {
            0.0
        };

        CoreMetrics {
            total_trades,
            winning_trades,
            losing_trades,
            break_even_trades,
            win_rate,
            loss_rate,
            total_pnl,
            net_profit_loss: total_pnl,
            gross_profit,
            gross_loss,
            average_win,
            average_loss,
            average_position_size,
            biggest_winner,
            biggest_loser,
            profit_factor,
            win_loss_ratio,
            max_consecutive_wins: 0, // Would need additional calculation
            max_consecutive_losses: 0, // Would need additional calculation
            total_commissions,
            average_commission_per_trade,
        }
    }
}

/// Unified trade data structure
#[derive(Debug, Clone)]
pub struct UnifiedTradeData {
    pub id: String,
    pub symbol: String,
    pub trade_type: TradeType,
    pub entry_price: f64,
    pub exit_price: f64,
    pub quantity: f64,
    pub position_size: f64,
    pub commissions: f64,
    pub pnl: f64,
    pub risk_amount: f64,
    pub entry_date: String,
    pub exit_date: String,
    pub strategy: Option<String>,
    pub direction: String,
}

/// Trade type enumeration
#[derive(Debug, Clone)]
pub enum TradeType {
    Stock,
    Option,
}

/// Stock trade data structure
#[derive(Debug, Clone)]
pub struct StockTradeData {
    pub id: String,
    pub symbol: String,
    pub entry_price: f64,
    pub exit_price: f64,
    pub number_shares: f64,
    pub commissions: f64,
    pub entry_date: String,
    pub exit_date: String,
    pub trade_type: String,
    pub stop_loss: Option<f64>,
    pub take_profit: Option<f64>,
    pub created_at: String,
    pub updated_at: String,
}

/// Option trade data structure
#[derive(Debug, Clone)]
pub struct OptionTradeData {
    pub id: String,
    pub symbol: String,
    pub entry_price: f64,
    pub exit_price: f64,
    pub number_of_contracts: f64,
    pub total_premium: f64,
    pub commissions: f64,
    pub entry_date: String,
    pub exit_date: String,
    pub expiration_date: String,
    pub strategy_type: String,
    pub trade_direction: String,
    pub option_type: String,
    pub implied_volatility: Option<f64>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Aggregated trade data containing unified trades
#[derive(Debug, Clone)]
pub struct AggregatedTradeData {
    pub trades: Vec<UnifiedTradeData>,
    pub total_trades: usize,
    pub stocks_count: usize,
    pub options_count: usize,
}
