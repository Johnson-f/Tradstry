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
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<any>;
}

export interface UsePortfolioAnalyticsReturn {
  portfolioData: PortfolioAnalytics | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<any>;
}

export interface UseCombinedAnalyticsReturn {
  combinedData: CombinedAnalytics | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<any>;
}

export interface UseDailyPnLTradesReturn {
  dailyData: DailyPnLTrade[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<any>;
}

export interface UseTickerProfitSummaryReturn {
  tickerData: TickerProfitSummary[] | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<any>;
} 