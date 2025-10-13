/**
 * Combined Analytics Functions for Browser SQLite
 * Combines data from both stocks and options tables for unified analytics
 */

import { useCallback } from 'react';
import { useBrowserDatabase } from '@/lib/browser-database';

export interface CombinedAnalyticsOptions {
  timeRange?: '7d' | '30d' | '90d' | '1y' | 'ytd' | 'custom' | 'all_time';
  customStartDate?: string;
  customEndDate?: string;
}

export interface CombinedAnalyticsResult {
  // Overall metrics
  totalTrades: number;
  totalStocks: number;
  totalOptions: number;
  totalPnL: number;
  
  // Performance metrics
  winRate: number;
  profitFactor: number;
  tradeExpectancy: number;
  riskRewardRatio: number;
  
  // Hold time metrics
  avgHoldTimeWinners: number;
  avgHoldTimeLosers: number;
  
  // Best/Worst trades
  biggestWinner: number;
  biggestLoser: number;
  
  // Average metrics
  averageGain: number;
  averageLoss: number;
  averagePositionSize: number;
  averageRiskPerTrade: number;
  
  // Rate metrics
  lossRate: number;
  
  // Breakdown by asset type
  stocksPnL: number;
  optionsPnL: number;
  stocksWinRate: number;
  optionsWinRate: number;
}

/**
 * Hook for combined analytics operations
 */
