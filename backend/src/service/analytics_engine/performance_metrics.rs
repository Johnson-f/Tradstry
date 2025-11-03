//! One of the most important files for the AI systems for spotting trading patterns 

use anyhow::Result;
use libsql::Connection;
use crate::models::analytics::{PerformanceMetrics, CoreMetrics};
use crate::models::stock::stocks::TimeRange;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// Helper function to safely extract f64 from libsql::Value
fn get_f64_value(row: &libsql::Row, index: i32) -> f64 {
    match row.get::<libsql::Value>(index) {
        Ok(libsql::Value::Integer(i)) => i as f64,
        Ok(libsql::Value::Real(f)) => f,
        Ok(libsql::Value::Null) => 0.0,
        _ => 0.0,
    }
}

/// Helper function to safely extract i64 from libsql::Value
fn get_i64_value(row: &libsql::Row, index: i32) -> i64 {
    match row.get::<libsql::Value>(index) {
        Ok(libsql::Value::Integer(i)) => i,
        Ok(libsql::Value::Null) => 0,
        _ => 0,
    }
}

/// Calculate performance metrics including hold times for winners and losers
pub async fn calculate_performance_metrics(
    conn: &Connection,
    time_range: &TimeRange,
) -> Result<PerformanceMetrics> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    
    // Calculate stocks performance metrics
    let stocks_metrics = calculate_stocks_performance_metrics(conn, &time_condition, &time_params).await?;
    
    // Calculate options performance metrics
    let options_metrics = calculate_options_performance_metrics(conn, &time_condition, &time_params).await?;
    
    // Combine metrics from both tables
    let combined_metrics = combine_performance_metrics(stocks_metrics, options_metrics);
    
    Ok(combined_metrics)
}

