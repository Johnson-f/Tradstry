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
    
    // This would typically group by quarters, years, etc.
    // For now, we'll create a simple implementation
    let quarterly_core = calculate_period_core_metrics(conn, "quarterly", time_range).await?;
    let quarterly_risk = calculate_period_risk_metrics(conn, "quarterly", time_range).await?;
    let quarterly_performance = calculate_period_performance_metrics(conn, "quarterly", time_range).await?;

    grouped_analytics.insert("Quarterly".to_string(), GroupedMetrics {
        group_name: "Quarterly".to_string(),
        group_type: GroupType::TimePeriod,
        core_metrics: quarterly_core,
        risk_metrics: quarterly_risk,
        performance_metrics: quarterly_performance,
    });

    Ok(grouped_analytics)
}

// Helper functions for calculating metrics by symbol
async fn calculate_symbol_core_metrics(
    _conn: &Connection,
    _symbol: &str,
    _time_condition: &str,
    _time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<CoreMetrics> {
    // Similar to the main core metrics calculation but filtered by symbol
    // Implementation would be similar to calculate_stocks_core_metrics but with symbol filter
    Ok(CoreMetrics::default())
}

async fn calculate_symbol_risk_metrics(
    _conn: &Connection,
    _symbol: &str,
    _time_condition: &str,
    _time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<RiskMetrics> {
    // Similar to the main risk metrics calculation but filtered by symbol
    Ok(RiskMetrics::default())
}

async fn calculate_symbol_performance_metrics(
    _conn: &Connection,
    _symbol: &str,
    _time_condition: &str,
    _time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<PerformanceMetrics> {
    // Similar to the main performance metrics calculation but filtered by symbol
    Ok(PerformanceMetrics::default())
}

// Helper functions for calculating metrics by strategy
async fn calculate_strategy_core_metrics(
    _conn: &Connection,
    _strategy: &str,
    _time_condition: &str,
    _time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<CoreMetrics> {
    // Similar to the main core metrics calculation but filtered by strategy
    Ok(CoreMetrics::default())
}

async fn calculate_strategy_risk_metrics(
    _conn: &Connection,
    _strategy: &str,
    _time_condition: &str,
    _time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<RiskMetrics> {
    // Similar to the main risk metrics calculation but filtered by strategy
    Ok(RiskMetrics::default())
}

async fn calculate_strategy_performance_metrics(
    _conn: &Connection,
    _strategy: &str,
    _time_condition: &str,
    _time_params: &[chrono::DateTime<chrono::Utc>],
) -> Result<PerformanceMetrics> {
    // Similar to the main performance metrics calculation but filtered by strategy
    Ok(PerformanceMetrics::default())
}

// Helper functions for calculating metrics by direction
async fn calculate_direction_core_metrics(
    _conn: &Connection,
    _direction: &str,
    _time_range: &TimeRange,
) -> Result<CoreMetrics> {
    // Calculate core metrics for bullish/bearish trades
    Ok(CoreMetrics::default())
}

async fn calculate_direction_risk_metrics(
    _conn: &Connection,
    _direction: &str,
    _time_range: &TimeRange,
) -> Result<RiskMetrics> {
    // Calculate risk metrics for bullish/bearish trades
    Ok(RiskMetrics::default())
}

async fn calculate_direction_performance_metrics(
    _conn: &Connection,
    _direction: &str,
    _time_range: &TimeRange,
) -> Result<PerformanceMetrics> {
    // Calculate performance metrics for bullish/bearish trades
    Ok(PerformanceMetrics::default())
}

// Helper functions for calculating metrics by time period
async fn calculate_period_core_metrics(
    _conn: &Connection,
    _period: &str,
    _time_range: &TimeRange,
) -> Result<CoreMetrics> {
    // Calculate core metrics for different time periods
    Ok(CoreMetrics::default())
}

async fn calculate_period_risk_metrics(
    _conn: &Connection,
    _period: &str,
    _time_range: &TimeRange,
) -> Result<RiskMetrics> {
    // Calculate risk metrics for different time periods
    Ok(RiskMetrics::default())
}

async fn calculate_period_performance_metrics(
    _conn: &Connection,
    _period: &str,
    _time_range: &TimeRange,
) -> Result<PerformanceMetrics> {
    // Calculate performance metrics for different time periods
    Ok(PerformanceMetrics::default())
}