export function useCombinedAnalytics(userId: string) {
  const { query } = useBrowserDatabase({
    dbName: 'tradistry-journal',
    enablePersistence: true,
    autoInit: true
  });

  /**
   * Get date filter condition based on time range
   */
  const getDateFilter = useCallback((options: CombinedAnalyticsOptions = {}, useExitDate = true) => {
    const { timeRange = 'all_time', customStartDate, customEndDate } = options;
    const dateField = useExitDate ? 'exit_date' : 'entry_date';
    
    switch (timeRange) {
      case '7d':
        return `AND ${dateField} >= date('now', '-7 days')`;
      case '30d':
        return `AND ${dateField} >= date('now', '-30 days')`;
      case '90d':
        return `AND ${dateField} >= date('now', '-90 days')`;
      case '1y':
        return `AND ${dateField} >= date('now', '-1 year')`;
      case 'ytd':
        return `AND ${dateField} >= date('now', 'start of year')`;
      case 'custom':
        let customFilter = '';
        if (customStartDate) {
          customFilter += ` AND ${dateField} >= '${customStartDate}'`;
        }
        if (customEndDate) {
          customFilter += ` AND ${dateField} <= '${customEndDate}'`;
        }
        return customFilter;
      default:
        return '';
    }
  }, []);

  /**
   * Get total number of trades (stocks + options)
   */
  const getTotalTrades = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM stocks WHERE user_id = ? AND exit_date IS NOT NULL ${dateFilter}) +
        (SELECT COUNT(*) FROM options WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL ${dateFilter}) AS total_trades
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Get total number of stock trades
   */
  const getTotalStocks = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      SELECT COUNT(*) AS total_stocks
      FROM stocks
      WHERE user_id = ? AND exit_date IS NOT NULL ${dateFilter}
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Get total number of option trades
   */
  const getTotalOptions = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      SELECT COUNT(*) AS total_options
      FROM options
      WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL ${dateFilter}
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate total P&L from both stocks and options
   */
  const getTotalPnL = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_pnl AS (
        SELECT
          CASE
            WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
          END AS pnl
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      ),
      options_pnl AS (
        SELECT
          CASE
            WHEN strategy_type LIKE '%long%' OR trade_direction = 'Bullish' THEN
              (COALESCE(exit_price, 0) - entry_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
            WHEN strategy_type LIKE '%short%' OR trade_direction = 'Bearish' THEN
              (entry_price - COALESCE(exit_price, 0)) * number_of_contracts * 100 - COALESCE(commissions, 0)
            ELSE 0
          END AS pnl
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      )
      SELECT
        COALESCE(ROUND(SUM(pnl), 2), 0) AS total_pnl
      FROM (
        SELECT pnl FROM stocks_pnl
        UNION ALL
        SELECT pnl FROM options_pnl
      )
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate combined win rate
   */
  const getWinRate = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_wins AS (
        SELECT
          COUNT(*) AS total_trades,
          COUNT(CASE WHEN 
            (trade_type = 'BUY' AND exit_price > entry_price) OR
            (trade_type = 'SELL' AND exit_price < entry_price)
          THEN 1 END) AS winning_trades
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      ),
      options_wins AS (
        SELECT
          COUNT(*) AS total_trades,
          COUNT(CASE WHEN 
            (strategy_type LIKE '%long%' AND exit_price > entry_price) OR
            (strategy_type LIKE '%short%' AND exit_price < entry_price) OR
            (trade_direction = 'Bullish' AND exit_price > entry_price) OR
            (trade_direction = 'Bearish' AND exit_price < entry_price)
          THEN 1 END) AS winning_trades
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      ),
      combined_stats AS (
        SELECT
          SUM(total_trades) AS total_trades,
          SUM(winning_trades) AS winning_trades
        FROM (
          SELECT total_trades, winning_trades FROM stocks_wins
          UNION ALL
          SELECT total_trades, winning_trades FROM options_wins
        )
      )
      SELECT
        CASE
          WHEN total_trades > 0 THEN
            ROUND((winning_trades * 100.0 / total_trades), 2)
          ELSE 0
        END AS win_rate
      FROM combined_stats
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate combined profit factor
   */
  const getProfitFactor = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_profits AS (
        SELECT
          CASE
            WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
          END AS profit
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      ),
      options_profits AS (
        SELECT
          CASE
            WHEN strategy_type LIKE '%long%' OR trade_direction = 'Bullish' THEN
              (COALESCE(exit_price, 0) - entry_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
            WHEN strategy_type LIKE '%short%' OR trade_direction = 'Bearish' THEN
              (entry_price - COALESCE(exit_price, 0)) * number_of_contracts * 100 - COALESCE(commissions, 0)
            ELSE 0
          END AS profit
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      ),
      all_profits AS (
        SELECT profit FROM stocks_profits
        UNION ALL
        SELECT profit FROM options_profits
      ),
      profit_metrics AS (
        SELECT
          SUM(CASE WHEN profit > 0 THEN profit ELSE 0 END) AS gross_profit,
          ABS(SUM(CASE WHEN profit < 0 THEN profit ELSE 0 END)) AS gross_loss,
          COUNT(*) AS total_trades
        FROM all_profits
      )
      SELECT 
        CASE 
          WHEN total_trades = 0 THEN 0
          WHEN gross_loss = 0 AND gross_profit > 0 THEN 999.99
          WHEN gross_loss = 0 THEN 0
          ELSE ROUND(gross_profit / gross_loss, 2) 
        END AS profit_factor
      FROM profit_metrics
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate combined average hold time for winners
   */
  const getAvgHoldTimeWinners = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_winners AS (
        SELECT 
          (julianday(exit_date) - julianday(entry_date)) AS hold_days
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price > entry_price) OR
            (trade_type = 'SELL' AND exit_price < entry_price)
          )
          ${dateFilter}
      ),
      options_winners AS (
        SELECT 
          (julianday(exit_date) - julianday(entry_date)) AS hold_days
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (strategy_type LIKE '%long%' AND exit_price > entry_price) OR
            (strategy_type LIKE '%short%' AND exit_price < entry_price) OR
            (trade_direction = 'Bullish' AND exit_price > entry_price) OR
            (trade_direction = 'Bearish' AND exit_price < entry_price)
          )
          ${dateFilter}
      ),
      all_winners AS (
        SELECT hold_days FROM stocks_winners
        UNION ALL
        SELECT hold_days FROM options_winners
      )
      SELECT 
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(AVG(hold_days), 2)
        END AS avg_hold_days
      FROM all_winners
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate combined average hold time for losers
   */
  const getAvgHoldTimeLosers = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_losers AS (
        SELECT 
          (julianday(exit_date) - julianday(entry_date)) AS hold_days
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price < entry_price) OR
            (trade_type = 'SELL' AND exit_price > entry_price)
          )
          ${dateFilter}
      ),
      options_losers AS (
        SELECT 
          (julianday(exit_date) - julianday(entry_date)) AS hold_days
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (strategy_type LIKE '%long%' AND exit_price < entry_price) OR
            (strategy_type LIKE '%short%' AND exit_price > entry_price) OR
            (trade_direction = 'Bullish' AND exit_price < entry_price) OR
            (trade_direction = 'Bearish' AND exit_price > entry_price)
          )
          ${dateFilter}
      ),
      all_losers AS (
        SELECT hold_days FROM stocks_losers
        UNION ALL
        SELECT hold_days FROM options_losers
      )
      SELECT 
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(AVG(hold_days), 2)
        END AS avg_hold_days
      FROM all_losers
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Get biggest winner across both asset types
   */
  const getBiggestWinner = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_winners AS (
        SELECT 
          CASE
            WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
          END AS profit
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price > entry_price) OR
            (trade_type = 'SELL' AND exit_price < entry_price)
          )
          ${dateFilter}
      ),
      options_winners AS (
        SELECT 
          CASE
            WHEN strategy_type LIKE '%long%' OR trade_direction = 'Bullish' THEN
              (exit_price - entry_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
            WHEN strategy_type LIKE '%short%' OR trade_direction = 'Bearish' THEN
              (entry_price - exit_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
            ELSE 0
          END AS profit
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (strategy_type LIKE '%long%' AND exit_price > entry_price) OR
            (strategy_type LIKE '%short%' AND exit_price < entry_price) OR
            (trade_direction = 'Bullish' AND exit_price > entry_price) OR
            (trade_direction = 'Bearish' AND exit_price < entry_price)
          )
          ${dateFilter}
      ),
      all_winners AS (
        SELECT profit FROM stocks_winners
        UNION ALL
        SELECT profit FROM options_winners
      )
      SELECT 
        COALESCE(MAX(profit), 0) AS biggest_winner
      FROM all_winners
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Get biggest loser across both asset types
   */
  const getBiggestLoser = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_losers AS (
        SELECT 
          CASE
            WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
          END AS loss
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price < entry_price) OR
            (trade_type = 'SELL' AND exit_price > entry_price)
          )
          ${dateFilter}
      ),
      options_losers AS (
        SELECT 
          CASE
            WHEN strategy_type LIKE '%long%' OR trade_direction = 'Bullish' THEN
              (exit_price - entry_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
            WHEN strategy_type LIKE '%short%' OR trade_direction = 'Bearish' THEN
              (entry_price - exit_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
            ELSE 0
          END AS loss
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (strategy_type LIKE '%long%' AND exit_price < entry_price) OR
            (strategy_type LIKE '%short%' AND exit_price > entry_price) OR
            (trade_direction = 'Bullish' AND exit_price < entry_price) OR
            (trade_direction = 'Bearish' AND exit_price > entry_price)
          )
          ${dateFilter}
      ),
      all_losers AS (
        SELECT loss FROM stocks_losers
        UNION ALL
        SELECT loss FROM options_losers
      )
      SELECT 
        COALESCE(MIN(loss), 0) AS biggest_loser
      FROM all_losers
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate combined average gain
   */
  const getAverageGain = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_gains AS (
        SELECT
          CASE
            WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
          END AS gain
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price > entry_price) OR
            (trade_type = 'SELL' AND exit_price < entry_price)
          )
          ${dateFilter}
      ),
      options_gains AS (
        SELECT
          CASE
            WHEN strategy_type LIKE '%long%' OR trade_direction = 'Bullish' THEN
              (COALESCE(exit_price, 0) - entry_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
            WHEN strategy_type LIKE '%short%' OR trade_direction = 'Bearish' THEN
              (entry_price - COALESCE(exit_price, 0)) * number_of_contracts * 100 - COALESCE(commissions, 0)
            ELSE 0
          END AS gain
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (strategy_type LIKE '%long%' AND exit_price > entry_price) OR
            (strategy_type LIKE '%short%' AND exit_price < entry_price) OR
            (trade_direction = 'Bullish' AND exit_price > entry_price) OR
            (trade_direction = 'Bearish' AND exit_price < entry_price)
          )
          ${dateFilter}
      ),
      all_gains AS (
        SELECT gain FROM stocks_gains
        UNION ALL
        SELECT gain FROM options_gains
      )
      SELECT
        COALESCE(AVG(gain), 0) AS average_gain
      FROM all_gains
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate combined average loss
   */
  const getAverageLoss = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_losses AS (
        SELECT
          ABS(CASE
            WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
          END) AS loss
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price < entry_price) OR
            (trade_type = 'SELL' AND exit_price > entry_price)
          )
          ${dateFilter}
      ),
      options_losses AS (
        SELECT
          ABS(CASE
            WHEN strategy_type LIKE '%long%' OR trade_direction = 'Bullish' THEN
              (COALESCE(exit_price, 0) - entry_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
            WHEN strategy_type LIKE '%short%' OR trade_direction = 'Bearish' THEN
              (entry_price - COALESCE(exit_price, 0)) * number_of_contracts * 100 - COALESCE(commissions, 0)
            ELSE 0
          END) AS loss
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (strategy_type LIKE '%long%' AND exit_price < entry_price) OR
            (strategy_type LIKE '%short%' AND exit_price > entry_price) OR
            (trade_direction = 'Bullish' AND exit_price < entry_price) OR
            (trade_direction = 'Bearish' AND exit_price > entry_price)
          )
          ${dateFilter}
      ),
      all_losses AS (
        SELECT loss FROM stocks_losses
        UNION ALL
        SELECT loss FROM options_losses
      )
      SELECT
        COALESCE(AVG(loss), 0) AS average_loss
      FROM all_losses
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate combined average position size
   */
  const getAveragePositionSize = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_positions AS (
        SELECT entry_price * number_shares AS position_size
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL ${dateFilter}
      ),
      options_positions AS (
        SELECT total_premium * number_of_contracts * 100 AS position_size
        FROM options
        WHERE user_id = ? AND status = 'closed' ${dateFilter}
      ),
      all_positions AS (
        SELECT position_size FROM stocks_positions
        UNION ALL
        SELECT position_size FROM options_positions
      )
      SELECT 
        COALESCE(ROUND(AVG(position_size), 2), 0) AS average_position_size
      FROM all_positions
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate combined average risk per trade
   */
  const getAverageRiskPerTrade = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options, false); // Use entry_date for risk calculation
    
    const sql = `
      WITH stocks_risk AS (
        SELECT 
          CASE 
            WHEN trade_type = 'BUY' THEN (entry_price - stop_loss) * number_shares
            WHEN trade_type = 'SELL' THEN (stop_loss - entry_price) * number_shares
          END AS risk
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND stop_loss IS NOT NULL ${dateFilter}
      ),
      options_risk AS (
        SELECT 
          CASE 
            WHEN option_type = 'Call' AND trade_direction = 'Bullish' THEN (total_premium * number_of_contracts * 100)
            WHEN option_type = 'Put' AND trade_direction = 'Bullish' THEN (total_premium * number_of_contracts * 100)
            WHEN option_type = 'Call' AND trade_direction = 'Bearish' THEN 
              CASE 
                WHEN strike_price IS NOT NULL THEN ((strike_price - entry_price + total_premium) * number_of_contracts * 100)
                ELSE (total_premium * number_of_contracts * 100)
              END
            WHEN option_type = 'Put' AND trade_direction = 'Bearish' THEN 
              CASE 
                WHEN strike_price IS NOT NULL THEN ((entry_price - strike_price + total_premium) * number_of_contracts * 100)
                ELSE (total_premium * number_of_contracts * 100)
              END
            ELSE 0
          END AS risk
        FROM options
        WHERE user_id = ? AND status = 'closed' ${dateFilter}
      ),
      all_risk AS (
        SELECT risk FROM stocks_risk
        UNION ALL
        SELECT risk FROM options_risk
      )
      SELECT 
        COALESCE(ROUND(AVG(risk), 2), 0) AS average_risk_per_trade
      FROM all_risk
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate combined loss rate
   */
  const getLossRate = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_stats AS (
        SELECT 
          COUNT(*) AS total_trades,
          SUM(CASE WHEN 
            (CASE 
              WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
              WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
            END) < 0 
          THEN 1 ELSE 0 END) AS losing_trades
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      ),
      options_stats AS (
        SELECT 
          COUNT(*) AS total_trades,
          SUM(CASE WHEN 
            (CASE 
              WHEN strategy_type LIKE '%long%' OR trade_direction = 'Bullish' THEN
                (exit_price - entry_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
              WHEN strategy_type LIKE '%short%' OR trade_direction = 'Bearish' THEN
                (entry_price - exit_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
              ELSE 0
            END) < 0 
          THEN 1 ELSE 0 END) AS losing_trades
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      ),
      combined_stats AS (
        SELECT
          SUM(total_trades) AS total_trades,
          SUM(losing_trades) AS losing_trades
        FROM (
          SELECT total_trades, losing_trades FROM stocks_stats
          UNION ALL
          SELECT total_trades, losing_trades FROM options_stats
        )
      )
      SELECT 
        CASE 
          WHEN total_trades = 0 THEN 0 
          ELSE ROUND((losing_trades * 100.0 / total_trades), 2)
        END AS loss_rate_percentage
      FROM combined_stats
    `;

    const result = await query(sql, [userId, userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Get P&L breakdown by asset type
   */
  const getPnLBreakdown = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<{ stocksPnL: number; optionsPnL: number }> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_pnl AS (
        SELECT
          COALESCE(ROUND(SUM(
            CASE
              WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
              WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
            END
          ), 2), 0) AS stocks_pnl
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      ),
      options_pnl AS (
        SELECT
          COALESCE(ROUND(SUM(
            CASE
              WHEN strategy_type LIKE '%long%' OR trade_direction = 'Bullish' THEN
                (COALESCE(exit_price, 0) - entry_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
              WHEN strategy_type LIKE '%short%' OR trade_direction = 'Bearish' THEN
                (entry_price - COALESCE(exit_price, 0)) * number_of_contracts * 100 - COALESCE(commissions, 0)
              ELSE 0
            END
          ), 2), 0) AS options_pnl
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      )
      SELECT stocks_pnl, options_pnl
      FROM stocks_pnl, options_pnl
    `;

    const result = await query(sql, [userId, userId]);
    const row = result.values[0];
    return {
      stocksPnL: row?.[0] as number || 0,
      optionsPnL: row?.[1] as number || 0
    };
  }, [userId, query, getDateFilter]);

  /**
   * Get win rate breakdown by asset type
   */
  const getWinRateBreakdown = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<{ stocksWinRate: number; optionsWinRate: number }> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH stocks_stats AS (
        SELECT
          COUNT(*) AS total_trades,
          COUNT(CASE WHEN 
            (trade_type = 'BUY' AND exit_price > entry_price) OR
            (trade_type = 'SELL' AND exit_price < entry_price)
          THEN 1 END) AS winning_trades
        FROM stocks
        WHERE user_id = ? AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      ),
      options_stats AS (
        SELECT
          COUNT(*) AS total_trades,
          COUNT(CASE WHEN 
            (strategy_type LIKE '%long%' AND exit_price > entry_price) OR
            (strategy_type LIKE '%short%' AND exit_price < entry_price) OR
            (trade_direction = 'Bullish' AND exit_price > entry_price) OR
            (trade_direction = 'Bearish' AND exit_price < entry_price)
          THEN 1 END) AS winning_trades
        FROM options
        WHERE user_id = ? AND status = 'closed' AND exit_date IS NOT NULL AND exit_price IS NOT NULL ${dateFilter}
      )
      SELECT 
        CASE
          WHEN s.total_trades > 0 THEN ROUND((s.winning_trades * 100.0 / s.total_trades), 2)
          ELSE 0
        END AS stocks_win_rate,
        CASE
          WHEN o.total_trades > 0 THEN ROUND((o.winning_trades * 100.0 / o.total_trades), 2)
          ELSE 0
        END AS options_win_rate
      FROM stocks_stats s, options_stats o
    `;

    const result = await query(sql, [userId, userId]);
    const row = result.values[0];
    return {
      stocksWinRate: row?.[0] as number || 0,
      optionsWinRate: row?.[1] as number || 0
    };
  }, [userId, query, getDateFilter]);

  /**
   * Calculate risk to reward ratio
   */
  const getRiskRewardRatio = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const [averageGain, averageLoss] = await Promise.all([
      getAverageGain(options),
      getAverageLoss(options)
    ]);

    if (averageGain === 0) return 0;
    return Math.round((averageLoss / averageGain) * 100) / 100;
  }, [getAverageGain, getAverageLoss]);

  /**
   * Calculate trade expectancy
   */
  const getTradeExpectancy = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<number> => {
    const [winRate, averageGain, averageLoss] = await Promise.all([
      getWinRate(options),
      getAverageGain(options),
      getAverageLoss(options)
    ]);

    const winRateDecimal = winRate / 100;
    const lossRateDecimal = 1 - winRateDecimal;

    return Math.round(((winRateDecimal * averageGain) - (lossRateDecimal * averageLoss)) * 100) / 100;
  }, [getWinRate, getAverageGain, getAverageLoss]);

  /**
   * Get all analytics metrics at once
   */
  const getAllAnalytics = useCallback(async (options: CombinedAnalyticsOptions = {}): Promise<CombinedAnalyticsResult> => {
    const [
      totalTrades,
      totalStocks,
      totalOptions,
      totalPnL,
      winRate,
      profitFactor,
      avgHoldTimeWinners,
      avgHoldTimeLosers,
      biggestWinner,
      biggestLoser,
      averageGain,
      averageLoss,
      averagePositionSize,
      averageRiskPerTrade,
      lossRate,
      pnlBreakdown,
      winRateBreakdown
    ] = await Promise.all([
      getTotalTrades(options),
      getTotalStocks(options),
      getTotalOptions(options),
      getTotalPnL(options),
      getWinRate(options),
      getProfitFactor(options),
      getAvgHoldTimeWinners(options),
      getAvgHoldTimeLosers(options),
      getBiggestWinner(options),
      getBiggestLoser(options),
      getAverageGain(options),
      getAverageLoss(options),
      getAveragePositionSize(options),
      getAverageRiskPerTrade(options),
      getLossRate(options),
      getPnLBreakdown(options),
      getWinRateBreakdown(options)
    ]);

    const riskRewardRatio = await getRiskRewardRatio(options);
    const tradeExpectancy = await getTradeExpectancy(options);

    return {
      totalTrades,
      totalStocks,
      totalOptions,
      totalPnL,
      winRate,
      profitFactor,
      tradeExpectancy,
      riskRewardRatio,
      avgHoldTimeWinners,
      avgHoldTimeLosers,
      biggestWinner,
      biggestLoser,
      averageGain,
      averageLoss,
      averagePositionSize,
      averageRiskPerTrade,
      lossRate,
      stocksPnL: pnlBreakdown.stocksPnL,
      optionsPnL: pnlBreakdown.optionsPnL,
      stocksWinRate: winRateBreakdown.stocksWinRate,
      optionsWinRate: winRateBreakdown.optionsWinRate
    };
  }, [
    getTotalTrades,
    getTotalStocks,
    getTotalOptions,
    getTotalPnL,
    getWinRate,
    getProfitFactor,
    getAvgHoldTimeWinners,
    getAvgHoldTimeLosers,
    getBiggestWinner,
    getBiggestLoser,
    getAverageGain,
    getAverageLoss,
    getAveragePositionSize,
    getAverageRiskPerTrade,
    getLossRate,
    getPnLBreakdown,
    getWinRateBreakdown,
    getRiskRewardRatio,
    getTradeExpectancy
  ]);

  return {
    // Individual metrics
    getTotalTrades,
    getTotalStocks,
    getTotalOptions,
    getTotalPnL,
    getWinRate,
    getProfitFactor,
    getAvgHoldTimeWinners,
    getAvgHoldTimeLosers,
    getBiggestWinner,
    getBiggestLoser,
    getAverageGain,
    getAverageLoss,
    getAveragePositionSize,
    getAverageRiskPerTrade,
    getLossRate,
    getPnLBreakdown,
    getWinRateBreakdown,
    getRiskRewardRatio,
    getTradeExpectancy,
    
    // Combined metrics
    getAllAnalytics,
    
    // Utility
    getDateFilter
  };
}

// Types are already exported above with the interface declarations

