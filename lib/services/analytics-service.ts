import { apiClient } from "./api-client";
import { apiConfig } from "@/lib/config/api";

export interface StockAnalytics {
  winRate: number;
  averageGain: number;
  averageLoss: number;
  riskRewardRatio: number;
  tradeExpectancy: number;
  netPnl: number;
}

export interface OptionAnalytics {
  winRate: number;
  averageGain: number;
  averageLoss: number;
  riskRewardRatio: number;
  tradeExpectancy: number;
  netPnl: number;
}

export interface PortfolioAnalytics {
  stocks: StockAnalytics;
  options: OptionAnalytics;
}

class AnalyticsService {
  // Stock Analytics Methods
  async getStockWinRate(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.winRate, { params });
  }

  async getStockAverageGain(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.averageGain, { params });
  }

  async getStockAverageLoss(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.averageLoss, { params });
  }

  async getStockRiskRewardRatio(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.riskRewardRatio, { params });
  }

  async getStockTradeExpectancy(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.tradeExpectancy, { params });
  }

  async getStockNetPnl(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.netPnl, { params });
  }

  async getStockAnalytics(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<StockAnalytics> {
    const [
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl,
    ] = await Promise.all([
      this.getStockWinRate(params),
      this.getStockAverageGain(params),
      this.getStockAverageLoss(params),
      this.getStockRiskRewardRatio(params),
      this.getStockTradeExpectancy(params),
      this.getStockNetPnl(params)
    ]);

    return {
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl,
    };
  }

  // Option Analytics Methods
  async getOptionWinRate(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.winRate, { params });
  }

  async getOptionAverageGain(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.averageGain, { params });
  }

  async getOptionAverageLoss(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.averageLoss, { params });
  }

  async getOptionRiskRewardRatio(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.riskRewardRatio, { params });
  }

  async getOptionTradeExpectancy(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.tradeExpectancy, { params });
  }

  async getOptionNetPnl(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.netPnl, { params });
  }

  async getOptionAnalytics(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<OptionAnalytics> {
    const [
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl,
    ] = await Promise.all([
      this.getOptionWinRate(params),
      this.getOptionAverageGain(params),
      this.getOptionAverageLoss(params),
      this.getOptionRiskRewardRatio(params),
      this.getOptionTradeExpectancy(params),
      this.getOptionNetPnl(params)
    ]);

    return {
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl,
    };
  }

  // Portfolio Analytics
  async getPortfolioAnalytics(params?: {
    periodType?: string;
    customStartDate?: string;
    customEndDate?: string;
  }): Promise<PortfolioAnalytics> {
    const [stocks, options] = await Promise.all([
      this.getStockAnalytics(params),
      this.getOptionAnalytics(params),
    ]);

    return {
      stocks,
      options,
    };
  }

  // Combined method to get analytics for either stocks or options
  async getAnalytics(
    type: 'stocks' | 'options',
    params?: {
      periodType?: string;
      customStartDate?: string;
      customEndDate?: string;
    }
  ): Promise<StockAnalytics | OptionAnalytics> {
    return type === 'stocks'
      ? this.getStockAnalytics(params)
      : this.getOptionAnalytics(params);
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
export default analyticsService;
