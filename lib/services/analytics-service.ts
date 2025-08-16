import { apiClient } from "./api-client";
import { apiConfig } from "@/lib/config/api";
import type {
  StockAnalytics,
  OptionAnalytics,
  PortfolioAnalytics,
  CombinedAnalytics,
  DailyPnLTrade,
  TickerProfitSummary,
  AnalyticsQuery
} from "@/lib/types/analytics";

class AnalyticsService {
  // Stock Analytics Methods
  async getStockWinRate(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.winRate, { params });
  }

  async getStockAverageGain(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.averageGain, { params });
  }

  async getStockAverageLoss(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.averageLoss, { params });
  }

  async getStockRiskRewardRatio(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.riskRewardRatio, { params });
  }

  async getStockTradeExpectancy(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.tradeExpectancy, { params });
  }

  async getStockNetPnl(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.netPnl, { params });
  }

  // Advanced Stock Analytics Methods
  async getStockProfitFactor(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.profitFactor, { params });
  }

  async getStockAvgHoldTimeWinners(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.avgHoldTimeWinners, { params });
  }

  async getStockAvgHoldTimeLosers(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.avgHoldTimeLosers, { params });
  }

  async getStockBiggestWinner(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.biggestWinner, { params });
  }

  async getStockBiggestLoser(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.biggestLoser, { params });
  }

  // New Metrcs 
  async getStockAveragePositionSize(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.averagePositionSize, { params });
  }
  
  async getStockAverageRiskPerTrade(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.averageRiskPerTrade, { params });
  }
  
  async getStockLossRate(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.lossRate, { params });
  }
  
  async getStockAnalytics(params?: AnalyticsQuery): Promise<StockAnalytics> {
    const [
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl,
      profitFactor,
      avgHoldTimeWinners,
      avgHoldTimeLosers,
      biggestWinner,
      biggestLoser,
      averagePositionSize,
      averageRiskPerTrade,
      lossRate,
    ] = await Promise.all([
      this.getStockWinRate(params),
      this.getStockAverageGain(params),
      this.getStockAverageLoss(params),
      this.getStockRiskRewardRatio(params),
      this.getStockTradeExpectancy(params),
      this.getStockNetPnl(params),
      this.getStockProfitFactor(params),
      this.getStockAvgHoldTimeWinners(params),
      this.getStockAvgHoldTimeLosers(params),
      this.getStockBiggestWinner(params),
      this.getStockBiggestLoser(params),
      this.getStockAveragePositionSize(params),
      this.getStockAverageRiskPerTrade(params),
      this.getStockLossRate(params),
    ]);

    return {
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl,
      profitFactor,
      avgHoldTimeWinners,
      avgHoldTimeLosers,
      biggestWinner,
      biggestLoser,
      averagePositionSize,
      averageRiskPerTrade,
      lossRate,
    };
  }

  // Option Analytics Methods
  async getOptionWinRate(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.winRate, { params });
  }

  async getOptionAverageGain(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.averageGain, { params });
  }

  async getOptionAverageLoss(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.averageLoss, { params });
  }

  async getOptionRiskRewardRatio(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.riskRewardRatio, { params });
  }

  async getOptionTradeExpectancy(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.tradeExpectancy, { params });
  }

  async getOptionNetPnl(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.netPnl, { params });
  }

  // Advanced Option Analytics Methods
  async getOptionProfitFactor(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.profitFactor, { params });
  }

  async getOptionAvgHoldTimeWinners(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.avgHoldTimeWinners, { params });
  }

  async getOptionAvgHoldTimeLosers(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.avgHoldTimeLosers, { params });
  }

  async getOptionBiggestWinner(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.biggestWinner, { params });
  }

  async getOptionBiggestLoser(params?: AnalyticsQuery): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.biggestLoser, { params });
  }

  async getOptionAnalytics(params?: AnalyticsQuery): Promise<OptionAnalytics> {
    const [
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl,
      profitFactor,
      avgHoldTimeWinners,
      avgHoldTimeLosers,
      biggestWinner,
      biggestLoser,
    ] = await Promise.all([
      this.getOptionWinRate(params),
      this.getOptionAverageGain(params),
      this.getOptionAverageLoss(params),
      this.getOptionRiskRewardRatio(params),
      this.getOptionTradeExpectancy(params),
      this.getOptionNetPnl(params),
      this.getOptionProfitFactor(params),
      this.getOptionAvgHoldTimeWinners(params),
      this.getOptionAvgHoldTimeLosers(params),
      this.getOptionBiggestWinner(params),
      this.getOptionBiggestLoser(params),
    ]);

    return {
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl,
      profitFactor,
      avgHoldTimeWinners,
      avgHoldTimeLosers,
      biggestWinner,
      biggestLoser,
    };
  }

  // Portfolio Analytics
  async getPortfolioAnalytics(params?: AnalyticsQuery): Promise<PortfolioAnalytics> {
    const [stocks, options] = await Promise.all([
      this.getStockAnalytics(params),
      this.getOptionAnalytics(params),
    ]);

    return {
      stocks,
      options,
      periodInfo: {
        periodType: params?.periodType || 'all_time',
        customStartDate: params?.customStartDate,
        customEndDate: params?.customEndDate,
      },
    };
  }

  /* Combined Portfolio Analytics (endpoint that fetches the win rate, average gain, stuff like that
    * for both options & stocks 
  */
  async getCombinedPortfolioAnalytics(params?: AnalyticsQuery): Promise<CombinedAnalytics> {
    return apiClient.get<CombinedAnalytics>(apiConfig.endpoints.analytics.portfolioCombined, { params });
  }

  // Special Analytics Methods (will use the endpoint in the calendar daily summary view)
  async getDailyPnLTrades(params?: AnalyticsQuery): Promise<DailyPnLTrade[]> {
    return apiClient.get<DailyPnLTrade[]>(apiConfig.endpoints.analytics.dailyPnLTrades, { params });
  }

  // Endpoint for fetching tickers & Net P&L 
  async getTickerProfitSummary(params?: AnalyticsQuery): Promise<TickerProfitSummary[]> {
    return apiClient.get<TickerProfitSummary[]>(apiConfig.endpoints.analytics.tickerProfitSummary, { params });
  }

  // Convenience Methods (not important)
  async getStockSummary(periodType: string): Promise<StockAnalytics> {
    return apiClient.get<StockAnalytics>(apiConfig.endpoints.analytics.stocks.summary(periodType));
  }

  async getOptionSummary(periodType: string): Promise<OptionAnalytics> {
    return apiClient.get<OptionAnalytics>(apiConfig.endpoints.analytics.options.summary(periodType));
  }

  async getCombinedPortfolioSummary(periodType: string): Promise<CombinedAnalytics> {
    return apiClient.get<CombinedAnalytics>(apiConfig.endpoints.analytics.portfolioCombinedSummary(periodType));
  }

  // Combined method to get analytics for either stocks or options
  async getAnalytics(
    type: 'stocks' | 'options',
    params?: AnalyticsQuery
  ): Promise<StockAnalytics | OptionAnalytics> {
    return type === 'stocks'
      ? this.getStockAnalytics(params)
      : this.getOptionAnalytics(params);
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
export default analyticsService;