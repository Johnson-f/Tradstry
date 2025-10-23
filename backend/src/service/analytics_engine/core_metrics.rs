use anyhow::Result;
use libsql::Connection;
use crate::models::analytics::CoreMetrics;
use crate::models::stock::stocks::TimeRange;

/// Calculate core trading metrics from stocks and options tables
pub async fn calculate_core_metrics(
    conn: &Connection,
    time_range: &TimeRange,
) -> Result<CoreMetrics> {
    let (time_condition, time_params) = time_range.to_sql_condition();
    
    // Calculate stocks metrics
    let stocks_metrics = calculate_stocks_core_metrics(conn, &time_condition, &time_params).await?;
    
    // Calculate options metrics
    let options_metrics = calculate_options_core_metrics(conn, &time_condition, &time_params).await?;
    
    // Combine metrics from both tables
    let combined_metrics = combine_core_metrics(stocks_metrics, options_metrics);
    
    Ok(combined_metrics)
}

/// Calculate core metrics for stocks table
async fn calculate_stocks_core_metrics(
    conn: &Connection,
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

    if let Some(row) = rows.next().await? {
        let total_trades = row.get::<i64>(0).unwrap_or(0) as u32;
        let winning_trades = row.get::<i64>(1).unwrap_or(0) as u32;
        let losing_trades = row.get::<i64>(2).unwrap_or(0) as u32;
        let break_even_trades = row.get::<i64>(3).unwrap_or(0) as u32;
        let total_pnl = row.get::<f64>(4).unwrap_or(0.0);
        let gross_profit = row.get::<f64>(5).unwrap_or(0.0);
        let gross_loss = row.get::<f64>(6).unwrap_or(0.0);
        let average_win = row.get::<f64>(7).unwrap_or(0.0);
        let average_loss = row.get::<f64>(8).unwrap_or(0.0);
        let biggest_winner = row.get::<f64>(9).unwrap_or(0.0);
        let biggest_loser = row.get::<f64>(10).unwrap_or(0.0);
        let total_commissions = row.get::<f64>(11).unwrap_or(0.0);
        let average_commission_per_trade = row.get::<f64>(12).unwrap_or(0.0);
        let average_position_size = row.get::<f64>(13).unwrap_or(0.0);

        // Calculate derived metrics
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
            max_consecutive_wins: 0, // Will be calculated separately
            max_consecutive_losses: 0, // Will be calculated separately
            total_commissions,
            average_commission_per_trade,
        })
    } else {
        Ok(CoreMetrics::default())
    }
}

/// Calculate core metrics for options table
async fn calculate_options_core_metrics(
    conn: &Connection,
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
            AVG(total_premium) as average_position_size
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

    if let Some(row) = rows.next().await? {
        let total_trades = row.get::<i64>(0).unwrap_or(0) as u32;
        let winning_trades = row.get::<i64>(1).unwrap_or(0) as u32;
        let losing_trades = row.get::<i64>(2).unwrap_or(0) as u32;
        let break_even_trades = row.get::<i64>(3).unwrap_or(0) as u32;
        let total_pnl = row.get::<f64>(4).unwrap_or(0.0);
        let gross_profit = row.get::<f64>(5).unwrap_or(0.0);
        let gross_loss = row.get::<f64>(6).unwrap_or(0.0);
        let average_win = row.get::<f64>(7).unwrap_or(0.0);
        let average_loss = row.get::<f64>(8).unwrap_or(0.0);
        let biggest_winner = row.get::<f64>(9).unwrap_or(0.0);
        let biggest_loser = row.get::<f64>(10).unwrap_or(0.0);
        let total_commissions = row.get::<f64>(11).unwrap_or(0.0);
        let average_commission_per_trade = row.get::<f64>(12).unwrap_or(0.0);
        let average_position_size = row.get::<f64>(13).unwrap_or(0.0);

        // Calculate derived metrics
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
            max_consecutive_wins: 0, // Will be calculated separately
            max_consecutive_losses: 0, // Will be calculated separately
            total_commissions,
            average_commission_per_trade,
        })
    } else {
        Ok(CoreMetrics::default())
    }
}

/// Combine metrics from stocks and options tables
fn combine_core_metrics(stocks: CoreMetrics, options: CoreMetrics) -> CoreMetrics {
    let total_trades = stocks.total_trades + options.total_trades;
    let total_winning_trades = stocks.winning_trades + options.winning_trades;
    let total_losing_trades = stocks.losing_trades + options.losing_trades;
    let total_break_even_trades = stocks.break_even_trades + options.break_even_trades;
    
    let total_pnl = stocks.total_pnl + options.total_pnl;
    let total_gross_profit = stocks.gross_profit + options.gross_profit;
    let total_gross_loss = stocks.gross_loss + options.gross_loss;
    let total_commissions = stocks.total_commissions + options.total_commissions;
    
    // Calculate combined averages (weighted by trade count)
    let stocks_weight = if total_trades > 0 { stocks.total_trades as f64 / total_trades as f64 } else { 0.0 };
    let options_weight = if total_trades > 0 { options.total_trades as f64 / total_trades as f64 } else { 0.0 };
    
    let average_win = if total_winning_trades > 0 {
        (stocks.average_win * stocks.winning_trades as f64 + options.average_win * options.winning_trades as f64) / total_winning_trades as f64
    } else {
        0.0
    };
    
    let average_loss = if total_losing_trades > 0 {
        (stocks.average_loss * stocks.losing_trades as f64 + options.average_loss * options.losing_trades as f64) / total_losing_trades as f64
    } else {
        0.0
    };
    
    let average_position_size = stocks.average_position_size * stocks_weight + options.average_position_size * options_weight;
    let average_commission_per_trade = if total_trades > 0 { total_commissions / total_trades as f64 } else { 0.0 };
    
    let biggest_winner = stocks.biggest_winner.max(options.biggest_winner);
    let biggest_loser = stocks.biggest_loser.min(options.biggest_loser);
    
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

    CoreMetrics {
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
        max_consecutive_wins: 0, // Will be calculated separately
        max_consecutive_losses: 0, // Will be calculated separately
        total_commissions,
        average_commission_per_trade,
    }
}

impl Default for CoreMetrics {
    fn default() -> Self {
        Self {
            total_trades: 0,
            winning_trades: 0,
            losing_trades: 0,
            break_even_trades: 0,
            win_rate: 0.0,
            loss_rate: 0.0,
            total_pnl: 0.0,
            net_profit_loss: 0.0,
            gross_profit: 0.0,
            gross_loss: 0.0,
            average_win: 0.0,
            average_loss: 0.0,
            average_position_size: 0.0,
            biggest_winner: 0.0,
            biggest_loser: 0.0,
            profit_factor: 0.0,
            win_loss_ratio: 0.0,
            max_consecutive_wins: 0,
            max_consecutive_losses: 0,
            total_commissions: 0.0,
            average_commission_per_trade: 0.0,
        }
    }
}