/// Calculate performance metrics for stocks table
async fn calculate_stocks_performance_metrics(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<PerformanceMetrics> {
    // Main performance metrics query
    let sql = format!(
        r#"
        SELECT 
            AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time_days,
            AVG(number_shares * entry_price) as avg_position_size,
            STDDEV(number_shares * entry_price) as position_size_std_dev,
            AVG(commissions) as avg_commission_per_trade,
            SUM(commissions) / NULLIF(SUM(ABS(calculated_pnl)), 0) * 100 as commission_impact_percentage
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        )
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
        .query(libsql::params_from_iter(query_params.clone()))
        .await?;

    let mut avg_hold_time_days = 0.0;
    let mut avg_position_size = 0.0;
    let mut position_size_std_dev = 0.0;
    let mut _avg_commission_per_trade = 0.0;
    let mut commission_impact_percentage = 0.0;

    if let Some(row) = rows.next().await? {
        avg_hold_time_days = get_f64_value(&row, 0);
        avg_position_size = get_f64_value(&row, 1);
        position_size_std_dev = get_f64_value(&row, 2);
        _avg_commission_per_trade = get_f64_value(&row, 3);
        commission_impact_percentage = get_f64_value(&row, 4);
    }

    // Calculate hold times for winners and losers separately
    let winners_hold_time = calculate_winners_hold_time(conn, time_condition, time_params).await?;
    let losers_hold_time = calculate_losers_hold_time(conn, time_condition, time_params).await?;

    // Calculate advanced metrics
    let (trade_expectancy, edge, payoff_ratio) = calculate_expectancy_and_edge_stocks(conn, time_condition, time_params).await?;
    let kelly_criterion = calculate_kelly_criterion_stocks(conn, time_condition, time_params).await?;
    let (avg_r_multiple, r_multiple_std_dev, positive_r_count, negative_r_count) = calculate_r_multiples_stocks(conn, time_condition, time_params).await?;
    let consistency_ratio = calculate_consistency_ratio_stocks(conn, time_condition, time_params).await?;
    let (monthly_win_rate, quarterly_win_rate) = calculate_periodic_win_rates_stocks(conn, time_condition, time_params).await?;
    let system_quality_number = calculate_system_quality_number_stocks(conn, time_condition, time_params).await?;

    Ok(PerformanceMetrics {
        trade_expectancy,
        edge,
        average_hold_time_days: avg_hold_time_days,
        average_hold_time_winners_days: winners_hold_time,
        average_hold_time_losers_days: losers_hold_time,
        average_position_size: avg_position_size,
        position_size_standard_deviation: position_size_std_dev,
        position_size_variability: if avg_position_size > 0.0 { position_size_std_dev / avg_position_size } else { 0.0 },
        kelly_criterion,
        system_quality_number,
        payoff_ratio,
        average_r_multiple: avg_r_multiple,
        r_multiple_standard_deviation: r_multiple_std_dev,
        positive_r_multiple_count: positive_r_count,
        negative_r_multiple_count: negative_r_count,
        consistency_ratio,
        monthly_win_rate,
        quarterly_win_rate,
        average_slippage: 0.0, // Not available in current schema
        commission_impact_percentage,
    })
}

/// Calculate average hold time for winning trades
async fn calculate_winners_hold_time(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time_winners
        FROM stocks
        WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
          AND ((trade_type = 'BUY' AND exit_price > entry_price) 
               OR (trade_type = 'SELL' AND exit_price < entry_price))
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
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

/// Calculate average hold time for losing trades
async fn calculate_losers_hold_time(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time_losers
        FROM stocks
        WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
          AND ((trade_type = 'BUY' AND exit_price < entry_price)
               OR (trade_type = 'SELL' AND exit_price > entry_price))
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
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

/// Calculate average risk per trade (entry - stop_loss) * position_size
#[allow(dead_code)]
async fn calculate_average_risk_per_trade(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(ABS(entry_price - stop_loss) * number_shares) as avg_risk_per_trade
        FROM stocks
        WHERE stop_loss IS NOT NULL AND ({})
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
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

/// Calculate performance metrics for options table
async fn calculate_options_performance_metrics(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<PerformanceMetrics> {
    // Main performance metrics query for options
    let sql = format!(
        r#"
        SELECT 
            AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time_days,
            AVG(total_premium) as avg_position_size,
            STDDEV(total_premium) as position_size_std_dev,
            AVG(commissions) as avg_commission_per_trade,
            SUM(commissions) / NULLIF(SUM(ABS(calculated_pnl)), 0) * 100 as commission_impact_percentage
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * number_of_contracts * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE status = 'closed' AND ({})
        )
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

    let mut avg_hold_time_days = 0.0;
    let mut avg_position_size = 0.0;
    let mut position_size_std_dev = 0.0;
    let mut _avg_commission_per_trade = 0.0;
    let mut commission_impact_percentage = 0.0;

    if let Some(row) = rows.next().await? {
        avg_hold_time_days = get_f64_value(&row, 0);
        avg_position_size = get_f64_value(&row, 1);
        position_size_std_dev = get_f64_value(&row, 2);
        _avg_commission_per_trade = get_f64_value(&row, 3);
        commission_impact_percentage = get_f64_value(&row, 4);
    }

    // Calculate hold times for winners and losers separately for options
    let winners_hold_time = calculate_options_winners_hold_time(conn, time_condition, time_params).await?;
    let losers_hold_time = calculate_options_losers_hold_time(conn, time_condition, time_params).await?;

    // Calculate advanced metrics for options
    let (trade_expectancy, edge, payoff_ratio) = calculate_expectancy_and_edge_options(conn, time_condition, time_params).await?;
    let kelly_criterion = calculate_kelly_criterion_options(conn, time_condition, time_params).await?;
    let (avg_r_multiple, r_multiple_std_dev, positive_r_count, negative_r_count) = calculate_r_multiples_options(conn, time_condition, time_params).await?;
    let consistency_ratio = calculate_consistency_ratio_options(conn, time_condition, time_params).await?;
    let (monthly_win_rate, quarterly_win_rate) = calculate_periodic_win_rates_options(conn, time_condition, time_params).await?;
    let system_quality_number = calculate_system_quality_number_options(conn, time_condition, time_params).await?;

    Ok(PerformanceMetrics {
        trade_expectancy,
        edge,
        average_hold_time_days: avg_hold_time_days,
        average_hold_time_winners_days: winners_hold_time,
        average_hold_time_losers_days: losers_hold_time,
        average_position_size: avg_position_size,
        position_size_standard_deviation: position_size_std_dev,
        position_size_variability: if avg_position_size > 0.0 { position_size_std_dev / avg_position_size } else { 0.0 },
        kelly_criterion,
        system_quality_number,
        payoff_ratio,
        average_r_multiple: avg_r_multiple,
        r_multiple_standard_deviation: r_multiple_std_dev,
        positive_r_multiple_count: positive_r_count,
        negative_r_multiple_count: negative_r_count,
        consistency_ratio,
        monthly_win_rate,
        quarterly_win_rate,
        average_slippage: 0.0, // Not available in current schema
        commission_impact_percentage,
    })
}

/// Calculate average hold time for winning options trades
async fn calculate_options_winners_hold_time(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time_winners
        FROM options
        WHERE status = 'closed' AND exit_price IS NOT NULL AND ({})
          AND exit_price > entry_price
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
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

/// Calculate average hold time for losing options trades
async fn calculate_options_losers_hold_time(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time_losers
        FROM options
        WHERE status = 'closed' AND exit_price IS NOT NULL AND ({})
          AND exit_price < entry_price
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
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

/// Combine performance metrics from stocks and options tables
fn combine_performance_metrics(stocks: PerformanceMetrics, options: PerformanceMetrics) -> PerformanceMetrics {
    // Weighted averages based on position sizes
    let stocks_weight = if stocks.average_position_size > 0.0 && options.average_position_size > 0.0 {
        stocks.average_position_size / (stocks.average_position_size + options.average_position_size)
    } else if stocks.average_position_size > 0.0 {
        1.0
    } else {
        0.0
    };
    
    let options_weight = 1.0 - stocks_weight;

    PerformanceMetrics {
        trade_expectancy: stocks.trade_expectancy * stocks_weight + options.trade_expectancy * options_weight,
        edge: stocks.edge * stocks_weight + options.edge * options_weight,
        average_hold_time_days: stocks.average_hold_time_days * stocks_weight + options.average_hold_time_days * options_weight,
        average_hold_time_winners_days: stocks.average_hold_time_winners_days * stocks_weight + options.average_hold_time_winners_days * options_weight,
        average_hold_time_losers_days: stocks.average_hold_time_losers_days * stocks_weight + options.average_hold_time_losers_days * options_weight,
        average_position_size: stocks.average_position_size * stocks_weight + options.average_position_size * options_weight,
        position_size_standard_deviation: stocks.position_size_standard_deviation * stocks_weight + options.position_size_standard_deviation * options_weight,
        position_size_variability: stocks.position_size_variability * stocks_weight + options.position_size_variability * options_weight,
        kelly_criterion: stocks.kelly_criterion * stocks_weight + options.kelly_criterion * options_weight,
        system_quality_number: stocks.system_quality_number * stocks_weight + options.system_quality_number * options_weight,
        payoff_ratio: stocks.payoff_ratio * stocks_weight + options.payoff_ratio * options_weight,
        average_r_multiple: stocks.average_r_multiple * stocks_weight + options.average_r_multiple * options_weight,
        r_multiple_standard_deviation: stocks.r_multiple_standard_deviation * stocks_weight + options.r_multiple_standard_deviation * options_weight,
        positive_r_multiple_count: stocks.positive_r_multiple_count + options.positive_r_multiple_count,
        negative_r_multiple_count: stocks.negative_r_multiple_count + options.negative_r_multiple_count,
        consistency_ratio: stocks.consistency_ratio * stocks_weight + options.consistency_ratio * options_weight,
        monthly_win_rate: stocks.monthly_win_rate * stocks_weight + options.monthly_win_rate * options_weight,
        quarterly_win_rate: stocks.quarterly_win_rate * stocks_weight + options.quarterly_win_rate * options_weight,
        average_slippage: 0.0, // Not available in current schema
        commission_impact_percentage: stocks.commission_impact_percentage * stocks_weight + options.commission_impact_percentage * options_weight,
    }
}

impl Default for PerformanceMetrics {
    fn default() -> Self {
        Self {
            trade_expectancy: 0.0,
            edge: 0.0,
            average_hold_time_days: 0.0,
            average_hold_time_winners_days: 0.0,
            average_hold_time_losers_days: 0.0,
            average_position_size: 0.0,
            position_size_standard_deviation: 0.0,
            position_size_variability: 0.0,
            kelly_criterion: 0.0,
            system_quality_number: 0.0,
            payoff_ratio: 0.0,
            average_r_multiple: 0.0,
            r_multiple_standard_deviation: 0.0,
            positive_r_multiple_count: 0,
            negative_r_multiple_count: 0,
            consistency_ratio: 0.0,
            monthly_win_rate: 0.0,
            quarterly_win_rate: 0.0,
            average_slippage: 0.0,
            commission_impact_percentage: 0.0,
        }
    }
}

/// Risk management behavioral patterns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskBehaviorMetrics {
    pub stop_loss_hit_percentage: f64,
    pub stop_loss_adherence_rate: f64,
    pub avg_position_size_after_win: f64,
    pub avg_position_size_after_loss: f64,
    pub position_size_consistency_score: f64,
    pub avg_risk_reward_ratio: f64,
    pub risk_reward_consistency: f64,
}

/// Timing behavioral patterns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimingBehaviorMetrics {
    pub best_performing_day: String,
    pub worst_performing_day: String,
    pub trades_per_day_of_week: HashMap<String, u32>,
    pub pnl_per_day_of_week: HashMap<String, f64>,
    pub avg_entry_time_morning: f64,
    pub avg_entry_time_afternoon: f64,
    pub avg_entry_time_evening: f64,
    pub early_exit_percentage: f64,
    pub late_exit_percentage: f64,
}

/// Trading frequency behavioral patterns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradingFrequencyMetrics {
    pub trades_per_week: f64,
    pub over_trading_days: u32,
    pub under_trading_days: u32,
    pub optimal_trading_frequency: f64,
    pub trading_consistency_score: f64,
    pub avg_trades_per_winning_day: f64,
    pub avg_trades_per_losing_day: f64,
}

/// Profitability distribution patterns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfitabilityDistributionMetrics {
    pub best_trade_pct_of_total_profit: f64,
    pub worst_trade_pct_of_total_loss: f64,
    pub profit_distribution_score: f64,
    pub outlier_trades_count: u32,
    pub largest_win_drawdown: f64,
    pub worst_trade_recovery_time: f64,
    pub consecutive_wins_avg_profit: f64,
    pub consecutive_losses_avg_loss: f64,
}

/// Comprehensive behavioral patterns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BehavioralPatterns {
    pub risk_behavior: RiskBehaviorMetrics,
    pub timing_behavior: TimingBehaviorMetrics,
    pub trading_frequency: TradingFrequencyMetrics,
    pub profitability_distribution: ProfitabilityDistributionMetrics,
}

/// Calculate all behavioral patterns
#[allow(dead_code)]
pub async fn calculate_behavioral_patterns(
    conn: &Connection,
    time_range: &TimeRange,
) -> Result<BehavioralPatterns> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    
    // Calculate each pattern category
    let risk_behavior = calculate_risk_behavior(conn, &time_condition, &time_params).await?;
    let timing_behavior = calculate_timing_behavior(conn, &time_condition, &time_params).await?;
    let trading_frequency = calculate_trading_frequency_behavior(conn, &time_condition, &time_params).await?;
    let profitability_distribution = calculate_profitability_distribution(conn, &time_condition, &time_params).await?;
    
    Ok(BehavioralPatterns {
        risk_behavior,
        timing_behavior,
        trading_frequency,
        profitability_distribution,
    })
}

/// Calculate risk management behavioral patterns
#[allow(dead_code)]
async fn calculate_risk_behavior(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<RiskBehaviorMetrics> {
    // Calculate stop loss adherence - using SQLite-specific functions
    let sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN stop_loss IS NOT NULL THEN 1 ELSE 0 END) as trades_with_stop
        FROM stocks
        WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
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
        .query(libsql::params_from_iter(query_params.clone()))
        .await?;

    let mut stop_loss_adherence = 0.0;
    let stop_loss_hit_pct = 0.0;

    if let Some(row) = rows.next().await? {
        let total = get_i64_value(&row, 0);
        let with_stop = get_i64_value(&row, 1);

        if total > 0 {
            stop_loss_adherence = (with_stop as f64 / total as f64) * 100.0;
        }
    }

    // Simplified position size patterns - using subquery instead of window functions
    let sql = format!(
        r#"
        SELECT 
            AVG(position_size) as avg_after_win,
            AVG(position_size) as avg_after_loss,
            STDDEV(position_size) / NULLIF(AVG(position_size), 0) * 100 as consistency
        FROM (
            SELECT 
                entry_price * number_shares as position_size,
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as pnl
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        )
        "#,
        time_condition
    );

    let mut rows = conn
        .prepare(&sql)
        .await?
        .query(libsql::params_from_iter(query_params.clone()))
        .await?;

    let mut avg_size_after_win = 0.0;
    let mut avg_size_after_loss = 0.0;
    let mut position_consistency = 0.0;

    if let Some(row) = rows.next().await? {
        avg_size_after_win = get_f64_value(&row, 0);
        avg_size_after_loss = get_f64_value(&row, 1);
        position_consistency = get_f64_value(&row, 2);
    }

    // Calculate risk-reward ratio consistency
    let sql = format!(
        r#"
        SELECT 
            AVG(CASE 
                WHEN ABS(entry_price - stop_loss) > 0 
                THEN ABS(calculated_pnl) / ABS(entry_price - stop_loss) 
                ELSE 0 
            END) as avg_rr_ratio
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL 
              AND stop_loss IS NOT NULL AND ({})
        )
        "#,
        time_condition
    );

    let mut rows = conn
        .prepare(&sql)
        .await?
        .query(libsql::params_from_iter(query_params))
        .await?;

    let mut avg_rr_ratio = 0.0;
    let rr_consistency = 0.0;

    if let Some(row) = rows.next().await? {
        avg_rr_ratio = get_f64_value(&row, 0);
    }

    Ok(RiskBehaviorMetrics {
        stop_loss_hit_percentage: stop_loss_hit_pct,
        stop_loss_adherence_rate: stop_loss_adherence,
        avg_position_size_after_win: avg_size_after_win,
        avg_position_size_after_loss: avg_size_after_loss,
        position_size_consistency_score: 100.0 - position_consistency.clamp(0.0, 100.0),
        avg_risk_reward_ratio: avg_rr_ratio,
        risk_reward_consistency: rr_consistency,
    })
}

