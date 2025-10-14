/**
 * Stock Analytics Functions for Browser SQLite
 * Implements all stock calculation functions from backend/database/01_stock/05_calculations/
 */

import { useCallback, useMemo } from 'react';
import { useBrowserDatabase } from '@/lib/browser-database';

export interface StockAnalyticsOptions {
  timeRange?: '7d' | '30d' | '90d' | '1y' | 'ytd' | 'custom' | 'all_time';
  customStartDate?: string;
  customEndDate?: string;
}

export interface StockAnalyticsResult {
  profitFactor: number;
  avgHoldTimeWinners: number;
  avgHoldTimeLosers: number;
  biggestWinner: number;
  biggestLoser: number;
  averageGain: number;
  averageLoss: number;
  netPnL: number;
  riskRewardRatio: number;
  tradeExpectancy: number;
  winRate: number;
  averagePositionSize: number;
  averageRiskPerTrade: number;
  lossRate: number;
}

/**
 * Hook for stock analytics operations
 */
export function useStockAnalytics(userId: string) {
  const { query, isInitialized } = useBrowserDatabase({
    dbName: 'tradistry-journal',
    enablePersistence: true,
    autoInit: true
  });

  /**
   * Get date filter condition based on time range
   */
  const getDateFilter = useCallback((options: StockAnalyticsOptions = {}) => {
    const { timeRange = 'all_time', customStartDate, customEndDate } = options;
    
    switch (timeRange) {
      case '7d':
        return `AND exit_date >= date('now', '-7 days')`;
      case '30d':
        return `AND exit_date >= date('now', '-30 days')`;
      case '90d':
        return `AND exit_date >= date('now', '-90 days')`;
      case '1y':
        return `AND exit_date >= date('now', '-1 year')`;
      case 'ytd':
        return `AND exit_date >= date('now', 'start of year')`;
      case 'custom':
        let customFilter = '';
        if (customStartDate) {
          customFilter += ` AND exit_date >= '${customStartDate}'`;
        }
        if (customEndDate) {
          customFilter += ` AND exit_date <= '${customEndDate}'`;
        }
        return customFilter;
      default:
        return '';
    }
  }, []);

  /**
   * Calculate profit factor for stock trades
   * Profit Factor = Gross Profit / Gross Loss
   */
  const getProfitFactor = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH trade_profits AS (
        SELECT
          id,
          CASE
            WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
          END AS profit
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          ${dateFilter}
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
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate average hold time for winning trades (in days)
   */
  const getAvgHoldTimeWinners = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH winning_trades AS (
        SELECT 
          (julianday(exit_date) - julianday(entry_date)) AS hold_days
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price > entry_price) OR
            (trade_type = 'SELL' AND exit_price < entry_price)
          )
          ${dateFilter}
      )
      SELECT 
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(AVG(hold_days), 2)
        END AS avg_hold_days
      FROM winning_trades
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate average hold time for losing trades (in days)
   */
  const getAvgHoldTimeLosers = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH losing_trades AS (
        SELECT 
          (julianday(exit_date) - julianday(entry_date)) AS hold_days
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price < entry_price) OR
            (trade_type = 'SELL' AND exit_price > entry_price)
          )
          ${dateFilter}
      )
      SELECT 
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(AVG(hold_days), 2)
        END AS avg_hold_days
      FROM losing_trades
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Get the biggest winning trade profit
   */
  const getBiggestWinner = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH winning_trades AS (
        SELECT 
          CASE 
            WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
          END AS profit
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price > entry_price) OR
            (trade_type = 'SELL' AND exit_price < entry_price)
          )
          ${dateFilter}
      )
      SELECT 
        COALESCE(MAX(profit), 0) AS biggest_winner
      FROM winning_trades
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Get the biggest losing trade loss
   */
  const getBiggestLoser = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH losing_trades AS (
        SELECT 
          CASE 
            WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
          END AS loss
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price < entry_price) OR
            (trade_type = 'SELL' AND exit_price > entry_price)
          )
          ${dateFilter}
      )
      SELECT 
        COALESCE(MIN(loss), 0) AS biggest_loser
      FROM losing_trades
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate average gain for winning trades
   */
  const getAverageGain = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH trade_gains AS (
        SELECT
          CASE
            WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
          END AS gain
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price > entry_price) OR
            (trade_type = 'SELL' AND exit_price < entry_price)
          )
          ${dateFilter}
      )
      SELECT
        COALESCE(AVG(gain), 0) AS average_gain
      FROM trade_gains
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate average loss for losing trades
   */
  const getAverageLoss = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH trade_losses AS (
        SELECT
          ABS(CASE
            WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
          END) AS loss
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          AND (
            (trade_type = 'BUY' AND exit_price < entry_price) OR
            (trade_type = 'SELL' AND exit_price > entry_price)
          )
          ${dateFilter}
      )
      SELECT
        COALESCE(AVG(loss), 0) AS average_loss
      FROM trade_losses
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate net P&L for all trades
   */
  const getNetPnL = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH trade_pnl AS (
        SELECT
          CASE
            WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
          END AS pnl
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          ${dateFilter}
      )
      SELECT
        COALESCE(SUM(pnl), 0) AS net_pnl
      FROM trade_pnl
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate risk to reward ratio
   * Risk/Reward Ratio = Average Loss / Average Gain
   */
  const getRiskRewardRatio = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH trade_metrics AS (
        SELECT
          CASE
            WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
          END AS pnl
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          ${dateFilter}
      ),
      gain_loss_stats AS (
        SELECT
          COALESCE(AVG(CASE WHEN pnl > 0 THEN pnl END), 0) AS avg_gain,
          COALESCE(AVG(CASE WHEN pnl < 0 THEN ABS(pnl) END), 0) AS avg_loss,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) AS winning_trades,
          COUNT(CASE WHEN pnl < 0 THEN 1 END) AS losing_trades
        FROM trade_metrics
      )
      SELECT
        CASE
          WHEN avg_gain = 0 OR avg_gain IS NULL THEN 0
          WHEN avg_loss = 0 OR avg_loss IS NULL THEN 0
          ELSE ROUND(avg_loss / avg_gain, 2)
        END AS risk_reward_ratio
      FROM gain_loss_stats
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate trade expectancy
   * Trade Expectancy = (Win% * Avg Win) - (Loss% * Avg Loss)
   */
  const getTradeExpectancy = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH trade_metrics AS (
        SELECT
          CASE
            WHEN trade_type = 'BUY' THEN (COALESCE(exit_price, 0) - entry_price) * number_shares - COALESCE(commissions, 0)
            WHEN trade_type = 'SELL' THEN (entry_price - COALESCE(exit_price, 0)) * number_shares - COALESCE(commissions, 0)
          END AS pnl
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          ${dateFilter}
      ),
      expectancy_stats AS (
        SELECT
          CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE CAST(COUNT(CASE WHEN pnl > 0 THEN 1 END) AS REAL) / COUNT(*)
          END AS win_rate_decimal,
          COALESCE(AVG(CASE WHEN pnl > 0 THEN pnl END), 0) AS avg_gain,
          COALESCE(AVG(CASE WHEN pnl < 0 THEN ABS(pnl) END), 0) AS avg_loss,
          COUNT(*) AS total_trades,
          COUNT(CASE WHEN pnl > 0 THEN 1 END) AS winning_trades,
          COUNT(CASE WHEN pnl < 0 THEN 1 END) AS losing_trades
        FROM trade_metrics
      )
      SELECT
        CASE
          WHEN total_trades = 0 THEN 0
          ELSE ROUND(
            (win_rate_decimal * avg_gain) - ((1 - win_rate_decimal) * avg_loss),
            2
          )
        END AS trade_expectancy
      FROM expectancy_stats
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate win rate percentage
   */
  const getWinRate = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH trade_results AS (
        SELECT
          CASE
            WHEN (trade_type = 'BUY' AND exit_price > entry_price) OR
                 (trade_type = 'SELL' AND exit_price < entry_price) THEN 1
            ELSE 0
          END AS is_winning_trade
        FROM stocks
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          AND entry_price IS NOT NULL
          ${dateFilter}
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
          ELSE ROUND((winning_trades * 100.0 / total_trades), 2)
        END AS win_rate_percentage
      FROM win_rate_stats
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate average position size
   */
  const getAveragePositionSize = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      SELECT 
        COALESCE(ROUND(AVG(entry_price * number_shares), 2), 0) AS average_position_size
      FROM stocks
      WHERE user_id = ?
        AND exit_date IS NOT NULL
        ${dateFilter}
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate average risk per trade
   */
  const getAverageRiskPerTrade = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      SELECT 
        COALESCE(ROUND(AVG(
          CASE 
            WHEN trade_type = 'BUY' THEN (entry_price - stop_loss) * number_shares
            WHEN trade_type = 'SELL' THEN (stop_loss - entry_price) * number_shares
          END
        ), 2), 0) AS average_risk_per_trade
      FROM stocks
      WHERE user_id = ?
        AND exit_date IS NOT NULL
        AND stop_loss IS NOT NULL
        ${dateFilter}
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate loss rate percentage
   */
  const getLossRate = useCallback(async (options: StockAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      SELECT 
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(
            (COUNT(CASE 
              WHEN (exit_price - entry_price) * 
                CASE WHEN trade_type = 'BUY' THEN 1 ELSE -1 END - COALESCE(commissions, 0) < 0 
              THEN 1 
            END) * 100.0 / COUNT(*)), 2
          )
        END AS loss_rate
      FROM stocks
      WHERE user_id = ?
        AND exit_date IS NOT NULL
        AND exit_price IS NOT NULL
        ${dateFilter}
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Get all analytics metrics at once
   */
  const getAllAnalytics = useCallback(async (options: StockAnalyticsOptions = {}): Promise<StockAnalyticsResult> => {
    const [
      profitFactor,
      avgHoldTimeWinners,
      avgHoldTimeLosers,
      biggestWinner,
      biggestLoser,
      averageGain,
      averageLoss,
      netPnL,
      riskRewardRatio,
      tradeExpectancy,
      winRate,
      averagePositionSize,
      averageRiskPerTrade,
      lossRate
    ] = await Promise.all([
      getProfitFactor(options),
      getAvgHoldTimeWinners(options),
      getAvgHoldTimeLosers(options),
      getBiggestWinner(options),
      getBiggestLoser(options),
      getAverageGain(options),
      getAverageLoss(options),
      getNetPnL(options),
      getRiskRewardRatio(options),
      getTradeExpectancy(options),
      getWinRate(options),
      getAveragePositionSize(options),
      getAverageRiskPerTrade(options),
      getLossRate(options)
    ]);

    return {
      profitFactor,
      avgHoldTimeWinners,
      avgHoldTimeLosers,
      biggestWinner,
      biggestLoser,
      averageGain,
      averageLoss,
      netPnL,
      riskRewardRatio,
      tradeExpectancy,
      winRate,
      averagePositionSize,
      averageRiskPerTrade,
      lossRate
    };
  }, [
    getProfitFactor,
    getAvgHoldTimeWinners,
    getAvgHoldTimeLosers,
    getBiggestWinner,
    getBiggestLoser,
    getAverageGain,
    getAverageLoss,
    getNetPnL,
    getRiskRewardRatio,
    getTradeExpectancy,
    getWinRate,
    getAveragePositionSize,
    getAverageRiskPerTrade,
    getLossRate
  ]);

  return useMemo(() => ({
    isInitialized,
    // Individual metrics
    getProfitFactor,
    getAvgHoldTimeWinners,
    getAvgHoldTimeLosers,
    getBiggestWinner,
    getBiggestLoser,
    getAverageGain,
    getAverageLoss,
    getNetPnL,
    getRiskRewardRatio,
    getTradeExpectancy,
    getWinRate,
    getAveragePositionSize,
    getAverageRiskPerTrade,
    getLossRate,
    
    // Combined metrics
    getAllAnalytics,
    
    // Utility
    getDateFilter
  }), [
    getProfitFactor,
    getAvgHoldTimeWinners,
    getAvgHoldTimeLosers,
    getBiggestWinner,
    getBiggestLoser,
    getAverageGain,
    getAverageLoss,
    getNetPnL,
    getRiskRewardRatio,
    getTradeExpectancy,
    getWinRate,
    getAveragePositionSize,
    getAverageRiskPerTrade,
    getLossRate,
    getAllAnalytics,
    getDateFilter,
    isInitialized
  ]);
}

// Types are already exported above with the interface declarations
