/**
 * Options Analytics Functions for Browser SQLite
 * Implements all options calculation functions from backend/database/02_options/05_calculations/
 */

import { useCallback } from 'react';
import { useBrowserDatabase } from '@/lib/browser-database';

export interface OptionsAnalyticsOptions {
  timeRange?: '7d' | '30d' | '90d' | '1y' | 'ytd' | 'custom' | 'all_time';
  customStartDate?: string;
  customEndDate?: string;
}

export interface OptionsAnalyticsResult {
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
 * Hook for options analytics operations
 */
export function useOptionsAnalytics(userId: string) {
  const { query } = useBrowserDatabase({
    dbName: 'tradistry-journal',
    enablePersistence: true,
    autoInit: true
  });

  /**
   * Get date filter condition based on time range
   */
  const getDateFilter = useCallback((options: OptionsAnalyticsOptions = {}, useExitDate = true) => {
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
   * Calculate profit factor for options trades
   * Profit Factor = Gross Profit / Gross Loss
   */
  const getProfitFactor = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH trade_profits AS (
        SELECT 
          CASE 
            WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN 
              (COALESCE(exit_price, 0) - entry_price) * 100 * number_of_contracts - commissions
            WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN 
              -((COALESCE(exit_price, 0) - entry_price) * 100 * number_of_contracts) - commissions
            WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN 
              (entry_price - COALESCE(exit_price, 0)) * 100 * number_of_contracts - commissions
            WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN 
              -((entry_price - COALESCE(exit_price, 0)) * 100 * number_of_contracts) - commissions
            ELSE 0
          END AS profit
        FROM options
        WHERE user_id = ?
          AND status = 'closed'
          AND exit_date IS NOT NULL
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
  const getAvgHoldTimeWinners = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH winning_trades AS (
        SELECT 
          (julianday(exit_date) - julianday(entry_date)) AS hold_days
        FROM options
        WHERE user_id = ?
          AND status = 'closed'
          AND exit_date IS NOT NULL
          AND (
            (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
            (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
            (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
            (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price)
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
  const getAvgHoldTimeLosers = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH losing_trades AS (
        SELECT 
          (julianday(exit_date) - julianday(entry_date)) AS hold_days
        FROM options
        WHERE user_id = ?
          AND status = 'closed'
          AND exit_date IS NOT NULL
          AND (
            (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price < entry_price) OR
            (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price > entry_price) OR
            (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price < entry_price) OR
            (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price > entry_price)
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
  const getBiggestWinner = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH winning_trades AS (
        SELECT 
          CASE 
            WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN 
              (exit_price - entry_price) * 100 * number_of_contracts - commissions
            WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN 
              -((exit_price - entry_price) * 100 * number_of_contracts) - commissions
            WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN 
              (entry_price - exit_price) * 100 * number_of_contracts - commissions
            WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN 
              -((entry_price - exit_price) * 100 * number_of_contracts) - commissions
            ELSE 0
          END AS profit
        FROM options
        WHERE user_id = ?
          AND status = 'closed'
          AND exit_date IS NOT NULL
          AND (
            (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
            (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
            (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
            (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price)
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
  const getBiggestLoser = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH losing_trades AS (
        SELECT 
          CASE 
            WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN 
              (exit_price - entry_price) * 100 * number_of_contracts - commissions
            WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN 
              -((exit_price - entry_price) * 100 * number_of_contracts) - commissions
            WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN 
              (entry_price - exit_price) * 100 * number_of_contracts - commissions
            WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN 
              -((entry_price - exit_price) * 100 * number_of_contracts) - commissions
            ELSE 0
          END AS loss
        FROM options
        WHERE user_id = ?
          AND status = 'closed'
          AND exit_date IS NOT NULL
          AND (
            (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price < entry_price) OR
            (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price > entry_price) OR
            (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price < entry_price) OR
            (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price > entry_price)
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
  const getAverageGain = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH option_gains AS (
        SELECT
          CASE
            WHEN strategy_type LIKE '%long%' THEN
              (COALESCE(exit_price, 0) - entry_price) * number_of_contracts - COALESCE(commissions, 0)
            WHEN strategy_type LIKE '%short%' THEN
              (entry_price - COALESCE(exit_price, 0)) * number_of_contracts - COALESCE(commissions, 0)
            WHEN trade_direction = 'Bullish' THEN
              (COALESCE(exit_price, 0) - entry_price) * number_of_contracts - COALESCE(commissions, 0)
            WHEN trade_direction = 'Bearish' THEN
              (entry_price - COALESCE(exit_price, 0)) * number_of_contracts - COALESCE(commissions, 0)
            ELSE 0
          END AS gain
        FROM options
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          AND status = 'closed'
          AND (
            (strategy_type LIKE '%long%' AND exit_price > entry_price) OR
            (strategy_type LIKE '%short%' AND exit_price < entry_price) OR
            (trade_direction = 'Bullish' AND exit_price > entry_price) OR
            (trade_direction = 'Bearish' AND exit_price < entry_price)
          )
          ${dateFilter}
      )
      SELECT
        COALESCE(AVG(gain), 0) AS average_gain
      FROM option_gains
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate average loss for losing trades
   */
  const getAverageLoss = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH option_losses AS (
        SELECT
          ABS(CASE
            WHEN strategy_type LIKE '%long%' THEN
              (COALESCE(exit_price, 0) - entry_price) * number_of_contracts - COALESCE(commissions, 0)
            WHEN strategy_type LIKE '%short%' THEN
              (entry_price - COALESCE(exit_price, 0)) * number_of_contracts - COALESCE(commissions, 0)
            WHEN trade_direction = 'Bullish' THEN
              (COALESCE(exit_price, 0) - entry_price) * number_of_contracts - COALESCE(commissions, 0)
            WHEN trade_direction = 'Bearish' THEN
              (entry_price - COALESCE(exit_price, 0)) * number_of_contracts - COALESCE(commissions, 0)
            ELSE 0
          END) AS loss
        FROM options
        WHERE user_id = ?
          AND exit_date IS NOT NULL
          AND exit_price IS NOT NULL
          AND status = 'closed'
          AND (
            (strategy_type LIKE '%long%' AND exit_price < entry_price) OR
            (strategy_type LIKE '%short%' AND exit_price > entry_price) OR
            (trade_direction = 'Bullish' AND exit_price < entry_price) OR
            (trade_direction = 'Bearish' AND exit_price > entry_price)
          )
          ${dateFilter}
      )
      SELECT
        COALESCE(AVG(loss), 0) AS average_loss
      FROM option_losses
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate net P&L for all trades
   */
  const getNetPnL = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      SELECT
        COALESCE(ROUND(SUM(
          CASE
            WHEN strategy_type LIKE '%long%' OR trade_direction = 'Bullish' THEN
              (COALESCE(exit_price, 0) - entry_price) * number_of_contracts * 100 - COALESCE(commissions, 0)
            WHEN strategy_type LIKE '%short%' OR trade_direction = 'Bearish' THEN
              (entry_price - COALESCE(exit_price, 0)) * number_of_contracts * 100 - COALESCE(commissions, 0)
            ELSE 0
          END
        ), 2), 0) AS net_pnl
      FROM options
      WHERE user_id = ?
        AND status = 'closed'
        AND exit_date IS NOT NULL
        ${dateFilter}
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate win rate percentage
   */
  const getWinRate = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH trade_counts AS (
        SELECT
          COUNT(*) AS total_closed_trades,
          COUNT(
            CASE
              WHEN (
                (strategy_type LIKE '%long%' AND exit_price > entry_price) OR
                (strategy_type LIKE '%short%' AND exit_price < entry_price) OR
                (trade_direction = 'Bullish' AND exit_price > entry_price) OR
                (trade_direction = 'Bearish' AND exit_price < entry_price)
              ) THEN 1
            END
          ) AS winning_trades
        FROM options
        WHERE user_id = ?
          AND status = 'closed'
          AND exit_date IS NOT NULL
          ${dateFilter}
      )
      SELECT
        CASE
          WHEN total_closed_trades > 0 THEN
            ROUND((winning_trades * 100.0 / total_closed_trades), 2)
          ELSE 0
        END AS win_rate
      FROM trade_counts
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate average position size
   */
  const getAveragePositionSize = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      SELECT 
        COALESCE(ROUND(AVG(
          CASE 
            WHEN number_of_contracts > 0 THEN (total_premium * number_of_contracts * 100)
            ELSE 0
          END
        ), 2), 0) AS average_position_size
      FROM options
      WHERE user_id = ?
        AND status = 'closed'
        ${dateFilter}
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate average risk per trade
   */
  const getAverageRiskPerTrade = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options, false); // Use entry_date for risk calculation
    
    const sql = `
      SELECT 
        COALESCE(ROUND(AVG(
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
          END
        ), 2), 0) AS average_risk_per_trade
      FROM options
      WHERE user_id = ?
        AND status = 'closed'
        ${dateFilter}
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate loss rate percentage
   */
  const getLossRate = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const dateFilter = getDateFilter(options);
    
    const sql = `
      WITH trade_stats AS (
        SELECT 
          COUNT(*) AS total_trades,
          SUM(CASE WHEN 
            (CASE 
              WHEN status = 'closed' AND exit_price IS NOT NULL THEN 
                (exit_price - entry_price) * number_of_contracts * 100 - total_premium
              ELSE 0 
            END) < 0 
          THEN 1 ELSE 0 END) AS losing_trades
        FROM options
        WHERE user_id = ?
          AND status = 'closed'
          AND exit_price IS NOT NULL
          ${dateFilter}
      )
      SELECT 
        CASE 
          WHEN total_trades = 0 THEN 0 
          ELSE ROUND((losing_trades * 100.0 / total_trades), 2)
        END AS loss_rate_percentage
      FROM trade_stats
    `;

    const result = await query(sql, [userId]);
    return result.values[0]?.[0] as number || 0;
  }, [userId, query, getDateFilter]);

  /**
   * Calculate risk to reward ratio
   * Risk/Reward Ratio = Average Loss / Average Gain
   */
  const getRiskRewardRatio = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const [averageGain, averageLoss] = await Promise.all([
      getAverageGain(options),
      getAverageLoss(options)
    ]);

    if (averageGain === 0) return 0;
    return Math.round((averageLoss / averageGain) * 100) / 100;
  }, [getAverageGain, getAverageLoss]);

  /**
   * Calculate trade expectancy
   * Trade Expectancy = (Win Rate * Average Gain) - (Loss Rate * Average Loss)
   */
  const getTradeExpectancy = useCallback(async (options: OptionsAnalyticsOptions = {}): Promise<number> => {
    const [winRate, averageGain, averageLoss] = await Promise.all([
      getWinRate(options),
      getAverageGain(options),
      getAverageLoss(options)
    ]);

    const winRateDecimal = winRate / 100;
    const lossRateDecimal = 1 - winRateDecimal;

    return Math.round(((winRateDecimal * averageGain) - (lossRateDecimal * averageLoss)) * 100) / 100;
  }, [getWinRate, getAverageGain, getAverageLoss]);

  return {
    // Individual metrics
    getProfitFactor,
    getAvgHoldTimeWinners,
    getAvgHoldTimeLosers,
    getBiggestWinner,
    getBiggestLoser,
    getAverageGain,
    getAverageLoss,
    getNetPnL,
    getWinRate,
    getAveragePositionSize,
    getAverageRiskPerTrade,
    getLossRate,
    getRiskRewardRatio,
    getTradeExpectancy,
    
    // Combined metrics
    getAllAnalytics: async (options: OptionsAnalyticsOptions = {}): Promise<OptionsAnalyticsResult> => {
      const [
        profitFactor,
        avgHoldTimeWinners,
        avgHoldTimeLosers,
        biggestWinner,
        biggestLoser,
        averageGain,
        averageLoss,
        netPnL,
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
        getWinRate(options),
        getAveragePositionSize(options),
        getAverageRiskPerTrade(options),
        getLossRate(options)
      ]);

      const riskRewardRatio = await getRiskRewardRatio(options);
      const tradeExpectancy = await getTradeExpectancy(options);

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
    },
    
    // Utility
    getDateFilter
  };
}

// Types are already exported above with the interface declarations