/// Calculate timing behavioral patterns
#[allow(dead_code)]
async fn calculate_timing_behavior(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<TimingBehaviorMetrics> {
    // Get day of week performance
    let sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN CAST(strftime('%w', entry_date) AS INTEGER) = 0 THEN 'Sunday'
                WHEN CAST(strftime('%w', entry_date) AS INTEGER) = 1 THEN 'Monday'
                WHEN CAST(strftime('%w', entry_date) AS INTEGER) = 2 THEN 'Tuesday'
                WHEN CAST(strftime('%w', entry_date) AS INTEGER) = 3 THEN 'Wednesday'
                WHEN CAST(strftime('%w', entry_date) AS INTEGER) = 4 THEN 'Thursday'
                WHEN CAST(strftime('%w', entry_date) AS INTEGER) = 5 THEN 'Friday'
                WHEN CAST(strftime('%w', entry_date) AS INTEGER) = 6 THEN 'Saturday'
                ELSE 'Unknown'
            END as day_of_week,
            COUNT(*) as trade_count,
            SUM(CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                ELSE 0
            END) as total_pnl
        FROM stocks
        WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        GROUP BY day_of_week
        ORDER BY total_pnl DESC
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

    let mut trades_per_day = HashMap::new();
    let mut pnl_per_day = HashMap::new();
    let mut best_day = "None".to_string();
    let mut worst_day = "None".to_string();
    let mut best_pnl = f64::MIN;
    let mut worst_pnl = f64::MAX;

    while let Some(row) = rows.next().await? {
        let day: String = row.get(0)?;
        let count = get_i64_value(&row, 1);
        let pnl = get_f64_value(&row, 2);

        trades_per_day.insert(day.clone(), count as u32);
        pnl_per_day.insert(day.clone(), pnl);

        if pnl > best_pnl {
            best_pnl = pnl;
            best_day = day.clone();
        }
        if pnl < worst_pnl {
            worst_pnl = pnl;
            worst_day = day.clone();
        }
    }

    Ok(TimingBehaviorMetrics {
        best_performing_day: best_day,
        worst_performing_day: worst_day,
        trades_per_day_of_week: trades_per_day,
        pnl_per_day_of_week: pnl_per_day,
        avg_entry_time_morning: 0.0,
        avg_entry_time_afternoon: 0.0,
        avg_entry_time_evening: 0.0,
        early_exit_percentage: 0.0,
        late_exit_percentage: 0.0,
    })
}

/// Calculate trading frequency behavioral patterns
#[allow(dead_code)]
async fn calculate_trading_frequency_behavior(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<TradingFrequencyMetrics> {
    // Calculate trades per week
    let sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            CAST(JULIANDAY(MAX(exit_date)) - JULIANDAY(MIN(entry_date)) AS REAL) as days_span,
            COUNT(*) / CAST(JULIANDAY(MAX(exit_date)) - JULIANDAY(MIN(entry_date)) AS REAL) * 7.0 as trades_per_week
        FROM stocks
        WHERE entry_date IS NOT NULL AND exit_date IS NOT NULL AND ({})
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
        .query(libsql::params_from_iter(query_params.clone()))
        .await?;

    let mut trades_per_week = 0.0;

    if let Some(row) = rows.next().await? {
        trades_per_week = get_f64_value(&row, 2);
    }

    // Count over-trading days (days with more than 3 trades)
    let sql = format!(
        r#"
        SELECT COUNT(*) 
        FROM (
            SELECT DATE(entry_date) as trade_date
            FROM stocks
            WHERE entry_date IS NOT NULL AND ({})
            GROUP BY trade_date
            HAVING COUNT(*) > 3
        )
        "#,
        time_condition
    );

    let mut rows = conn
        .prepare(&sql)
        .await?
        .query(libsql::params_from_iter(query_params.clone()))
        .await?;

    let mut over_trading_days = 0;
    if let Some(row) = rows.next().await? {
        over_trading_days = get_i64_value(&row, 0) as u32;
    }

    // Calculate optimal trading frequency
    let sql = format!(
        r#"
        SELECT 
            AVG(trades_per_day) as avg_trades,
            AVG(CASE WHEN avg_pnl > 0 THEN trades_per_day ELSE NULL END) as avg_trades_on_winning_days,
            AVG(CASE WHEN avg_pnl < 0 THEN trades_per_day ELSE NULL END) as avg_trades_on_losing_days
        FROM (
            SELECT 
                DATE(entry_date) as trade_date,
                COUNT(*) as trades_per_day,
                AVG(CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END) as avg_pnl
            FROM stocks
            WHERE entry_date IS NOT NULL AND exit_date IS NOT NULL AND ({})
            GROUP BY trade_date
        )
        "#,
        time_condition
    );

    let mut rows = conn
        .prepare(&sql)
        .await?
        .query(libsql::params_from_iter(query_params))
        .await?;

    let mut optimal_frequency = 0.0;
    let mut avg_trades_winning = 0.0;
    let mut avg_trades_losing = 0.0;

    if let Some(row) = rows.next().await? {
        optimal_frequency = get_f64_value(&row, 0);
        avg_trades_winning = get_f64_value(&row, 1);
        avg_trades_losing = get_f64_value(&row, 2);
    }

    Ok(TradingFrequencyMetrics {
        trades_per_week,
        over_trading_days,
        under_trading_days: 0,
        optimal_trading_frequency: optimal_frequency,
        trading_consistency_score: 0.0,
        avg_trades_per_winning_day: avg_trades_winning,
        avg_trades_per_losing_day: avg_trades_losing,
    })
}

/// Calculate profitability distribution patterns
#[allow(dead_code)]
async fn calculate_profitability_distribution(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<ProfitabilityDistributionMetrics> {
    // Calculate best and worst trade impact
    let sql = format!(
        r#"
        SELECT 
            MAX(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE NULL END) as best_trade,
            MIN(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE NULL END) as worst_trade,
            SUM(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE 0 END) as total_profit,
            SUM(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE 0 END) as total_loss
        FROM (
            SELECT 
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        )
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

    let mut best_trade = 0.0;
    let mut worst_trade = 0.0;
    let mut total_profit = 0.0;
    let mut total_loss = 0.0;

    if let Some(row) = rows.next().await? {
        best_trade = get_f64_value(&row, 0);
        worst_trade = get_f64_value(&row, 1);
        total_profit = get_f64_value(&row, 2);
        total_loss = get_f64_value(&row, 3).abs();
    }

    let best_trade_pct = if total_profit > 0.0 {
        (best_trade / total_profit) * 100.0
    } else {
        0.0
    };

    let worst_trade_pct = if total_loss > 0.0 {
        (worst_trade.abs() / total_loss) * 100.0
    } else {
        0.0
    };

    let profit_distribution_score = 100.0 - best_trade_pct;

    Ok(ProfitabilityDistributionMetrics {
        best_trade_pct_of_total_profit: best_trade_pct,
        worst_trade_pct_of_total_loss: worst_trade_pct,
        profit_distribution_score,
        outlier_trades_count: 0,
        largest_win_drawdown: 0.0,
        worst_trade_recovery_time: 0.0,
        consecutive_wins_avg_profit: 0.0,
        consecutive_losses_avg_loss: 0.0,
    })
}

/// Calculate expectancy, edge, and payoff ratio for stocks
async fn calculate_expectancy_and_edge_stocks(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(f64, f64, f64)> {
    let sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
            SUM(CASE WHEN calculated_pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE NULL END) as avg_winner,
            AVG(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE NULL END) as avg_loser,
            SUM(calculated_pnl) as total_pnl
        FROM (
            SELECT 
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        )
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

    let mut total_trades = 0.0;
    let mut winning_trades = 0.0;
    let mut losing_trades = 0.0;
    let mut avg_winner = 0.0;
    let mut avg_loser = 0.0;

    if let Some(row) = rows.next().await? {
        total_trades = get_f64_value(&row, 0);
        winning_trades = get_f64_value(&row, 1);
        losing_trades = get_f64_value(&row, 2);
        avg_winner = get_f64_value(&row, 3);
        avg_loser = get_f64_value(&row, 4);
    }

    // Calculate expectancy = (win rate * avg winner) + (loss rate * avg loser)
    let win_rate = if total_trades > 0.0 { winning_trades / total_trades } else { 0.0 };
    let loss_rate = if total_trades > 0.0 { losing_trades / total_trades } else { 0.0 };
    let expectancy = (win_rate * avg_winner) + (loss_rate * avg_loser);

    // Calculate edge (similar to expectancy, percentage form)
    let edge = if avg_loser != 0.0 {
        ((win_rate * avg_winner) + (loss_rate * avg_loser)) / avg_loser.abs()
    } else {
        0.0
    };

    // Calculate payoff ratio (avg winner / avg loser)
    let payoff_ratio = if avg_loser != 0.0 {
        avg_winner / avg_loser.abs()
    } else {
        0.0
    };

    Ok((expectancy, edge, payoff_ratio))
}

/// Calculate Kelly Criterion for stocks
/// Kelly % = W - [(1-W) / R]
/// Where W = win rate, R = avg winner / avg loser
async fn calculate_kelly_criterion_stocks(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT 
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE NULL END) as avg_winner,
            AVG(CASE WHEN calculated_pnl < 0 THEN ABS(calculated_pnl) ELSE NULL END) as avg_loser,
            CAST(SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate
        FROM (
            SELECT 
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        )
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

    let mut avg_winner = 0.0;
    let mut avg_loser = 0.0;
    let mut win_rate = 0.0;

    if let Some(row) = rows.next().await? {
        avg_winner = get_f64_value(&row, 0);
        avg_loser = get_f64_value(&row, 1);
        win_rate = get_f64_value(&row, 2);
    }

    // Kelly = W - [(1-W) / R] where R = avg_winner / avg_loser
    let kelly = if avg_loser > 0.0 {
        let r = avg_winner / avg_loser;
        win_rate - ((1.0 - win_rate) / r)
    } else {
        0.0
    };

    Ok(kelly)
}

/// Calculate R-Multiples for stocks
async fn calculate_r_multiples_stocks(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(f64, f64, u32, u32)> {
    let sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                ELSE 0
            END as pnl,
            ABS(entry_price - stop_loss) * number_shares as risk
        FROM stocks
        WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL 
          AND stop_loss IS NOT NULL AND ({})
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

    let mut r_multiples = Vec::new();
    let mut positive_count = 0;
    let mut negative_count = 0;

    while let Some(row) = rows.next().await? {
        let pnl = get_f64_value(&row, 0);
        let risk = get_f64_value(&row, 1);

        if risk > 0.0 {
            let r_multiple = pnl / risk;
            r_multiples.push(r_multiple);
            if r_multiple > 0.0 {
                positive_count += 1;
            } else if r_multiple < 0.0 {
                negative_count += 1;
            }
        }
    }

    let avg_r_multiple = if !r_multiples.is_empty() {
        r_multiples.iter().sum::<f64>() / r_multiples.len() as f64
    } else {
        0.0
    };

    let variance = if !r_multiples.is_empty() {
        let mean = avg_r_multiple;
        r_multiples.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / r_multiples.len() as f64
    } else {
        0.0
    };

    let std_dev = variance.sqrt();

    Ok((avg_r_multiple, std_dev, positive_count as u32, negative_count as u32))
}

/// Calculate consistency ratio for stocks
/// Ratio = Winning trades / Total trades - (Absolute sum of losses / Absolute sum of wins)
async fn calculate_consistency_ratio_stocks(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT 
            CAST(SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate,
            SUM(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE 0 END) as total_wins,
            SUM(CASE WHEN calculated_pnl < 0 THEN ABS(calculated_pnl) ELSE 0 END) as total_losses
        FROM (
            SELECT 
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        )
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

    let mut win_rate = 0.0;
    let mut total_wins = 0.0;
    let mut total_losses = 0.0;

    if let Some(row) = rows.next().await? {
        win_rate = get_f64_value(&row, 0);
        total_wins = get_f64_value(&row, 1);
        total_losses = get_f64_value(&row, 2);
    }

    let consistency_ratio = if total_wins > 0.0 && total_losses > 0.0 {
        win_rate * (1.0 - (total_losses / total_wins))
    } else {
        0.0
    };

    Ok(consistency_ratio)
}

/// Calculate monthly and quarterly win rates for stocks
async fn calculate_periodic_win_rates_stocks(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(f64, f64)> {
    // Monthly win rate
    let sql = format!(
        r#"
        SELECT 
            CAST(SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
            AND JULIANDAY('now') - JULIANDAY(exit_date) <= 30
        )
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
        .query(libsql::params_from_iter(query_params.clone()))
        .await?;

    let mut monthly_win_rate = 0.0;
    if let Some(row) = rows.next().await? {
        monthly_win_rate = get_f64_value(&row, 0);
    }

    // Quarterly win rate
    let sql = format!(
        r#"
        SELECT 
            CAST(SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
            AND JULIANDAY('now') - JULIANDAY(exit_date) <= 90
        )
        "#,
        time_condition
    );

    let mut rows = conn
        .prepare(&sql)
        .await?
        .query(libsql::params_from_iter(query_params))
        .await?;

    let mut quarterly_win_rate = 0.0;
    if let Some(row) = rows.next().await? {
        quarterly_win_rate = get_f64_value(&row, 0);
    }

    Ok((monthly_win_rate, quarterly_win_rate))
}

/// Calculate System Quality Number (SQN) for stocks
/// SQN = (Expectancy / StdDev of R-Multiples) * sqrt(Number of Trades)
async fn calculate_system_quality_number_stocks(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let (expectancy, _, _, _) = calculate_r_multiples_stocks(conn, time_condition, time_params).await?;
    let (total_trades, _, _) = get_basic_stats_stocks(conn, time_condition, time_params).await?;

    if total_trades > 0.0 && expectancy > 0.0 {
        Ok(expectancy * total_trades.sqrt())
    } else {
        Ok(0.0)
    }
}

/// Helper function to get basic stats
async fn get_basic_stats_stocks(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(f64, f64, f64)> {
    let sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(calculated_pnl) as total_pnl,
            AVG(calculated_pnl) as avg_pnl
        FROM (
            SELECT 
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        )
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

    let mut total_trades = 0.0;
    let mut total_pnl = 0.0;
    let mut avg_pnl = 0.0;

    if let Some(row) = rows.next().await? {
        total_trades = get_f64_value(&row, 0);
        total_pnl = get_f64_value(&row, 1);
        avg_pnl = get_f64_value(&row, 2);
    }

    Ok((total_trades, total_pnl, avg_pnl))
}

/// Options equivalents of all the stocks calculation functions
/// Calculate expectancy, edge, and payoff ratio for options
async fn calculate_expectancy_and_edge_options(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(f64, f64, f64)> {
    let sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
            SUM(CASE WHEN calculated_pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE NULL END) as avg_winner,
            AVG(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE NULL END) as avg_loser
        FROM (
            SELECT 
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * number_of_contracts * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE status = 'closed' AND ({})
        )
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

    let mut total_trades = 0.0;
    let mut winning_trades = 0.0;
    let mut losing_trades = 0.0;
    let mut avg_winner = 0.0;
    let mut avg_loser = 0.0;

    if let Some(row) = rows.next().await? {
        total_trades = get_f64_value(&row, 0);
        winning_trades = get_f64_value(&row, 1);
        losing_trades = get_f64_value(&row, 2);
        avg_winner = get_f64_value(&row, 3);
        avg_loser = get_f64_value(&row, 4);
    }

    let win_rate = if total_trades > 0.0 { winning_trades / total_trades } else { 0.0 };
    let loss_rate = if total_trades > 0.0 { losing_trades / total_trades } else { 0.0 };
    let expectancy = (win_rate * avg_winner) + (loss_rate * avg_loser);

    let edge = if avg_loser != 0.0 {
        ((win_rate * avg_winner) + (loss_rate * avg_loser)) / avg_loser.abs()
    } else {
        0.0
    };

    let payoff_ratio = if avg_loser != 0.0 {
        avg_winner / avg_loser.abs()
    } else {
        0.0
    };

    Ok((expectancy, edge, payoff_ratio))
}

/// Calculate Kelly Criterion for options
async fn calculate_kelly_criterion_options(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT 
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE NULL END) as avg_winner,
            AVG(CASE WHEN calculated_pnl < 0 THEN ABS(calculated_pnl) ELSE NULL END) as avg_loser,
            CAST(SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate
        FROM (
            SELECT 
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * number_of_contracts * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE status = 'closed' AND ({})
        )
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

    let mut avg_winner = 0.0;
    let mut avg_loser = 0.0;
    let mut win_rate = 0.0;

    if let Some(row) = rows.next().await? {
        avg_winner = get_f64_value(&row, 0);
        avg_loser = get_f64_value(&row, 1);
        win_rate = get_f64_value(&row, 2);
    }

    let kelly = if avg_loser > 0.0 {
        let r = avg_winner / avg_loser;
        win_rate - ((1.0 - win_rate) / r)
    } else {
        0.0
    };

    Ok(kelly)
}

/// Calculate R-Multiples for options
async fn calculate_r_multiples_options(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(f64, f64, u32, u32)> {
    // For options, use total_premium as the risk (cost basis)
    let sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN exit_price IS NOT NULL THEN 
                    (exit_price - entry_price) * number_of_contracts * 100 - commissions
                ELSE 0
            END as pnl,
            total_premium as risk
        FROM options
        WHERE status = 'closed' AND exit_price IS NOT NULL AND ({})
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

    let mut r_multiples = Vec::new();
    let mut positive_count = 0;
    let mut negative_count = 0;

    while let Some(row) = rows.next().await? {
        let pnl = get_f64_value(&row, 0);
        let risk = get_f64_value(&row, 1);

        if risk > 0.0 {
            let r_multiple = pnl / risk;
            r_multiples.push(r_multiple);
            if r_multiple > 0.0 {
                positive_count += 1;
            } else if r_multiple < 0.0 {
                negative_count += 1;
            }
        }
    }

    let avg_r_multiple = if !r_multiples.is_empty() {
        r_multiples.iter().sum::<f64>() / r_multiples.len() as f64
    } else {
        0.0
    };

    let variance = if !r_multiples.is_empty() {
        let mean = avg_r_multiple;
        r_multiples.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / r_multiples.len() as f64
    } else {
        0.0
    };

    let std_dev = variance.sqrt();

    Ok((avg_r_multiple, std_dev, positive_count as u32, negative_count as u32))
}

/// Calculate consistency ratio for options
async fn calculate_consistency_ratio_options(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT 
            CAST(SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate,
            SUM(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE 0 END) as total_wins,
            SUM(CASE WHEN calculated_pnl < 0 THEN ABS(calculated_pnl) ELSE 0 END) as total_losses
        FROM (
            SELECT 
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * number_of_contracts * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE status = 'closed' AND ({})
        )
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

    let mut win_rate = 0.0;
    let mut total_wins = 0.0;
    let mut total_losses = 0.0;

    if let Some(row) = rows.next().await? {
        win_rate = get_f64_value(&row, 0);
        total_wins = get_f64_value(&row, 1);
        total_losses = get_f64_value(&row, 2);
    }

    let consistency_ratio = if total_wins > 0.0 && total_losses > 0.0 {
        win_rate * (1.0 - (total_losses / total_wins))
    } else {
        0.0
    };

    Ok(consistency_ratio)
}

/// Calculate monthly and quarterly win rates for options
async fn calculate_periodic_win_rates_options(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(f64, f64)> {
    let sql = format!(
        r#"
        SELECT 
            CAST(SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate
        FROM (
            SELECT 
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * number_of_contracts * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE status = 'closed' AND ({})
            AND JULIANDAY('now') - JULIANDAY(exit_date) <= 30
        )
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
        .query(libsql::params_from_iter(query_params.clone()))
        .await?;

    let mut monthly_win_rate = 0.0;
    if let Some(row) = rows.next().await? {
        monthly_win_rate = get_f64_value(&row, 0);
    }

    let sql = format!(
        r#"
        SELECT 
            CAST(SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) AS REAL) / COUNT(*) as win_rate
        FROM (
            SELECT 
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * number_of_contracts * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE status = 'closed' AND ({})
            AND JULIANDAY('now') - JULIANDAY(exit_date) <= 90
        )
        "#,
        time_condition
    );

    let mut rows = conn
        .prepare(&sql)
        .await?
        .query(libsql::params_from_iter(query_params))
        .await?;

    let mut quarterly_win_rate = 0.0;
    if let Some(row) = rows.next().await? {
        quarterly_win_rate = get_f64_value(&row, 0);
    }

    Ok((monthly_win_rate, quarterly_win_rate))
}

/// Calculate System Quality Number for options
async fn calculate_system_quality_number_options(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let (expectancy, _, _, _) = calculate_r_multiples_options(conn, time_condition, time_params).await?;
    let (total_trades, _, _) = get_basic_stats_options(conn, time_condition, time_params).await?;

    if total_trades > 0.0 && expectancy > 0.0 {
        Ok(expectancy * total_trades.sqrt())
    } else {
        Ok(0.0)
    }
}

/// Helper function to get basic stats for options
async fn get_basic_stats_options(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(f64, f64, f64)> {
    let sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(calculated_pnl) as total_pnl,
            AVG(calculated_pnl) as avg_pnl
        FROM (
            SELECT 
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * number_of_contracts * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE status = 'closed' AND ({})
        )
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

    let mut total_trades = 0.0;
    let mut total_pnl = 0.0;
    let mut avg_pnl = 0.0;

    if let Some(row) = rows.next().await? {
        total_trades = get_f64_value(&row, 0);
        total_pnl = get_f64_value(&row, 1);
        avg_pnl = get_f64_value(&row, 2);
    }

    Ok((total_trades, total_pnl, avg_pnl))
}

// Duration Performance Analytics

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DurationPerformanceMetrics {
    pub duration_bucket: String,
    pub trade_count: u32,
    pub win_rate: f64,
    pub total_pnl: f64,
    pub avg_pnl: f64,
    pub avg_hold_time_days: f64,
    pub best_trade: f64,
    pub worst_trade: f64,
    pub profit_factor: f64,
    pub winning_trades: u32,
    pub losing_trades: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DurationPerformanceResponse {
    pub duration_buckets: Vec<DurationPerformanceMetrics>,
    pub overall_metrics: CoreMetrics,
}

/// Calculate performance metrics grouped by trade duration
pub async fn calculate_duration_performance_metrics(
    conn: &Connection,
    time_range: &TimeRange,
) -> Result<DurationPerformanceResponse> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    
    // Define duration buckets (in days)
    let duration_buckets = vec![
        ("0-1 days", 0.0, 1.0),
        ("1-7 days", 1.0, 7.0),
        ("1-4 weeks", 7.0, 28.0),
        ("1-3 months", 28.0, 90.0),
        ("3+ months", 90.0, f64::MAX),
    ];
    
    let mut bucket_metrics = Vec::new();
    
    for (bucket_name, min_days, max_days) in duration_buckets {
        let metrics = calculate_bucket_metrics(
            conn, 
            &time_condition, 
            &time_params, 
            bucket_name, 
            min_days, 
            max_days
        ).await?;
        
        if metrics.trade_count > 0 {
            bucket_metrics.push(metrics);
        }
    }
    
    // Calculate overall metrics for the time period
    let overall_metrics = crate::service::analytics_engine::core_metrics::calculate_core_metrics(conn, time_range).await?;
    
    Ok(DurationPerformanceResponse {
        duration_buckets: bucket_metrics,
        overall_metrics,
    })
}

async fn calculate_bucket_metrics(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
    bucket_name: &str,
    min_days: f64,
    max_days: f64,
) -> Result<DurationPerformanceMetrics> {
    let duration_condition = if max_days == f64::MAX {
        format!("AND (JULIANDAY(exit_date) - JULIANDAY(entry_date)) >= {}", min_days)
    } else {
        format!("AND (JULIANDAY(exit_date) - JULIANDAY(entry_date)) >= {} AND (JULIANDAY(exit_date) - JULIANDAY(entry_date)) < {}", min_days, max_days)
    };
    
    // Combined query for stocks and options
    let sql = format!(
        r#"
        WITH combined_trades AS (
            -- Stock trades
            SELECT 
                (CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    ELSE (entry_price - exit_price) * number_shares - commissions
                END) as net_pnl,
                (JULIANDAY(exit_date) - JULIANDAY(entry_date)) as hold_days,
                CASE 
                    WHEN (trade_type = 'BUY' AND exit_price > entry_price) OR 
                         (trade_type = 'SELL' AND exit_price < entry_price) 
                    THEN 1 ELSE 0 
                END as is_winner
            FROM stocks 
            WHERE exit_price IS NOT NULL 
                AND exit_date IS NOT NULL 
                AND ({}) 
                {}
            
            UNION ALL
            
            -- Option trades  
            SELECT 
                (exit_price - entry_price) * number_of_contracts * 100 - commissions as net_pnl,
                (JULIANDAY(exit_date) - JULIANDAY(entry_date)) as hold_days,
                CASE WHEN exit_price > entry_price THEN 1 ELSE 0 END as is_winner
            FROM options 
            WHERE status = 'closed' 
                AND exit_date IS NOT NULL 
                AND exit_price IS NOT NULL
                AND ({}) 
                {}
        )
        SELECT 
            COUNT(*) as trade_count,
            SUM(is_winner) as winning_trades,
            COUNT(*) - SUM(is_winner) as losing_trades,
            CASE WHEN COUNT(*) > 0 THEN (SUM(is_winner) * 100.0 / COUNT(*)) ELSE 0 END as win_rate,
            SUM(net_pnl) as total_pnl,
            AVG(net_pnl) as avg_pnl,
            AVG(hold_days) as avg_hold_time_days,
            MAX(net_pnl) as best_trade,
            MIN(net_pnl) as worst_trade,
            CASE 
                WHEN SUM(CASE WHEN net_pnl < 0 THEN ABS(net_pnl) ELSE 0 END) > 0 
                THEN SUM(CASE WHEN net_pnl > 0 THEN net_pnl ELSE 0 END) / SUM(CASE WHEN net_pnl < 0 THEN ABS(net_pnl) ELSE 0 END)
                ELSE 0 
            END as profit_factor
        FROM combined_trades
        "#,
        time_condition, duration_condition,
        time_condition, duration_condition
    );
    
    let mut query_params = Vec::new();
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }
    
    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(DurationPerformanceMetrics {
            duration_bucket: bucket_name.to_string(),
            trade_count: get_i64_value(&row, 0) as u32,
            winning_trades: get_i64_value(&row, 1) as u32,
            losing_trades: get_i64_value(&row, 2) as u32,
            win_rate: get_f64_value(&row, 3),
            total_pnl: get_f64_value(&row, 4),
            avg_pnl: get_f64_value(&row, 5),
            avg_hold_time_days: get_f64_value(&row, 6),
            best_trade: get_f64_value(&row, 7),
            worst_trade: get_f64_value(&row, 8),
            profit_factor: get_f64_value(&row, 9),
        })
    } else {
        Ok(DurationPerformanceMetrics {
            duration_bucket: bucket_name.to_string(),
            trade_count: 0,
            winning_trades: 0,
            losing_trades: 0,
            win_rate: 0.0,
            total_pnl: 0.0,
            avg_pnl: 0.0,
            avg_hold_time_days: 0.0,
            best_trade: 0.0,
            worst_trade: 0.0,
            profit_factor: 0.0,
        })
    }
}