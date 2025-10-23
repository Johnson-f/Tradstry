use anyhow::Result;
use libsql::Connection;
use crate::models::analytics::PerformanceMetrics;
use crate::models::stock::stocks::TimeRange;

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
        .query(libsql::params_from_iter(query_params))
        .await?;

    let mut avg_hold_time_days = 0.0;
    let mut avg_position_size = 0.0;
    let mut position_size_std_dev = 0.0;
    let mut avg_commission_per_trade = 0.0;
    let mut commission_impact_percentage = 0.0;

    if let Some(row) = rows.next().await? {
        avg_hold_time_days = row.get::<f64>(0).unwrap_or(0.0);
        avg_position_size = row.get::<f64>(1).unwrap_or(0.0);
        position_size_std_dev = row.get::<f64>(2).unwrap_or(0.0);
        avg_commission_per_trade = row.get::<f64>(3).unwrap_or(0.0);
        commission_impact_percentage = row.get::<f64>(4).unwrap_or(0.0);
    }

    // Calculate hold times for winners and losers separately
    let winners_hold_time = calculate_winners_hold_time(conn, time_condition, time_params).await?;
    let losers_hold_time = calculate_losers_hold_time(conn, time_condition, time_params).await?;

    // Calculate average risk per trade
    let avg_risk_per_trade = calculate_average_risk_per_trade(conn, time_condition, time_params).await?;

    Ok(PerformanceMetrics {
        trade_expectancy: 0.0, // Will be calculated from core metrics
        edge: 0.0, // Will be calculated from core metrics
        average_hold_time_days: avg_hold_time_days,
        average_hold_time_winners_days: winners_hold_time,
        average_hold_time_losers_days: losers_hold_time,
        average_position_size: avg_position_size,
        position_size_standard_deviation: position_size_std_dev,
        position_size_variability: if avg_position_size > 0.0 { position_size_std_dev / avg_position_size } else { 0.0 },
        kelly_criterion: 0.0, // Will be calculated separately
        system_quality_number: 0.0, // Will be calculated separately
        payoff_ratio: 0.0, // Will be calculated from core metrics
        average_r_multiple: 0.0, // Will be calculated separately
        r_multiple_standard_deviation: 0.0, // Will be calculated separately
        positive_r_multiple_count: 0, // Will be calculated separately
        negative_r_multiple_count: 0, // Will be calculated separately
        consistency_ratio: 0.0, // Will be calculated separately
        monthly_win_rate: 0.0, // Will be calculated separately
        quarterly_win_rate: 0.0, // Will be calculated separately
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
        Ok(row.get::<f64>(0).unwrap_or(0.0))
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
        Ok(row.get::<f64>(0).unwrap_or(0.0))
    } else {
        Ok(0.0)
    }
}

/// Calculate average risk per trade (entry - stop_loss) * position_size
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
        Ok(row.get::<f64>(0).unwrap_or(0.0))
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
    let mut avg_commission_per_trade = 0.0;
    let mut commission_impact_percentage = 0.0;

    if let Some(row) = rows.next().await? {
        avg_hold_time_days = row.get::<f64>(0).unwrap_or(0.0);
        avg_position_size = row.get::<f64>(1).unwrap_or(0.0);
        position_size_std_dev = row.get::<f64>(2).unwrap_or(0.0);
        avg_commission_per_trade = row.get::<f64>(3).unwrap_or(0.0);
        commission_impact_percentage = row.get::<f64>(4).unwrap_or(0.0);
    }

    // Calculate hold times for winners and losers separately for options
    let winners_hold_time = calculate_options_winners_hold_time(conn, time_condition, time_params).await?;
    let losers_hold_time = calculate_options_losers_hold_time(conn, time_condition, time_params).await?;

    Ok(PerformanceMetrics {
        trade_expectancy: 0.0, // Will be calculated from core metrics
        edge: 0.0, // Will be calculated from core metrics
        average_hold_time_days: avg_hold_time_days,
        average_hold_time_winners_days: winners_hold_time,
        average_hold_time_losers_days: losers_hold_time,
        average_position_size: avg_position_size,
        position_size_standard_deviation: position_size_std_dev,
        position_size_variability: if avg_position_size > 0.0 { position_size_std_dev / avg_position_size } else { 0.0 },
        kelly_criterion: 0.0, // Will be calculated separately
        system_quality_number: 0.0, // Will be calculated separately
        payoff_ratio: 0.0, // Will be calculated from core metrics
        average_r_multiple: 0.0, // Will be calculated separately
        r_multiple_standard_deviation: 0.0, // Will be calculated separately
        positive_r_multiple_count: 0, // Will be calculated separately
        negative_r_multiple_count: 0, // Will be calculated separately
        consistency_ratio: 0.0, // Will be calculated separately
        monthly_win_rate: 0.0, // Will be calculated separately
        quarterly_win_rate: 0.0, // Will be calculated separately
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
        Ok(row.get::<f64>(0).unwrap_or(0.0))
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
        Ok(row.get::<f64>(0).unwrap_or(0.0))
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
        trade_expectancy: 0.0, // Will be calculated from core metrics
        edge: 0.0, // Will be calculated from core metrics
        average_hold_time_days: stocks.average_hold_time_days * stocks_weight + options.average_hold_time_days * options_weight,
        average_hold_time_winners_days: stocks.average_hold_time_winners_days * stocks_weight + options.average_hold_time_winners_days * options_weight,
        average_hold_time_losers_days: stocks.average_hold_time_losers_days * stocks_weight + options.average_hold_time_losers_days * options_weight,
        average_position_size: stocks.average_position_size * stocks_weight + options.average_position_size * options_weight,
        position_size_standard_deviation: stocks.position_size_standard_deviation * stocks_weight + options.position_size_standard_deviation * options_weight,
        position_size_variability: stocks.position_size_variability * stocks_weight + options.position_size_variability * options_weight,
        kelly_criterion: 0.0, // Will be calculated separately
        system_quality_number: 0.0, // Will be calculated separately
        payoff_ratio: 0.0, // Will be calculated from core metrics
        average_r_multiple: 0.0, // Will be calculated separately
        r_multiple_standard_deviation: 0.0, // Will be calculated separately
        positive_r_multiple_count: 0, // Will be calculated separately
        negative_r_multiple_count: 0, // Will be calculated separately
        consistency_ratio: 0.0, // Will be calculated separately
        monthly_win_rate: 0.0, // Will be calculated separately
        quarterly_win_rate: 0.0, // Will be calculated separately
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
