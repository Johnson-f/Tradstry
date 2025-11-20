use anyhow::Result;
use libsql::Connection;
use std::collections::HashMap;
use crate::models::analytics::{GroupedMetrics, GroupType, AnalyticsOptions, CoreMetrics, RiskMetrics, PerformanceMetrics};
use crate::models::stock::stocks::TimeRange;

/// Calculate grouped analytics by symbol, strategy, or other criteria
pub async fn calculate_grouped_analytics(
    conn: &Connection,
    time_range: &TimeRange,
    options: &AnalyticsOptions,
) -> Result<HashMap<String, GroupedMetrics>> {
    let mut grouped_analytics = HashMap::new();
    
    for grouping_type in &options.grouping_types {
        match grouping_type {
            crate::models::analytics::options::GroupingType::Symbol => {
                let symbol_analytics = calculate_symbol_grouped_analytics(conn, time_range).await?;
                grouped_analytics.extend(symbol_analytics);
            },
            crate::models::analytics::options::GroupingType::Strategy => {
                let strategy_analytics = calculate_strategy_grouped_analytics(conn, time_range).await?;
                grouped_analytics.extend(strategy_analytics);
            },
            crate::models::analytics::options::GroupingType::TradeDirection => {
                let direction_analytics = calculate_direction_grouped_analytics(conn, time_range).await?;
                grouped_analytics.extend(direction_analytics);
            },
            crate::models::analytics::options::GroupingType::TimePeriod => {
                let period_analytics = calculate_period_grouped_analytics(conn, time_range).await?;
                grouped_analytics.extend(period_analytics);
            },
        }
    }
    
    Ok(grouped_analytics)
}

/// Calculate analytics grouped by symbol
async fn calculate_symbol_grouped_analytics(
    conn: &Connection,
    time_range: &TimeRange,
) -> Result<HashMap<String, GroupedMetrics>> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    let mut grouped_analytics = HashMap::new();
    
    // Get all symbols from stocks table
    let stocks_sql = format!(
        r#"
        SELECT DISTINCT symbol
        FROM stocks
        WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        "#,
        time_condition
    );

    let mut query_params = Vec::new();
    for param in &time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn
        .prepare(&stocks_sql)
        .await?
        .query(libsql::params_from_iter(query_params.clone()))
        .await?;

    let mut symbols = Vec::new();
    while let Some(row) = rows.next().await? {
        if let Ok(symbol) = row.get::<String>(0) {
            symbols.push(symbol);
        }
    }

    // Get all symbols from options table
    let options_sql = format!(
        r#"
        SELECT DISTINCT symbol
        FROM options
        WHERE status = 'closed' AND exit_price IS NOT NULL AND ({})
        "#,
        time_condition
    );

    let mut rows = conn
        .prepare(&options_sql)
        .await?
        .query(libsql::params_from_iter(query_params))
        .await?;

    while let Some(row) = rows.next().await? {
        if let Ok(symbol) = row.get::<String>(0)
            && !symbols.contains(&symbol)
        {
            symbols.push(symbol);
        }
    }

    // Calculate analytics for each symbol
    for symbol in symbols {
        let core_metrics = calculate_symbol_core_metrics(conn, &symbol, &time_condition, &time_params).await?;
        let risk_metrics = calculate_symbol_risk_metrics(conn, &symbol, &time_condition, &time_params).await?;
        let performance_metrics = calculate_symbol_performance_metrics(conn, &symbol, &time_condition, &time_params).await?;

        grouped_analytics.insert(symbol.clone(), GroupedMetrics {
            group_name: symbol.clone(),
            group_type: GroupType::Symbol,
            core_metrics,
            risk_metrics,
            performance_metrics,
        });
    }

    Ok(grouped_analytics)
}

/// Calculate analytics grouped by strategy (options only)
async fn calculate_strategy_grouped_analytics(
    conn: &Connection,
    time_range: &TimeRange,
) -> Result<HashMap<String, GroupedMetrics>> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    let mut grouped_analytics = HashMap::new();
    
    // Get all strategies from options table
    let sql = format!(
        r#"
        SELECT DISTINCT strategy_type
        FROM options
        WHERE status = 'closed' AND exit_price IS NOT NULL AND ({})
        "#,
        time_condition
    );

    let mut query_params = Vec::new();
    for param in &time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn
        .prepare(&sql)
        .await?
        .query(libsql::params_from_iter(query_params.clone()))
        .await?;

    let mut strategies = Vec::new();
    while let Some(row) = rows.next().await? {
        if let Ok(strategy) = row.get::<String>(0) {
            strategies.push(strategy);
        }
    }

    // Calculate analytics for each strategy
    for strategy in strategies {
        let core_metrics = calculate_strategy_core_metrics(conn, &strategy, &time_condition, &time_params).await?;
        let risk_metrics = calculate_strategy_risk_metrics(conn, &strategy, &time_condition, &time_params).await?;
        let performance_metrics = calculate_strategy_performance_metrics(conn, &strategy, &time_condition, &time_params).await?;

        grouped_analytics.insert(strategy.clone(), GroupedMetrics {
            group_name: strategy.clone(),
            group_type: GroupType::Strategy,
            core_metrics,
            risk_metrics,
            performance_metrics,
        });
    }

    Ok(grouped_analytics)
}

/// Calculate analytics grouped by trade direction
async fn calculate_direction_grouped_analytics(
    conn: &Connection,
    time_range: &TimeRange,
) -> Result<HashMap<String, GroupedMetrics>> {
    let mut grouped_analytics = HashMap::new();
    
    // Bullish trades (BUY stocks, CALL options)
    let bullish_core = calculate_direction_core_metrics(conn, "bullish", time_range).await?;
    let bullish_risk = calculate_direction_risk_metrics(conn, "bullish", time_range).await?;
    let bullish_performance = calculate_direction_performance_metrics(conn, "bullish", time_range).await?;

    grouped_analytics.insert("Bullish".to_string(), GroupedMetrics {
        group_name: "Bullish".to_string(),
        group_type: GroupType::TradeDirection,
        core_metrics: bullish_core,
        risk_metrics: bullish_risk,
        performance_metrics: bullish_performance,
    });

    // Bearish trades (SELL stocks, PUT options)
    let bearish_core = calculate_direction_core_metrics(conn, "bearish", time_range).await?;
    let bearish_risk = calculate_direction_risk_metrics(conn, "bearish", time_range).await?;
    let bearish_performance = calculate_direction_performance_metrics(conn, "bearish", time_range).await?;

    grouped_analytics.insert("Bearish".to_string(), GroupedMetrics {
        group_name: "Bearish".to_string(),
        group_type: GroupType::TradeDirection,
        core_metrics: bearish_core,
        risk_metrics: bearish_risk,
        performance_metrics: bearish_performance,
    });

    Ok(grouped_analytics)
}

/// Calculate analytics grouped by time period
async fn calculate_period_grouped_analytics(
    conn: &Connection,
    time_range: &TimeRange,
) -> Result<HashMap<String, GroupedMetrics>> {
    let mut grouped_analytics = HashMap::new();
    
    use chrono::{Datelike, Utc};
    let now = Utc::now();
    
    // Calculate metrics for different time periods
    let ytd_date = chrono::NaiveDate::from_ymd_opt(now.year(), 1, 1)
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .map(|ndt| chrono::DateTime::from_naive_utc_and_offset(ndt, Utc))
        .unwrap_or(now);
    
    let periods = vec![
        ("daily", "Last 24 Hours", now - chrono::Duration::days(1), now),
        ("weekly", "Last 7 Days", now - chrono::Duration::days(7), now),
        ("90days", "Last 90 Days", now - chrono::Duration::days(90), now),
        ("ytd", "Year to Date", ytd_date, now),
        ("year", "Last Year", now - chrono::Duration::days(365), now),
    ];
    
    for (_period_key, period_name, start_date, end_date) in periods {
        // Create a specific time range for this period
        let period_range = TimeRange::Custom {
            start_date: Some(start_date),
            end_date: Some(end_date),
        };
        
        let core = calculate_period_core_metrics(conn, &period_range, time_range).await?;
        let risk = calculate_period_risk_metrics(conn, &period_range, time_range).await?;
        let performance = calculate_period_performance_metrics(conn, &period_range, time_range).await?;

        grouped_analytics.insert(period_name.to_string(), GroupedMetrics {
            group_name: period_name.to_string(),
        group_type: GroupType::TimePeriod,
            core_metrics: core,
            risk_metrics: risk,
            performance_metrics: performance,
        });
    }

    Ok(grouped_analytics)
}

/// Helper function to safely extract f64 from libsql::Value
fn get_f64_value(row: &libsql::Row, index: usize) -> f64 {
    match row.get::<libsql::Value>(index as i32) {
        Ok(libsql::Value::Integer(i)) => i as f64,
        Ok(libsql::Value::Real(f)) => f,
        Ok(libsql::Value::Null) => 0.0,
        _ => 0.0,
    }
}

/// Helper function to safely extract i64 from libsql::Value
fn get_i64_value(row: &libsql::Row, index: usize) -> i64 {
    match row.get::<libsql::Value>(index as i32) {
        Ok(libsql::Value::Integer(i)) => i,
        Ok(libsql::Value::Null) => 0,
        _ => 0,
    }
}

