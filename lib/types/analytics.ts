// Analytics Types for Frontend

export type PeriodType = '7d' | '30d' | '90d' | '1y' | 'all_time' | 'custom';

export interface DateRangeFilter {
  periodType: PeriodType;
  customStartDate?: string;
  customEndDate?: string;
}

export interface StockAnalytics {
  winRate: number;
  averageGain: number;
  averageLoss: number;
  riskRewardRatio: number;
  tradeExpectancy: number;
  netPnl: number;
  // Advanced metrics
  profitFactor: number;
  avgHoldTimeWinners: number;
  avgHoldTimeLosers: number;
  biggestWinner: number;
  biggestLoser: number;
  // New metrics
  averagePositionSize: number;
  averageRiskPerTrade: number;
  lossRate: number;
}

export interface OptionAnalytics {
  winRate: number;
  averageGain: number;
  averageLoss: number;
  riskRewardRatio: number;
  tradeExpectancy: number;
  netPnl: number;
  // Advanced metrics
  profitFactor: number;
  avgHoldTimeWinners: number;
  avgHoldTimeLosers: number;
  biggestWinner: number;
  biggestLoser: number;
  // New metrics
  averagePositionSize: number;
  averageRiskPerTrade: number;
  lossRate: number;
}

export interface PeriodInfo {
  periodType: string;
  customStartDate?: string;
  customEndDate?: string;
}

export interface PortfolioAnalytics {
  stocks: StockAnalytics;
  options: OptionAnalytics;
  periodInfo: PeriodInfo;
}

export interface CombinedAnalytics {
  winRate: number;
  averageGain: number;
  averageLoss: number;
  riskRewardRatio: number;
  tradeExpectancy: number;
  netPnl: number;
  profitFactor: number;
  avgHoldTimeWinners: number;
  avgHoldTimeLosers: number;
  biggestWinner: number;
  biggestLoser: number;
  periodInfo: PeriodInfo;
}

export interface DailyPnLTrade {
  tradeDate: string;
  totalPnl: number;
  totalTrades: number;
  stockTrades: number;
  optionTrades: number;
}

export interface TickerProfitSummary {
  symbol: string;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalProfit: number;
  totalLoss: number;
  netPnl: number;
  avgProfit: number;
  avgLoss: number;
}

export interface WeeklyTradingMetrics {
  week_start_date: string;
  week_end_date: string;
  total_trades: number;
  profitable_trades: number;
  unprofitable_trades: number;
  win_rate: number;
  net_pnl: number;
  profit_factor: number;
  max_drawdown: number;
  expectancy_per_trade: number;
}

export interface WeeklyMetrics {
  week: string; // ISO week format (e.g., "2024-W01")
  weekStartDate: string;
  weekEndDate: string;
  totalTrades: number;
  netPnl: number;
  winRate: number;
  stockTrades: number;
  optionTrades: number;
  stockPnl: number;
  optionPnl: number;
}

export interface MonthlyMetrics {
  month: string; // Format: "2024-01"
  monthName: string; // Format: "January 2024"
  totalTrades: number;
  netPnl: number;
  winRate: number;
  stockTrades: number;
  optionTrades: number;
  stockPnl: number;
  optionPnl: number;
}

export interface AnalyticsQuery {
  periodType?: PeriodType;
  customStartDate?: string;
  customEndDate?: string;
}

// Frontend-specific interfaces for easier consumption
export interface AnalyticsFilters {
  periodType?: PeriodType;
  customStartDate?: Date | null;
  customEndDate?: Date | null;
}

export interface UseAnalyticsReturn {
  winRate: number | null;
  averageGain: number | null;
  averageLoss: number | null;
  riskRewardRatio: number | null;
  tradeExpectancy: number | null;
  netPnl: number | null;
  // Advanced metrics
  profitFactor: number | null;
  avgHoldTimeWinners: number | null;
  avgHoldTimeLosers: number | null;
  biggestWinner: number | null;
  biggestLoser: number | null;
  // New metrics
  averagePositionSize: number | null;
  averageRiskPerTrade: number | null;
  lossRate: number | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UsePortfolioAnalyticsReturn {
  portfolioData: PortfolioAnalytics | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseCombinedAnalyticsReturn {
  combinedData: CombinedAnalytics | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseDailyPnLTradesReturn {
  dailyData: DailyPnLTrade[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseTickerProfitSummaryReturn {
  tickerData: TickerProfitSummary[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseWeeklyTradingMetricsReturn {
  weeklyData: WeeklyTradingMetrics | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseWeeklyMetricsReturn {
  weeklyData: WeeklyMetrics[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UseMonthlyMetricsReturn {
  monthlyData: MonthlyMetrics[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface CombinedTradeMetric {
  trade_date: string;
  total_trades: number;
  activity_level: number;
  net_pnl: number;
}

export interface UseCombinedTradeMetricsReturn {
  metricsData: CombinedTradeMetric[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} 