/// Calculate core metrics for a specific symbol
async fn calculate_symbol_core_metrics(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<CoreMetrics> {
    // Calculate stocks metrics for this symbol
    let stocks_metrics = calculate_symbol_stocks_metrics(conn, symbol, time_condition, time_params).await?;
    
    // Calculate options metrics for this symbol
    let options_metrics = calculate_symbol_options_metrics(conn, symbol, time_condition, time_params).await?;
    
    // Combine metrics using similar logic to core_metrics.rs
    let total_trades = stocks_metrics.total_trades + options_metrics.total_trades;
    let total_winning_trades = stocks_metrics.winning_trades + options_metrics.winning_trades;
    let total_losing_trades = stocks_metrics.losing_trades + options_metrics.losing_trades;
    let total_break_even_trades = stocks_metrics.break_even_trades + options_metrics.break_even_trades;
    
    let total_pnl = stocks_metrics.total_pnl + options_metrics.total_pnl;
    let total_gross_profit = stocks_metrics.gross_profit + options_metrics.gross_profit;
    let total_gross_loss = stocks_metrics.gross_loss + options_metrics.gross_loss;
    let total_commissions = stocks_metrics.total_commissions + options_metrics.total_commissions;
    
    // Weighted averages
    let average_win = if total_winning_trades > 0 {
        (stocks_metrics.average_win * stocks_metrics.winning_trades as f64 + 
         options_metrics.average_win * options_metrics.winning_trades as f64) / total_winning_trades as f64
    } else {
        0.0
    };
    
    let average_loss = if total_losing_trades > 0 {
        (stocks_metrics.average_loss * stocks_metrics.losing_trades as f64 + 
         options_metrics.average_loss * options_metrics.losing_trades as f64) / total_losing_trades as f64
    } else {
        0.0
    };
    
    let stocks_weight = if total_trades > 0 { stocks_metrics.total_trades as f64 / total_trades as f64 } else { 0.0 };
    let average_position_size = stocks_metrics.average_position_size * stocks_weight + 
                                 options_metrics.average_position_size * (1.0 - stocks_weight);
    let average_commission_per_trade = if total_trades > 0 { total_commissions / total_trades as f64 } else { 0.0 };
    
    let biggest_winner = stocks_metrics.biggest_winner.max(options_metrics.biggest_winner);
    let biggest_loser = stocks_metrics.biggest_loser.min(options_metrics.biggest_loser);
    
    let win_rate = if total_trades > 0 { (total_winning_trades as f64 / total_trades as f64) * 100.0 } else { 0.0 };
    let loss_rate = if total_trades > 0 { (total_losing_trades as f64 / total_trades as f64) * 100.0 } else { 0.0 };
    
    let profit_factor = if total_gross_loss != 0.0 {
        total_gross_profit.abs() / total_gross_loss.abs()
    } else if total_gross_profit > 0.0 {
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

    // Calculate consecutive streaks for this symbol
    let (max_consecutive_wins, max_consecutive_losses) = 
        calculate_symbol_consecutive_streaks(conn, symbol, time_condition, time_params).await?;

    Ok(CoreMetrics {
        total_trades,
        winning_trades: total_winning_trades,
        losing_trades: total_losing_trades,
        break_even_trades: total_break_even_trades,
        win_rate,
        loss_rate,
        total_pnl,
        net_profit_loss: total_pnl,
        gross_profit: total_gross_profit,
        gross_loss: total_gross_loss,
        average_win,
        average_loss,
        average_position_size,
        biggest_winner,
        biggest_loser,
        profit_factor,
        win_loss_ratio,
        max_consecutive_wins,
        max_consecutive_losses,
        total_commissions,
        average_commission_per_trade,
    })
}

/// Calculate stocks metrics for a specific symbol
async fn calculate_symbol_stocks_metrics(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<CoreMetrics> {
    let sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
            SUM(CASE WHEN calculated_pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
            SUM(CASE WHEN calculated_pnl = 0 THEN 1 ELSE 0 END) as break_even_trades,
            SUM(calculated_pnl) as total_pnl,
            SUM(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE 0 END) as gross_profit,
            SUM(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE 0 END) as gross_loss,
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl END) as average_win,
            AVG(CASE WHEN calculated_pnl < 0 THEN calculated_pnl END) as average_loss,
            MAX(calculated_pnl) as biggest_winner,
            MIN(calculated_pnl) as biggest_loser,
            SUM(commissions) as total_commissions,
            AVG(commissions) as average_commission_per_trade,
            AVG(number_shares * entry_price) as average_position_size
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE symbol = ? AND exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        )
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(symbol.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn
        .prepare(&sql)
        .await?
        .query(libsql::params_from_iter(query_params))
        .await?;

    if let Some(row) = rows.next().await? {
        let total_trades = get_i64_value(&row, 0) as u32;
        let winning_trades = get_i64_value(&row, 1) as u32;
        let losing_trades = get_i64_value(&row, 2) as u32;
        let break_even_trades = get_i64_value(&row, 3) as u32;
        let total_pnl = get_f64_value(&row, 4);
        let gross_profit = get_f64_value(&row, 5);
        let gross_loss = get_f64_value(&row, 6);
        let average_win = get_f64_value(&row, 7);
        let average_loss = get_f64_value(&row, 8);
        let biggest_winner = get_f64_value(&row, 9);
        let biggest_loser = get_f64_value(&row, 10);
        let total_commissions = get_f64_value(&row, 11);
        let average_commission_per_trade = get_f64_value(&row, 12);
        let average_position_size = get_f64_value(&row, 13);

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

        Ok(CoreMetrics {
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
            max_consecutive_wins: 0,
            max_consecutive_losses: 0,
            total_commissions,
            average_commission_per_trade,
        })
    } else {
    Ok(CoreMetrics::default())
    }
}

/// Calculate options metrics for a specific symbol
async fn calculate_symbol_options_metrics(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<CoreMetrics> {
    let sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
            SUM(CASE WHEN calculated_pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
            SUM(CASE WHEN calculated_pnl = 0 THEN 1 ELSE 0 END) as break_even_trades,
            SUM(calculated_pnl) as total_pnl,
            SUM(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE 0 END) as gross_profit,
            SUM(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE 0 END) as gross_loss,
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl END) as average_win,
            AVG(CASE WHEN calculated_pnl < 0 THEN calculated_pnl END) as average_loss,
            MAX(calculated_pnl) as biggest_winner,
            MIN(calculated_pnl) as biggest_loser,
            SUM(commissions) as total_commissions,
            AVG(commissions) as average_commission_per_trade,
            AVG(premium) as average_position_size
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * total_quantity * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE symbol = ? AND status = 'closed' AND ({})
        )
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(symbol.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn
        .prepare(&sql)
        .await?
        .query(libsql::params_from_iter(query_params))
        .await?;

    if let Some(row) = rows.next().await? {
        let total_trades = get_i64_value(&row, 0) as u32;
        let winning_trades = get_i64_value(&row, 1) as u32;
        let losing_trades = get_i64_value(&row, 2) as u32;
        let break_even_trades = get_i64_value(&row, 3) as u32;
        let total_pnl = get_f64_value(&row, 4);
        let gross_profit = get_f64_value(&row, 5);
        let gross_loss = get_f64_value(&row, 6);
        let average_win = get_f64_value(&row, 7);
        let average_loss = get_f64_value(&row, 8);
        let biggest_winner = get_f64_value(&row, 9);
        let biggest_loser = get_f64_value(&row, 10);
        let total_commissions = get_f64_value(&row, 11);
        let average_commission_per_trade = get_f64_value(&row, 12);
        let average_position_size = get_f64_value(&row, 13);

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

        Ok(CoreMetrics {
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
            max_consecutive_wins: 0,
            max_consecutive_losses: 0,
            total_commissions,
            average_commission_per_trade,
        })
    } else {
    Ok(CoreMetrics::default())
    }
}

/// Calculate risk metrics for a specific symbol
async fn calculate_symbol_risk_metrics(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<RiskMetrics> {
    // Calculate average risk per trade for this symbol
    let avg_risk_per_trade = calculate_symbol_avg_risk(conn, symbol, time_condition, time_params).await?;
    
    // Calculate daily returns for this symbol
    let daily_returns = calculate_symbol_daily_returns(conn, symbol, time_condition, time_params).await?;
    
    // Calculate drawdown metrics
    let drawdown_metrics = calculate_symbol_drawdown_metrics(&daily_returns).await?;
    
    // Calculate simple metrics (simplified version without full VaR)
    let volatility = if daily_returns.len() > 1 {
        let mean = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        let variance = daily_returns.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / (daily_returns.len() - 1) as f64;
        variance.sqrt()
    } else {
        0.0
    };
    
    let downside_deviation = if daily_returns.len() > 1 {
        let downside_returns: Vec<f64> = daily_returns.iter()
            .filter(|&&x| x < 0.0)
            .cloned()
            .collect();
        let mean = downside_returns.iter().sum::<f64>() / downside_returns.len() as f64;
        let variance = downside_returns.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / downside_returns.len() as f64;
        variance.sqrt()
    } else {
        0.0
    };

    // Simplified Sharpe ratio (assuming 0 risk-free rate)
    let sharpe_ratio = if volatility > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return / volatility * (252.0_f64).sqrt() // Annualized
    } else {
        0.0
    };

    // Sortino ratio
    let sortino_ratio = if downside_deviation > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return / downside_deviation * (252.0_f64).sqrt() // Annualized
    } else {
        0.0
    };

    // Recovery factor
    let recovery_factor = if drawdown_metrics.maximum_drawdown > 0.0 {
        let total_return = daily_returns.iter().sum::<f64>();
        total_return / drawdown_metrics.maximum_drawdown
    } else {
        0.0
    };

    // Calmar ratio
    let calmar_ratio = if drawdown_metrics.maximum_drawdown_percentage > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return * 252.0 / drawdown_metrics.maximum_drawdown_percentage
    } else {
        0.0
    };

    // Calculate VaR at 95% and 99% (simplified - using sorted returns)
    let mut sorted_returns = daily_returns.clone();
    sorted_returns.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    
    let var_95 = if !sorted_returns.is_empty() {
        let index = ((1.0 - 0.95) * sorted_returns.len() as f64) as usize;
        sorted_returns.get(index).copied().unwrap_or(0.0)
    } else {
        0.0
    };
    
    let var_99 = if !sorted_returns.is_empty() {
        let index = ((1.0 - 0.99) * sorted_returns.len() as f64) as usize;
        sorted_returns.get(index).copied().unwrap_or(0.0)
    } else {
        0.0
    };

    // Expected shortfall (CVaR) - average of returns below VaR
    let expected_shortfall_95 = if !sorted_returns.is_empty() {
        sorted_returns.iter()
            .filter(|&&x| x <= var_95)
            .sum::<f64>() / sorted_returns.iter().filter(|&&x| x <= var_95).count() as f64
    } else {
        0.0
    };
    
    let expected_shortfall_99 = if !sorted_returns.is_empty() {
        sorted_returns.iter()
            .filter(|&&x| x <= var_99)
            .sum::<f64>() / sorted_returns.iter().filter(|&&x| x <= var_99).count() as f64
    } else {
        0.0
    };

    Ok(RiskMetrics {
        sharpe_ratio,
        sortino_ratio,
        calmar_ratio,
        maximum_drawdown: drawdown_metrics.maximum_drawdown,
        maximum_drawdown_percentage: drawdown_metrics.maximum_drawdown_percentage,
        maximum_drawdown_duration_days: drawdown_metrics.maximum_drawdown_duration_days,
        current_drawdown: drawdown_metrics.current_drawdown,
        var_95,
        var_99,
        expected_shortfall_95,
        expected_shortfall_99,
        average_risk_per_trade: avg_risk_per_trade,
        risk_reward_ratio: 0.0, // Could be calculated from core metrics
        volatility,
        downside_deviation,
        ulcer_index: drawdown_metrics.ulcer_index,
        recovery_factor,
        sterling_ratio: 0.0, // Simplified - not calculating full Sterling ratio
    })
}

/// Calculate performance metrics for a specific symbol
async fn calculate_symbol_performance_metrics(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<PerformanceMetrics> {
    // Get core metrics to calculate expectancy and edge
    let core = calculate_symbol_core_metrics(conn, symbol, time_condition, time_params).await?;
    
    // Calculate trade expectancy
    let trade_expectancy = if core.total_trades > 0 {
        (core.average_win * core.win_rate / 100.0) - (core.average_loss.abs() * core.loss_rate / 100.0)
    } else {
        0.0
    };

    // Calculate edge
    let edge = if core.average_position_size > 0.0 {
        trade_expectancy / core.average_position_size
    } else {
        0.0
    };

    // Calculate hold times
    let avg_hold_time = calculate_symbol_avg_hold_time(conn, symbol, time_condition, time_params).await?;
    let winners_hold_time = calculate_symbol_winners_hold_time(conn, symbol, time_condition, time_params).await?;
    let losers_hold_time = calculate_symbol_losers_hold_time(conn, symbol, time_condition, time_params).await?;

    // Calculate position sizing
    let position_size = calculate_symbol_position_sizing(conn, symbol, time_condition, time_params).await?;

    // Calculate payoff ratio
    let payoff_ratio = if core.average_loss != 0.0 {
        core.average_win / core.average_loss.abs()
    } else {
        0.0
    };

    // Commission impact
    let commission_impact_percentage = if core.total_pnl != 0.0 {
        (core.total_commissions / core.total_pnl.abs()) * 100.0
    } else {
        0.0
    };

    Ok(PerformanceMetrics {
        trade_expectancy,
        edge,
        average_hold_time_days: avg_hold_time,
        average_hold_time_winners_days: winners_hold_time,
        average_hold_time_losers_days: losers_hold_time,
        average_position_size: position_size.avg_size,
        position_size_standard_deviation: position_size.std_dev,
        position_size_variability: position_size.variability,
        kelly_criterion: 0.0, // Advanced calculation
        system_quality_number: 0.0, // Advanced calculation
        payoff_ratio,
        average_r_multiple: 0.0, // Could be calculated
        r_multiple_standard_deviation: 0.0,
        positive_r_multiple_count: 0,
        negative_r_multiple_count: 0,
        consistency_ratio: 0.0,
        monthly_win_rate: 0.0,
        quarterly_win_rate: 0.0,
        average_slippage: 0.0,
        commission_impact_percentage,
    })
}

// Helper structures
struct DrawdownMetrics {
    maximum_drawdown: f64,
    maximum_drawdown_percentage: f64,
    maximum_drawdown_duration_days: u32,
    current_drawdown: f64,
    ulcer_index: f64,
}

struct PositionSizing {
    avg_size: f64,
    std_dev: f64,
    variability: f64,
}

// Helper functions for symbol-specific calculations
async fn calculate_symbol_avg_risk(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    // Stocks risk
    let stocks_sql = format!(
        r#"
        SELECT AVG(ABS(entry_price - stop_loss) * number_shares) as avg_risk_stocks
        FROM stocks
        WHERE symbol = ? AND stop_loss IS NOT NULL AND ({})
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(symbol.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut stocks_risk = 0.0;
    if let Some(row) = conn.prepare(&stocks_sql).await?.query(libsql::params_from_iter(query_params.clone())).await?.next().await? {
        stocks_risk = get_f64_value(&row, 0);
    }

    // Options risk (premium paid)
    let options_sql = format!(
        r#"
        SELECT AVG(premium) as avg_risk_options
        FROM options
        WHERE symbol = ? AND status = 'closed' AND ({})
        "#,
        time_condition
    );

    let mut options_risk = 0.0;
    if let Some(row) = conn.prepare(&options_sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        options_risk = get_f64_value(&row, 0);
    }

    Ok((stocks_risk + options_risk) / 2.0)
}

async fn calculate_symbol_daily_returns(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<Vec<f64>> {
    let sql = format!(
        r#"
        SELECT 
            DATE(exit_date) as trade_date,
            SUM(calculated_pnl) as daily_pnl
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE symbol = ? AND exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
            
            UNION ALL
            
            SELECT 
                *,
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * total_quantity * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE symbol = ? AND status = 'closed' AND exit_price IS NOT NULL AND ({})
        )
        GROUP BY DATE(exit_date)
        ORDER BY trade_date
        "#,
        time_condition, time_condition
    );

    let mut query_params = vec![libsql::Value::Text(symbol.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }
    query_params.push(libsql::Value::Text(symbol.to_string()));
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?;
    
    let mut daily_returns = Vec::new();
    while let Some(row) = rows.next().await? {
        daily_returns.push(get_f64_value(&row, 1));
    }

    Ok(daily_returns)
}

async fn calculate_symbol_drawdown_metrics(daily_returns: &[f64]) -> Result<DrawdownMetrics> {
    if daily_returns.is_empty() {
        return Ok(DrawdownMetrics {
            maximum_drawdown: 0.0,
            maximum_drawdown_percentage: 0.0,
            maximum_drawdown_duration_days: 0,
            current_drawdown: 0.0,
            ulcer_index: 0.0,
        });
    }

    let mut cumulative_pnl: f64 = 0.0;
    let mut peak: f64 = 0.0;
    let mut max_drawdown: f64 = 0.0;
    let mut max_drawdown_percentage: f64 = 0.0;
    let mut current_drawdown_duration = 0;
    let mut max_drawdown_duration = 0;
    let mut ulcer_sum: f64 = 0.0;

    for &pnl in daily_returns {
        cumulative_pnl += pnl;
        
        if cumulative_pnl > peak {
            peak = cumulative_pnl;
            current_drawdown_duration = 0;
        } else {
            current_drawdown_duration += 1;
            max_drawdown_duration = max_drawdown_duration.max(current_drawdown_duration);
        }

        let drawdown: f64 = peak - cumulative_pnl;
        max_drawdown = max_drawdown.max(drawdown);
        
        if peak > 0.0 {
            let drawdown_percentage: f64 = (drawdown / peak) * 100.0;
            max_drawdown_percentage = max_drawdown_percentage.max(drawdown_percentage);
            ulcer_sum += ((drawdown_percentage / 100.0) * 100.0).powi(2);
        }
    }

    let current_drawdown = peak - cumulative_pnl;
    let ulcer_index = (ulcer_sum / daily_returns.len() as f64).sqrt();

    Ok(DrawdownMetrics {
        maximum_drawdown: max_drawdown,
        maximum_drawdown_percentage: max_drawdown_percentage,
        maximum_drawdown_duration_days: max_drawdown_duration,
        current_drawdown,
        ulcer_index,
    })
}

async fn calculate_symbol_avg_hold_time(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time
        FROM stocks
        WHERE symbol = ? AND exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(symbol.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

async fn calculate_symbol_winners_hold_time(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time_winners
        FROM stocks
        WHERE symbol = ? AND exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
          AND ((trade_type = 'BUY' AND exit_price > entry_price) 
               OR (trade_type = 'SELL' AND exit_price < entry_price))
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(symbol.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

async fn calculate_symbol_losers_hold_time(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time_losers
        FROM stocks
        WHERE symbol = ? AND exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
          AND ((trade_type = 'BUY' AND exit_price < entry_price)
               OR (trade_type = 'SELL' AND exit_price > entry_price))
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(symbol.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

async fn calculate_symbol_position_sizing(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<PositionSizing> {
    let sql = format!(
        r#"
        SELECT 
            AVG(number_shares * entry_price) as avg_position_size,
            STDDEV(number_shares * entry_price) as position_size_std_dev
        FROM stocks
        WHERE symbol = ? AND exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(symbol.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?;
    
    if let Some(row) = rows.next().await? {
        let avg_size = get_f64_value(&row, 0);
        let std_dev = get_f64_value(&row, 1);
        let variability = if avg_size > 0.0 { std_dev / avg_size } else { 0.0 };
        
        Ok(PositionSizing {
            avg_size,
            std_dev,
            variability,
        })
    } else {
        Ok(PositionSizing {
            avg_size: 0.0,
            std_dev: 0.0,
            variability: 0.0,
        })
    }
}

// Helper functions for calculating metrics by strategy

/// Calculate core metrics for a specific strategy
async fn calculate_strategy_core_metrics(
    conn: &Connection,
    strategy: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<CoreMetrics> {
    // Strategies are only in the options table
    let sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
            SUM(CASE WHEN calculated_pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
            SUM(CASE WHEN calculated_pnl = 0 THEN 1 ELSE 0 END) as break_even_trades,
            SUM(calculated_pnl) as total_pnl,
            SUM(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE 0 END) as gross_profit,
            SUM(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE 0 END) as gross_loss,
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl END) as average_win,
            AVG(CASE WHEN calculated_pnl < 0 THEN calculated_pnl END) as average_loss,
            MAX(calculated_pnl) as biggest_winner,
            MIN(calculated_pnl) as biggest_loser,
            SUM(commissions) as total_commissions,
            AVG(commissions) as average_commission_per_trade,
            AVG(premium) as average_position_size
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * total_quantity * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE strategy_type = ? AND status = 'closed' AND ({})
        )
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(strategy.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn
        .prepare(&sql)
        .await?
        .query(libsql::params_from_iter(query_params))
        .await?;

    if let Some(row) = rows.next().await? {
        let total_trades = get_i64_value(&row, 0) as u32;
        let winning_trades = get_i64_value(&row, 1) as u32;
        let losing_trades = get_i64_value(&row, 2) as u32;
        let break_even_trades = get_i64_value(&row, 3) as u32;
        let total_pnl = get_f64_value(&row, 4);
        let gross_profit = get_f64_value(&row, 5);
        let gross_loss = get_f64_value(&row, 6);
        let average_win = get_f64_value(&row, 7);
        let average_loss = get_f64_value(&row, 8);
        let biggest_winner = get_f64_value(&row, 9);
        let biggest_loser = get_f64_value(&row, 10);
        let total_commissions = get_f64_value(&row, 11);
        let average_commission_per_trade = get_f64_value(&row, 12);
        let average_position_size = get_f64_value(&row, 13);

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

        // Calculate consecutive streaks for this strategy
        let (max_consecutive_wins, max_consecutive_losses) = 
            calculate_strategy_consecutive_streaks(conn, strategy, time_condition, time_params).await?;

        Ok(CoreMetrics {
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
            max_consecutive_wins,
            max_consecutive_losses,
            total_commissions,
            average_commission_per_trade,
        })
    } else {
    Ok(CoreMetrics::default())
    }
}

/// Calculate risk metrics for a specific strategy
async fn calculate_strategy_risk_metrics(
    conn: &Connection,
    strategy: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<RiskMetrics> {
    // Calculate average risk per trade for this strategy
    let avg_risk_per_trade = calculate_strategy_avg_risk(conn, strategy, time_condition, time_params).await?;
    
    // Calculate daily returns for this strategy
    let daily_returns = calculate_strategy_daily_returns(conn, strategy, time_condition, time_params).await?;
    
    // Calculate drawdown metrics (reuse the symbol version)
    let drawdown_metrics = calculate_symbol_drawdown_metrics(&daily_returns).await?;
    
    // Calculate volatility and other metrics (reuse the symbol version logic)
    let volatility = if daily_returns.len() > 1 {
        let mean = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        let variance = daily_returns.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / (daily_returns.len() - 1) as f64;
        variance.sqrt()
    } else {
        0.0
    };
    
    let downside_deviation = if daily_returns.len() > 1 {
        let downside_returns: Vec<f64> = daily_returns.iter()
            .filter(|&&x| x < 0.0)
            .cloned()
            .collect();
        let mean = downside_returns.iter().sum::<f64>() / downside_returns.len() as f64;
        let variance = downside_returns.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / downside_returns.len() as f64;
        variance.sqrt()
    } else {
        0.0
    };

    let sharpe_ratio = if volatility > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return / volatility * (252.0_f64).sqrt()
    } else {
        0.0
    };

    let sortino_ratio = if downside_deviation > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return / downside_deviation * (252.0_f64).sqrt()
    } else {
        0.0
    };

    let recovery_factor = if drawdown_metrics.maximum_drawdown > 0.0 {
        let total_return = daily_returns.iter().sum::<f64>();
        total_return / drawdown_metrics.maximum_drawdown
    } else {
        0.0
    };

    let calmar_ratio = if drawdown_metrics.maximum_drawdown_percentage > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return * 252.0 / drawdown_metrics.maximum_drawdown_percentage
    } else {
        0.0
    };

    let mut sorted_returns = daily_returns.clone();
    sorted_returns.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    
    let var_95 = if !sorted_returns.is_empty() {
        let index = ((1.0 - 0.95) * sorted_returns.len() as f64) as usize;
        sorted_returns.get(index).copied().unwrap_or(0.0)
    } else {
        0.0
    };
    
    let var_99 = if !sorted_returns.is_empty() {
        let index = ((1.0 - 0.99) * sorted_returns.len() as f64) as usize;
        sorted_returns.get(index).copied().unwrap_or(0.0)
    } else {
        0.0
    };

    let expected_shortfall_95 = if !sorted_returns.is_empty() {
        sorted_returns.iter()
            .filter(|&&x| x <= var_95)
            .sum::<f64>() / sorted_returns.iter().filter(|&&x| x <= var_95).count() as f64
    } else {
        0.0
    };
    
    let expected_shortfall_99 = if !sorted_returns.is_empty() {
        sorted_returns.iter()
            .filter(|&&x| x <= var_99)
            .sum::<f64>() / sorted_returns.iter().filter(|&&x| x <= var_99).count() as f64
    } else {
        0.0
    };

    Ok(RiskMetrics {
        sharpe_ratio,
        sortino_ratio,
        calmar_ratio,
        maximum_drawdown: drawdown_metrics.maximum_drawdown,
        maximum_drawdown_percentage: drawdown_metrics.maximum_drawdown_percentage,
        maximum_drawdown_duration_days: drawdown_metrics.maximum_drawdown_duration_days,
        current_drawdown: drawdown_metrics.current_drawdown,
        var_95,
        var_99,
        expected_shortfall_95,
        expected_shortfall_99,
        average_risk_per_trade: avg_risk_per_trade,
        risk_reward_ratio: 0.0,
        volatility,
        downside_deviation,
        ulcer_index: drawdown_metrics.ulcer_index,
        recovery_factor,
        sterling_ratio: 0.0,
    })
}

/// Calculate performance metrics for a specific strategy
async fn calculate_strategy_performance_metrics(
    conn: &Connection,
    strategy: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<PerformanceMetrics> {
    // Get core metrics
    let core = calculate_strategy_core_metrics(conn, strategy, time_condition, time_params).await?;
    
    let trade_expectancy = if core.total_trades > 0 {
        (core.average_win * core.win_rate / 100.0) - (core.average_loss.abs() * core.loss_rate / 100.0)
    } else {
        0.0
    };

    let edge = if core.average_position_size > 0.0 {
        trade_expectancy / core.average_position_size
    } else {
        0.0
    };

    // Calculate hold times for options
    let avg_hold_time = calculate_strategy_avg_hold_time(conn, strategy, time_condition, time_params).await?;
    let winners_hold_time = calculate_strategy_winners_hold_time(conn, strategy, time_condition, time_params).await?;
    let losers_hold_time = calculate_strategy_losers_hold_time(conn, strategy, time_condition, time_params).await?;

    // Calculate position sizing
    let position_size = calculate_strategy_position_sizing(conn, strategy, time_condition, time_params).await?;

    let payoff_ratio = if core.average_loss != 0.0 {
        core.average_win / core.average_loss.abs()
    } else {
        0.0
    };

    let commission_impact_percentage = if core.total_pnl != 0.0 {
        (core.total_commissions / core.total_pnl.abs()) * 100.0
    } else {
        0.0
    };

    Ok(PerformanceMetrics {
        trade_expectancy,
        edge,
        average_hold_time_days: avg_hold_time,
        average_hold_time_winners_days: winners_hold_time,
        average_hold_time_losers_days: losers_hold_time,
        average_position_size: position_size.avg_size,
        position_size_standard_deviation: position_size.std_dev,
        position_size_variability: position_size.variability,
        kelly_criterion: 0.0,
        system_quality_number: 0.0,
        payoff_ratio,
        average_r_multiple: 0.0,
        r_multiple_standard_deviation: 0.0,
        positive_r_multiple_count: 0,
        negative_r_multiple_count: 0,
        consistency_ratio: 0.0,
        monthly_win_rate: 0.0,
        quarterly_win_rate: 0.0,
        average_slippage: 0.0,
        commission_impact_percentage,
    })
}

// Helper functions for strategy-specific calculations
async fn calculate_strategy_avg_risk(
    conn: &Connection,
    strategy: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(premium) as avg_risk
        FROM options
        WHERE strategy_type = ? AND status = 'closed' AND ({})
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(strategy.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

async fn calculate_strategy_daily_returns(
    conn: &Connection,
    strategy: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<Vec<f64>> {
    let sql = format!(
        r#"
        SELECT 
            DATE(exit_date) as trade_date,
            SUM(calculated_pnl) as daily_pnl
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * total_quantity * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE strategy_type = ? AND status = 'closed' AND exit_price IS NOT NULL AND ({})
        )
        GROUP BY DATE(exit_date)
        ORDER BY trade_date
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(strategy.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?;
    
    let mut daily_returns = Vec::new();
    while let Some(row) = rows.next().await? {
        daily_returns.push(get_f64_value(&row, 1));
    }

    Ok(daily_returns)
}

async fn calculate_strategy_avg_hold_time(
    conn: &Connection,
    strategy: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time
        FROM options
        WHERE strategy_type = ? AND status = 'closed' AND exit_date IS NOT NULL AND ({})
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(strategy.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

async fn calculate_strategy_winners_hold_time(
    conn: &Connection,
    strategy: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time_winners
        FROM options
        WHERE strategy_type = ? AND status = 'closed' AND exit_date IS NOT NULL AND ({})
          AND exit_price > entry_price
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(strategy.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

async fn calculate_strategy_losers_hold_time(
    conn: &Connection,
    strategy: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<f64> {
    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time_losers
        FROM options
        WHERE strategy_type = ? AND status = 'closed' AND exit_date IS NOT NULL AND ({})
          AND exit_price < entry_price
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(strategy.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

async fn calculate_strategy_position_sizing(
    conn: &Connection,
    strategy: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<PositionSizing> {
    let sql = format!(
        r#"
        SELECT 
            AVG(premium) as avg_position_size,
            STDDEV(premium) as position_size_std_dev
        FROM options
        WHERE strategy_type = ? AND status = 'closed' AND ({})
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(strategy.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?;
    
    if let Some(row) = rows.next().await? {
        let avg_size = get_f64_value(&row, 0);
        let std_dev = get_f64_value(&row, 1);
        let variability = if avg_size > 0.0 { std_dev / avg_size } else { 0.0 };
        
        Ok(PositionSizing {
            avg_size,
            std_dev,
            variability,
        })
    } else {
        Ok(PositionSizing {
            avg_size: 0.0,
            std_dev: 0.0,
            variability: 0.0,
        })
    }
}

// Helper functions for calculating metrics by direction

/// Calculate core metrics for a specific trade direction (bullish/bearish)
async fn calculate_direction_core_metrics(
    conn: &Connection,
    direction: &str,
    time_range: &TimeRange,
) -> Result<CoreMetrics> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    
    // Determine direction filters
    let (stocks_filter, options_filter) = match direction {
        "bullish" => ("trade_type = 'BUY'", "option_type = 'CALL'"),
        "bearish" => ("trade_type = 'SELL'", "option_type = 'PUT'"),
        _ => return Ok(CoreMetrics::default()),
    };

    // Calculate stocks metrics
    let stocks_sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
            SUM(CASE WHEN calculated_pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
            SUM(CASE WHEN calculated_pnl = 0 THEN 1 ELSE 0 END) as break_even_trades,
            SUM(calculated_pnl) as total_pnl,
            SUM(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE 0 END) as gross_profit,
            SUM(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE 0 END) as gross_loss,
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl END) as average_win,
            AVG(CASE WHEN calculated_pnl < 0 THEN calculated_pnl END) as average_loss,
            MAX(calculated_pnl) as biggest_winner,
            MIN(calculated_pnl) as biggest_loser,
            SUM(commissions) as total_commissions,
            AVG(commissions) as average_commission_per_trade,
            AVG(number_shares * entry_price) as average_position_size
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE {} AND exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        )
        "#,
        stocks_filter, time_condition
    );

    let mut query_params_stocks = Vec::new();
    for param in &time_params {
        query_params_stocks.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut stocks_metrics = CoreMetrics::default();
    if let Some(row) = conn.prepare(&stocks_sql).await?.query(libsql::params_from_iter(query_params_stocks.clone())).await?.next().await? {
        stocks_metrics = build_core_metrics_from_row(&row)?;
    }

    // Calculate options metrics
    let options_sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
            SUM(CASE WHEN calculated_pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
            SUM(CASE WHEN calculated_pnl = 0 THEN 1 ELSE 0 END) as break_even_trades,
            SUM(calculated_pnl) as total_pnl,
            SUM(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE 0 END) as gross_profit,
            SUM(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE 0 END) as gross_loss,
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl END) as average_win,
            AVG(CASE WHEN calculated_pnl < 0 THEN calculated_pnl END) as average_loss,
            MAX(calculated_pnl) as biggest_winner,
            MIN(calculated_pnl) as biggest_loser,
            SUM(commissions) as total_commissions,
            AVG(commissions) as average_commission_per_trade,
            AVG(premium) as average_position_size
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * total_quantity * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE {} AND status = 'closed' AND ({})
        )
        "#,
        options_filter, time_condition
    );

    let mut options_metrics = CoreMetrics::default();
    if let Some(row) = conn.prepare(&options_sql).await?.query(libsql::params_from_iter(query_params_stocks)).await?.next().await? {
        options_metrics = build_core_metrics_from_row(&row)?;
    }

    // Combine metrics
    let total_trades = stocks_metrics.total_trades + options_metrics.total_trades;
    let total_winning_trades = stocks_metrics.winning_trades + options_metrics.winning_trades;
    let total_losing_trades = stocks_metrics.losing_trades + options_metrics.losing_trades;
    let total_break_even_trades = stocks_metrics.break_even_trades + options_metrics.break_even_trades;
    
    let total_pnl = stocks_metrics.total_pnl + options_metrics.total_pnl;
    let total_gross_profit = stocks_metrics.gross_profit + options_metrics.gross_profit;
    let total_gross_loss = stocks_metrics.gross_loss + options_metrics.gross_loss;
    let total_commissions = stocks_metrics.total_commissions + options_metrics.total_commissions;
    
    let average_win = if total_winning_trades > 0 {
        (stocks_metrics.average_win * stocks_metrics.winning_trades as f64 + 
         options_metrics.average_win * options_metrics.winning_trades as f64) / total_winning_trades as f64
    } else {
        0.0
    };
    
    let average_loss = if total_losing_trades > 0 {
        (stocks_metrics.average_loss * stocks_metrics.losing_trades as f64 + 
         options_metrics.average_loss * options_metrics.losing_trades as f64) / total_losing_trades as f64
    } else {
        0.0
    };
    
    let stocks_weight = if total_trades > 0 { stocks_metrics.total_trades as f64 / total_trades as f64 } else { 0.0 };
    let average_position_size = stocks_metrics.average_position_size * stocks_weight + 
                                 options_metrics.average_position_size * (1.0 - stocks_weight);
    let average_commission_per_trade = if total_trades > 0 { total_commissions / total_trades as f64 } else { 0.0 };
    
    let biggest_winner = stocks_metrics.biggest_winner.max(options_metrics.biggest_winner);
    let biggest_loser = stocks_metrics.biggest_loser.min(options_metrics.biggest_loser);
    
    let win_rate = if total_trades > 0 { (total_winning_trades as f64 / total_trades as f64) * 100.0 } else { 0.0 };
    let loss_rate = if total_trades > 0 { (total_losing_trades as f64 / total_trades as f64) * 100.0 } else { 0.0 };
    
    let profit_factor = if total_gross_loss != 0.0 {
        total_gross_profit.abs() / total_gross_loss.abs()
    } else if total_gross_profit > 0.0 {
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

    // Calculate consecutive streaks for this direction
    let (max_consecutive_wins, max_consecutive_losses) = 
        calculate_direction_consecutive_streaks(conn, direction, &time_condition, &time_params).await?;

    Ok(CoreMetrics {
        total_trades,
        winning_trades: total_winning_trades,
        losing_trades: total_losing_trades,
        break_even_trades: total_break_even_trades,
        win_rate,
        loss_rate,
        total_pnl,
        net_profit_loss: total_pnl,
        gross_profit: total_gross_profit,
        gross_loss: total_gross_loss,
        average_win,
        average_loss,
        average_position_size,
        biggest_winner,
        biggest_loser,
        profit_factor,
        win_loss_ratio,
        max_consecutive_wins,
        max_consecutive_losses,
        total_commissions,
        average_commission_per_trade,
    })
}

/// Helper function to build CoreMetrics from a row
fn build_core_metrics_from_row(row: &libsql::Row) -> Result<CoreMetrics> {
    let total_trades = get_i64_value(row, 0) as u32;
    let winning_trades = get_i64_value(row, 1) as u32;
    let losing_trades = get_i64_value(row, 2) as u32;
    let break_even_trades = get_i64_value(row, 3) as u32;
    let total_pnl = get_f64_value(row, 4);
    let gross_profit = get_f64_value(row, 5);
    let gross_loss = get_f64_value(row, 6);
    let average_win = get_f64_value(row, 7);
    let average_loss = get_f64_value(row, 8);
    let biggest_winner = get_f64_value(row, 9);
    let biggest_loser = get_f64_value(row, 10);
    let total_commissions = get_f64_value(row, 11);
    let average_commission_per_trade = get_f64_value(row, 12);
    let average_position_size = get_f64_value(row, 13);

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

    Ok(CoreMetrics {
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
        max_consecutive_wins: 0,
        max_consecutive_losses: 0,
        total_commissions,
        average_commission_per_trade,
    })
}

/// Calculate risk metrics for a specific trade direction
async fn calculate_direction_risk_metrics(
    conn: &Connection,
    direction: &str,
    time_range: &TimeRange,
) -> Result<RiskMetrics> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    
    // Calculate daily returns for this direction
    let daily_returns = calculate_direction_daily_returns(conn, direction, &time_condition, &time_params).await?;
    
    // Calculate drawdown metrics
    let drawdown_metrics = calculate_symbol_drawdown_metrics(&daily_returns).await?;
    
    // Calculate volatility metrics
    let volatility = if daily_returns.len() > 1 {
        let mean = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        let variance = daily_returns.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / (daily_returns.len() - 1) as f64;
        variance.sqrt()
    } else {
        0.0
    };
    
    let downside_deviation = if daily_returns.len() > 1 {
        let downside_returns: Vec<f64> = daily_returns.iter()
            .filter(|&&x| x < 0.0)
            .cloned()
            .collect();
        let mean = downside_returns.iter().sum::<f64>() / downside_returns.len() as f64;
        let variance = downside_returns.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / downside_returns.len() as f64;
        variance.sqrt()
    } else {
        0.0
    };

    let sharpe_ratio = if volatility > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return / volatility * (252.0_f64).sqrt()
    } else {
        0.0
    };

    let sortino_ratio = if downside_deviation > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return / downside_deviation * (252.0_f64).sqrt()
    } else {
        0.0
    };

    let recovery_factor = if drawdown_metrics.maximum_drawdown > 0.0 {
        let total_return = daily_returns.iter().sum::<f64>();
        total_return / drawdown_metrics.maximum_drawdown
    } else {
        0.0
    };

    let calmar_ratio = if drawdown_metrics.maximum_drawdown_percentage > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return * 252.0 / drawdown_metrics.maximum_drawdown_percentage
    } else {
        0.0
    };

    let mut sorted_returns = daily_returns.clone();
    sorted_returns.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    
    let var_95 = if !sorted_returns.is_empty() {
        let index = ((1.0 - 0.95) * sorted_returns.len() as f64) as usize;
        sorted_returns.get(index).copied().unwrap_or(0.0)
    } else {
        0.0
    };
    
    let var_99 = if !sorted_returns.is_empty() {
        let index = ((1.0 - 0.99) * sorted_returns.len() as f64) as usize;
        sorted_returns.get(index).copied().unwrap_or(0.0)
    } else {
        0.0
    };

    let expected_shortfall_95 = if !sorted_returns.is_empty() {
        sorted_returns.iter()
            .filter(|&&x| x <= var_95)
            .sum::<f64>() / sorted_returns.iter().filter(|&&x| x <= var_95).count() as f64
    } else {
        0.0
    };
    
    let expected_shortfall_99 = if !sorted_returns.is_empty() {
        sorted_returns.iter()
            .filter(|&&x| x <= var_99)
            .sum::<f64>() / sorted_returns.iter().filter(|&&x| x <= var_99).count() as f64
    } else {
        0.0
    };

    Ok(RiskMetrics {
        sharpe_ratio,
        sortino_ratio,
        calmar_ratio,
        maximum_drawdown: drawdown_metrics.maximum_drawdown,
        maximum_drawdown_percentage: drawdown_metrics.maximum_drawdown_percentage,
        maximum_drawdown_duration_days: drawdown_metrics.maximum_drawdown_duration_days,
        current_drawdown: drawdown_metrics.current_drawdown,
        var_95,
        var_99,
        expected_shortfall_95,
        expected_shortfall_99,
        average_risk_per_trade: 0.0, // Could be calculated
        risk_reward_ratio: 0.0,
        volatility,
        downside_deviation,
        ulcer_index: drawdown_metrics.ulcer_index,
        recovery_factor,
        sterling_ratio: 0.0,
    })
}

/// Calculate performance metrics for a specific trade direction
async fn calculate_direction_performance_metrics(
    conn: &Connection,
    direction: &str,
    time_range: &TimeRange,
) -> Result<PerformanceMetrics> {
    // Get core metrics
    let core = calculate_direction_core_metrics(conn, direction, time_range).await?;
    
    let trade_expectancy = if core.total_trades > 0 {
        (core.average_win * core.win_rate / 100.0) - (core.average_loss.abs() * core.loss_rate / 100.0)
    } else {
        0.0
    };

    let edge = if core.average_position_size > 0.0 {
        trade_expectancy / core.average_position_size
    } else {
        0.0
    };

    // Calculate hold times
    let avg_hold_time = calculate_direction_avg_hold_time(conn, direction, time_range).await?;
    let winners_hold_time = calculate_direction_winners_hold_time(conn, direction, time_range).await?;
    let losers_hold_time = calculate_direction_losers_hold_time(conn, direction, time_range).await?;

    let payoff_ratio = if core.average_loss != 0.0 {
        core.average_win / core.average_loss.abs()
    } else {
        0.0
    };

    let commission_impact_percentage = if core.total_pnl != 0.0 {
        (core.total_commissions / core.total_pnl.abs()) * 100.0
    } else {
        0.0
    };

    Ok(PerformanceMetrics {
        trade_expectancy,
        edge,
        average_hold_time_days: avg_hold_time,
        average_hold_time_winners_days: winners_hold_time,
        average_hold_time_losers_days: losers_hold_time,
        average_position_size: core.average_position_size,
        position_size_standard_deviation: 0.0, // Could be calculated
        position_size_variability: 0.0,
        kelly_criterion: 0.0,
        system_quality_number: 0.0,
        payoff_ratio,
        average_r_multiple: 0.0,
        r_multiple_standard_deviation: 0.0,
        positive_r_multiple_count: 0,
        negative_r_multiple_count: 0,
        consistency_ratio: 0.0,
        monthly_win_rate: 0.0,
        quarterly_win_rate: 0.0,
        average_slippage: 0.0,
        commission_impact_percentage,
    })
}

// Helper functions for direction-specific calculations
async fn calculate_direction_daily_returns(
    conn: &Connection,
    direction: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<Vec<f64>> {
    let (stocks_filter, options_filter) = match direction {
        "bullish" => ("trade_type = 'BUY'", "option_type = 'CALL'"),
        "bearish" => ("trade_type = 'SELL'", "option_type = 'PUT'"),
        _ => return Ok(Vec::new()),
    };

    let sql = format!(
        r#"
        SELECT 
            DATE(exit_date) as trade_date,
            SUM(calculated_pnl) as daily_pnl
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                    WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                    ELSE 0
                END as calculated_pnl
            FROM stocks
            WHERE {} AND exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
            
            UNION ALL
            
            SELECT 
                *,
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * total_quantity * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE {} AND status = 'closed' AND exit_price IS NOT NULL AND ({})
        )
        GROUP BY DATE(exit_date)
        ORDER BY trade_date
        "#,
        stocks_filter, time_condition, options_filter, time_condition
    );

    let mut query_params = Vec::new();
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?;
    
    let mut daily_returns = Vec::new();
    while let Some(row) = rows.next().await? {
        daily_returns.push(get_f64_value(&row, 1));
    }

    Ok(daily_returns)
}

async fn calculate_direction_avg_hold_time(
    conn: &Connection,
    direction: &str,
    time_range: &TimeRange,
) -> Result<f64> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    let (stocks_filter, options_filter) = match direction {
        "bullish" => ("trade_type = 'BUY'", "option_type = 'CALL'"),
        "bearish" => ("trade_type = 'SELL'", "option_type = 'PUT'"),
        _ => return Ok(0.0),
    };

    let sql = format!(
        r#"
        SELECT 
            (SUM(CASE WHEN source = 'stocks' THEN hold_days ELSE 0 END) + 
             SUM(CASE WHEN source = 'options' THEN hold_days ELSE 0 END)) / 
            COUNT(*) as avg_hold_time
        FROM (
            SELECT 
                JULIANDAY(exit_date) - JULIANDAY(entry_date) as hold_days,
                'stocks' as source
            FROM stocks
            WHERE {} AND exit_date IS NOT NULL AND ({})
            
            UNION ALL
            
            SELECT 
                JULIANDAY(exit_date) - JULIANDAY(entry_date) as hold_days,
                'options' as source
            FROM options
            WHERE {} AND status = 'closed' AND exit_date IS NOT NULL AND ({})
        )
        "#,
        stocks_filter, time_condition, options_filter, time_condition
    );

    let mut query_params = Vec::new();
    for param in &time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }
    for param in &time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

async fn calculate_direction_winners_hold_time(
    conn: &Connection,
    direction: &str,
    time_range: &TimeRange,
) -> Result<f64> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    let stocks_filter = match direction {
        "bullish" => "trade_type = 'BUY' AND exit_price > entry_price",
        "bearish" => "trade_type = 'SELL' AND exit_price < entry_price",
        _ => return Ok(0.0),
    };

    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time
        FROM stocks
        WHERE {} AND exit_date IS NOT NULL AND ({})
        "#,
        stocks_filter, time_condition
    );

    let mut query_params = Vec::new();
    for param in &time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

async fn calculate_direction_losers_hold_time(
    conn: &Connection,
    direction: &str,
    time_range: &TimeRange,
) -> Result<f64> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    let stocks_filter = match direction {
        "bullish" => "trade_type = 'BUY' AND exit_price < entry_price",
        "bearish" => "trade_type = 'SELL' AND exit_price > entry_price",
        _ => return Ok(0.0),
    };

    let sql = format!(
        r#"
        SELECT AVG(JULIANDAY(exit_date) - JULIANDAY(entry_date)) as avg_hold_time
        FROM stocks
        WHERE {} AND exit_date IS NOT NULL AND ({})
        "#,
        stocks_filter, time_condition
    );

    let mut query_params = Vec::new();
    for param in &time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Some(row) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        Ok(get_f64_value(&row, 0))
    } else {
        Ok(0.0)
    }
}

// Helper functions for calculating metrics by time period

/// Calculate core metrics for a specific time period
async fn calculate_period_core_metrics(
    conn: &Connection,
    period_range: &TimeRange,
    _overall_range: &TimeRange,
) -> Result<CoreMetrics> {
    // Use the period-specific time range
    let (time_condition, time_params) = period_range.to_sql_condition();
    
    // Calculate stocks metrics
    let stocks_sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
            SUM(CASE WHEN calculated_pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
            SUM(CASE WHEN calculated_pnl = 0 THEN 1 ELSE 0 END) as break_even_trades,
            SUM(calculated_pnl) as total_pnl,
            SUM(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE 0 END) as gross_profit,
            SUM(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE 0 END) as gross_loss,
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl END) as average_win,
            AVG(CASE WHEN calculated_pnl < 0 THEN calculated_pnl END) as average_loss,
            MAX(calculated_pnl) as biggest_winner,
            MIN(calculated_pnl) as biggest_loser,
            SUM(commissions) as total_commissions,
            AVG(commissions) as average_commission_per_trade,
            AVG(number_shares * entry_price) as average_position_size
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
    for param in &time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut stocks_metrics = CoreMetrics::default();
    if let Some(row) = conn.prepare(&stocks_sql).await?.query(libsql::params_from_iter(query_params.clone())).await?.next().await? {
        stocks_metrics = build_core_metrics_from_row(&row)?;
    }

    // Calculate options metrics
    let options_sql = format!(
        r#"
        SELECT 
            COUNT(*) as total_trades,
            SUM(CASE WHEN calculated_pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
            SUM(CASE WHEN calculated_pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
            SUM(CASE WHEN calculated_pnl = 0 THEN 1 ELSE 0 END) as break_even_trades,
            SUM(calculated_pnl) as total_pnl,
            SUM(CASE WHEN calculated_pnl > 0 THEN calculated_pnl ELSE 0 END) as gross_profit,
            SUM(CASE WHEN calculated_pnl < 0 THEN calculated_pnl ELSE 0 END) as gross_loss,
            AVG(CASE WHEN calculated_pnl > 0 THEN calculated_pnl END) as average_win,
            AVG(CASE WHEN calculated_pnl < 0 THEN calculated_pnl END) as average_loss,
            MAX(calculated_pnl) as biggest_winner,
            MIN(calculated_pnl) as biggest_loser,
            SUM(commissions) as total_commissions,
            AVG(commissions) as average_commission_per_trade,
            AVG(premium) as average_position_size
        FROM (
            SELECT 
                *,
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * total_quantity * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE status = 'closed' AND ({})
        )
        "#,
        time_condition
    );

    let mut options_metrics = CoreMetrics::default();
    if let Some(row) = conn.prepare(&options_sql).await?.query(libsql::params_from_iter(query_params)).await?.next().await? {
        options_metrics = build_core_metrics_from_row(&row)?;
    }

    // Combine metrics
    let total_trades = stocks_metrics.total_trades + options_metrics.total_trades;
    let total_winning_trades = stocks_metrics.winning_trades + options_metrics.winning_trades;
    let total_losing_trades = stocks_metrics.losing_trades + options_metrics.losing_trades;
    let total_break_even_trades = stocks_metrics.break_even_trades + options_metrics.break_even_trades;
    
    let total_pnl = stocks_metrics.total_pnl + options_metrics.total_pnl;
    let total_gross_profit = stocks_metrics.gross_profit + options_metrics.gross_profit;
    let total_gross_loss = stocks_metrics.gross_loss + options_metrics.gross_loss;
    let total_commissions = stocks_metrics.total_commissions + options_metrics.total_commissions;
    
    let average_win = if total_winning_trades > 0 {
        (stocks_metrics.average_win * stocks_metrics.winning_trades as f64 + 
         options_metrics.average_win * options_metrics.winning_trades as f64) / total_winning_trades as f64
    } else {
        0.0
    };
    
    let average_loss = if total_losing_trades > 0 {
        (stocks_metrics.average_loss * stocks_metrics.losing_trades as f64 + 
         options_metrics.average_loss * options_metrics.losing_trades as f64) / total_losing_trades as f64
    } else {
        0.0
    };
    
    let stocks_weight = if total_trades > 0 { stocks_metrics.total_trades as f64 / total_trades as f64 } else { 0.0 };
    let average_position_size = stocks_metrics.average_position_size * stocks_weight + 
                                 options_metrics.average_position_size * (1.0 - stocks_weight);
    let average_commission_per_trade = if total_trades > 0 { total_commissions / total_trades as f64 } else { 0.0 };
    
    let biggest_winner = stocks_metrics.biggest_winner.max(options_metrics.biggest_winner);
    let biggest_loser = stocks_metrics.biggest_loser.min(options_metrics.biggest_loser);
    
    let win_rate = if total_trades > 0 { (total_winning_trades as f64 / total_trades as f64) * 100.0 } else { 0.0 };
    let loss_rate = if total_trades > 0 { (total_losing_trades as f64 / total_trades as f64) * 100.0 } else { 0.0 };
    
    let profit_factor = if total_gross_loss != 0.0 {
        total_gross_profit.abs() / total_gross_loss.abs()
    } else if total_gross_profit > 0.0 {
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

    // Calculate consecutive streaks for this time period
    let (max_consecutive_wins, max_consecutive_losses) = 
        calculate_period_consecutive_streaks(conn, &time_condition, &time_params).await?;

    Ok(CoreMetrics {
        total_trades,
        winning_trades: total_winning_trades,
        losing_trades: total_losing_trades,
        break_even_trades: total_break_even_trades,
        win_rate,
        loss_rate,
        total_pnl,
        net_profit_loss: total_pnl,
        gross_profit: total_gross_profit,
        gross_loss: total_gross_loss,
        average_win,
        average_loss,
        average_position_size,
        biggest_winner,
        biggest_loser,
        profit_factor,
        win_loss_ratio,
        max_consecutive_wins,
        max_consecutive_losses,
        total_commissions,
        average_commission_per_trade,
    })
}

/// Calculate risk metrics for a specific time period
async fn calculate_period_risk_metrics(
    conn: &Connection,
    period_range: &TimeRange,
    _overall_range: &TimeRange,
) -> Result<RiskMetrics> {
    let (time_condition, time_params) = period_range.to_sql_condition();
    
    // Calculate daily returns for this period
    let daily_returns = calculate_period_daily_returns(conn, &time_condition, &time_params).await?;
    
    // Calculate drawdown metrics
    let drawdown_metrics = calculate_symbol_drawdown_metrics(&daily_returns).await?;
    
    // Calculate volatility metrics
    let volatility = if daily_returns.len() > 1 {
        let mean = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        let variance = daily_returns.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / (daily_returns.len() - 1) as f64;
        variance.sqrt()
    } else {
        0.0
    };
    
    let downside_deviation = if daily_returns.len() > 1 {
        let downside_returns: Vec<f64> = daily_returns.iter()
            .filter(|&&x| x < 0.0)
            .cloned()
            .collect();
        let mean = downside_returns.iter().sum::<f64>() / downside_returns.len() as f64;
        let variance = downside_returns.iter()
            .map(|x| (x - mean).powi(2))
            .sum::<f64>() / downside_returns.len() as f64;
        variance.sqrt()
    } else {
        0.0
    };

    let sharpe_ratio = if volatility > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return / volatility * (252.0_f64).sqrt()
    } else {
        0.0
    };

    let sortino_ratio = if downside_deviation > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return / downside_deviation * (252.0_f64).sqrt()
    } else {
        0.0
    };

    let recovery_factor = if drawdown_metrics.maximum_drawdown > 0.0 {
        let total_return = daily_returns.iter().sum::<f64>();
        total_return / drawdown_metrics.maximum_drawdown
    } else {
        0.0
    };

    let calmar_ratio = if drawdown_metrics.maximum_drawdown_percentage > 0.0 {
        let mean_return = daily_returns.iter().sum::<f64>() / daily_returns.len() as f64;
        mean_return * 252.0 / drawdown_metrics.maximum_drawdown_percentage
    } else {
        0.0
    };

    let mut sorted_returns = daily_returns.clone();
    sorted_returns.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    
    let var_95 = if !sorted_returns.is_empty() {
        let index = ((1.0 - 0.95) * sorted_returns.len() as f64) as usize;
        sorted_returns.get(index).copied().unwrap_or(0.0)
    } else {
        0.0
    };
    
    let var_99 = if !sorted_returns.is_empty() {
        let index = ((1.0 - 0.99) * sorted_returns.len() as f64) as usize;
        sorted_returns.get(index).copied().unwrap_or(0.0)
    } else {
        0.0
    };

    let expected_shortfall_95 = if !sorted_returns.is_empty() {
        sorted_returns.iter()
            .filter(|&&x| x <= var_95)
            .sum::<f64>() / sorted_returns.iter().filter(|&&x| x <= var_95).count() as f64
    } else {
        0.0
    };
    
    let expected_shortfall_99 = if !sorted_returns.is_empty() {
        sorted_returns.iter()
            .filter(|&&x| x <= var_99)
            .sum::<f64>() / sorted_returns.iter().filter(|&&x| x <= var_99).count() as f64
    } else {
        0.0
    };

    Ok(RiskMetrics {
        sharpe_ratio,
        sortino_ratio,
        calmar_ratio,
        maximum_drawdown: drawdown_metrics.maximum_drawdown,
        maximum_drawdown_percentage: drawdown_metrics.maximum_drawdown_percentage,
        maximum_drawdown_duration_days: drawdown_metrics.maximum_drawdown_duration_days,
        current_drawdown: drawdown_metrics.current_drawdown,
        var_95,
        var_99,
        expected_shortfall_95,
        expected_shortfall_99,
        average_risk_per_trade: 0.0,
        risk_reward_ratio: 0.0,
        volatility,
        downside_deviation,
        ulcer_index: drawdown_metrics.ulcer_index,
        recovery_factor,
        sterling_ratio: 0.0,
    })
}

/// Calculate performance metrics for a specific time period
async fn calculate_period_performance_metrics(
    conn: &Connection,
    period_range: &TimeRange,
    _overall_range: &TimeRange,
) -> Result<PerformanceMetrics> {
    // Get core metrics
    let core = calculate_period_core_metrics(conn, period_range, period_range).await?;
    
    let trade_expectancy = if core.total_trades > 0 {
        (core.average_win * core.win_rate / 100.0) - (core.average_loss.abs() * core.loss_rate / 100.0)
    } else {
        0.0
    };

    let edge = if core.average_position_size > 0.0 {
        trade_expectancy / core.average_position_size
    } else {
        0.0
    };

    let payoff_ratio = if core.average_loss != 0.0 {
        core.average_win / core.average_loss.abs()
    } else {
        0.0
    };

    let commission_impact_percentage = if core.total_pnl != 0.0 {
        (core.total_commissions / core.total_pnl.abs()) * 100.0
    } else {
        0.0
    };

    Ok(PerformanceMetrics {
        trade_expectancy,
        edge,
        average_hold_time_days: 0.0,
        average_hold_time_winners_days: 0.0,
        average_hold_time_losers_days: 0.0,
        average_position_size: core.average_position_size,
        position_size_standard_deviation: 0.0,
        position_size_variability: 0.0,
        kelly_criterion: 0.0,
        system_quality_number: 0.0,
        payoff_ratio,
        average_r_multiple: 0.0,
        r_multiple_standard_deviation: 0.0,
        positive_r_multiple_count: 0,
        negative_r_multiple_count: 0,
        consistency_ratio: 0.0,
        monthly_win_rate: 0.0,
        quarterly_win_rate: 0.0,
        average_slippage: 0.0,
        commission_impact_percentage,
    })
}

// Helper function for period-specific daily returns
async fn calculate_period_daily_returns(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<Vec<f64>> {
    let sql = format!(
        r#"
        SELECT 
            DATE(exit_date) as trade_date,
            SUM(calculated_pnl) as daily_pnl
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
            
            UNION ALL
            
            SELECT 
                *,
                CASE 
                    WHEN exit_price IS NOT NULL THEN 
                        (exit_price - entry_price) * total_quantity * 100 - commissions
                    ELSE 0
                END as calculated_pnl
            FROM options
            WHERE status = 'closed' AND exit_price IS NOT NULL AND ({})
        )
        GROUP BY DATE(exit_date)
        ORDER BY trade_date
        "#,
        time_condition, time_condition
    );

    let mut query_params = Vec::new();
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut rows = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await?;
    
    let mut daily_returns = Vec::new();
    while let Some(row) = rows.next().await? {
        daily_returns.push(get_f64_value(&row, 1));
    }

    Ok(daily_returns)
}

/// Calculate consecutive streaks from a sequence of P&L values
fn calculate_streaks(trades: &[f64]) -> (u32, u32) {
    let mut current_wins = 0;
    let mut current_losses = 0;
    let mut max_wins = 0;
    let mut max_losses = 0;

    for &pnl in trades {
        if pnl > 0.0 {
            // Win
            current_wins += 1;
            current_losses = 0;
            max_wins = max_wins.max(current_wins);
        } else if pnl < 0.0 {
            // Loss
            current_losses += 1;
            current_wins = 0;
            max_losses = max_losses.max(current_losses);
        } else {
            // Break-even - resets streak
            current_wins = 0;
            current_losses = 0;
        }
    }

    (max_wins, max_losses)
}

/// Calculate consecutive streaks for a specific symbol
async fn calculate_symbol_consecutive_streaks(
    conn: &Connection,
    symbol: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(u32, u32)> {
    let mut trades = Vec::new();

    // Get all stocks trades for this symbol ordered by exit_date
    let stocks_sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                ELSE 0
            END as calculated_pnl
        FROM stocks
        WHERE symbol = ? AND exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        ORDER BY exit_date ASC
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(symbol.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Ok(mut rows) = conn.prepare(&stocks_sql).await?.query(libsql::params_from_iter(query_params.clone())).await {
        while let Ok(Some(row)) = rows.next().await {
            trades.push(get_f64_value(&row, 0));
        }
    }

    // Get all options trades for this symbol ordered by exit_date
    let options_sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN exit_price IS NOT NULL THEN 
                    (exit_price - entry_price) * total_quantity * 100 - commissions
                ELSE 0
            END as calculated_pnl
        FROM options
        WHERE symbol = ? AND status = 'closed' AND ({})
        ORDER BY exit_date ASC
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(symbol.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Ok(mut rows) = conn.prepare(&options_sql).await?.query(libsql::params_from_iter(query_params)).await {
        while let Ok(Some(row)) = rows.next().await {
            trades.push(get_f64_value(&row, 0));
        }
    }

    let (max_wins, max_losses) = calculate_streaks(&trades);
    Ok((max_wins, max_losses))
}

/// Calculate consecutive streaks for a specific strategy
async fn calculate_strategy_consecutive_streaks(
    conn: &Connection,
    strategy: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(u32, u32)> {
    let sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN exit_price IS NOT NULL THEN 
                    (exit_price - entry_price) * total_quantity * 100 - commissions
                ELSE 0
            END as calculated_pnl
        FROM options
        WHERE strategy_type = ? AND status = 'closed' AND ({})
        ORDER BY exit_date ASC
        "#,
        time_condition
    );

    let mut query_params = vec![libsql::Value::Text(strategy.to_string())];
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    let mut trades = Vec::new();
    if let Ok(mut rows) = conn.prepare(&sql).await?.query(libsql::params_from_iter(query_params)).await {
        while let Ok(Some(row)) = rows.next().await {
            trades.push(get_f64_value(&row, 0));
        }
    }

    let (max_wins, max_losses) = calculate_streaks(&trades);
    Ok((max_wins, max_losses))
}

/// Calculate consecutive streaks for a specific trade direction
async fn calculate_direction_consecutive_streaks(
    conn: &Connection,
    direction: &str,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(u32, u32)> {
    let (stocks_filter, options_filter) = match direction {
        "bullish" => ("trade_type = 'BUY'", "option_type = 'CALL'"),
        "bearish" => ("trade_type = 'SELL'", "option_type = 'PUT'"),
        _ => return Ok((0, 0)),
    };

    let mut trades = Vec::new();

    // Get stocks trades
    let stocks_sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                ELSE 0
            END as calculated_pnl
        FROM stocks
        WHERE {} AND exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        ORDER BY exit_date ASC
        "#,
        stocks_filter, time_condition
    );

    let mut query_params = Vec::new();
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Ok(mut rows) = conn.prepare(&stocks_sql).await?.query(libsql::params_from_iter(query_params.clone())).await {
        while let Ok(Some(row)) = rows.next().await {
            trades.push(get_f64_value(&row, 0));
        }
    }

    // Get options trades
    let options_sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN exit_price IS NOT NULL THEN 
                    (exit_price - entry_price) * total_quantity * 100 - commissions
                ELSE 0
            END as calculated_pnl
        FROM options
        WHERE {} AND status = 'closed' AND ({})
        ORDER BY exit_date ASC
        "#,
        options_filter, time_condition
    );

    if let Ok(mut rows) = conn.prepare(&options_sql).await?.query(libsql::params_from_iter(query_params)).await {
        while let Ok(Some(row)) = rows.next().await {
            trades.push(get_f64_value(&row, 0));
        }
    }

    let (max_wins, max_losses) = calculate_streaks(&trades);
    Ok((max_wins, max_losses))
}

/// Calculate consecutive streaks for a specific time period
async fn calculate_period_consecutive_streaks(
    conn: &Connection,
    time_condition: &str,
    time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<(u32, u32)> {
    let mut trades = Vec::new();

    // Get all stocks trades
    let stocks_sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - commissions
                ELSE 0
            END as calculated_pnl
        FROM stocks
        WHERE exit_price IS NOT NULL AND exit_date IS NOT NULL AND ({})
        ORDER BY exit_date ASC
        "#,
        time_condition
    );

    let mut query_params = Vec::new();
    for param in time_params {
        query_params.push(libsql::Value::Text(param.to_rfc3339()));
    }

    if let Ok(mut rows) = conn.prepare(&stocks_sql).await?.query(libsql::params_from_iter(query_params.clone())).await {
        while let Ok(Some(row)) = rows.next().await {
            trades.push(get_f64_value(&row, 0));
        }
    }

    // Get all options trades
    let options_sql = format!(
        r#"
        SELECT 
            CASE 
                WHEN exit_price IS NOT NULL THEN 
                    (exit_price - entry_price) * total_quantity * 100 - commissions
                ELSE 0
            END as calculated_pnl
        FROM options
        WHERE status = 'closed' AND ({})
        ORDER BY exit_date ASC
        "#,
        time_condition
    );

    if let Ok(mut rows) = conn.prepare(&options_sql).await?.query(libsql::params_from_iter(query_params)).await {
        while let Ok(Some(row)) = rows.next().await {
            trades.push(get_f64_value(&row, 0));
        }
    }

    let (max_wins, max_losses) = calculate_streaks(&trades);
    Ok((max_wins, max_losses))
}
