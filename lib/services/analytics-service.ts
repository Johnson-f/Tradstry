import { apiClient } from './api-client';
import { apiConfig } from '@/lib/config/api';

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
  async getStockWinRate(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.winRate);
  }

  async getStockAverageGain(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.averageGain);
  }

  async getStockAverageLoss(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.averageLoss);
  }

  async getStockRiskRewardRatio(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.riskRewardRatio);
  }

  async getStockTradeExpectancy(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.tradeExpectancy);
  }

  async getStockNetPnl(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.stocks.netPnl);
  }

  async getStockAnalytics(): Promise<StockAnalytics> {
    const [
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl
    ] = await Promise.all([
      this.getStockWinRate(),
      this.getStockAverageGain(),
      this.getStockAverageLoss(),
      this.getStockRiskRewardRatio(),
      this.getStockTradeExpectancy(),
      this.getStockNetPnl()
    ]);

    return {
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl
    };
  }

  // Option Analytics Methods
  async getOptionWinRate(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.winRate);
  }

  async getOptionAverageGain(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.averageGain);
  }

  async getOptionAverageLoss(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.averageLoss);
  }

  async getOptionRiskRewardRatio(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.riskRewardRatio);
  }

  async getOptionTradeExpectancy(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.tradeExpectancy);
  }

  async getOptionNetPnl(): Promise<number> {
    return apiClient.get<number>(apiConfig.endpoints.analytics.options.netPnl);
  }

  async getOptionAnalytics(): Promise<OptionAnalytics> {
    const [
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl
    ] = await Promise.all([
      this.getOptionWinRate(),
      this.getOptionAverageGain(),
      this.getOptionAverageLoss(),
      this.getOptionRiskRewardRatio(),
      this.getOptionTradeExpectancy(),
      this.getOptionNetPnl()
    ]);

    return {
      winRate,
      averageGain,
      averageLoss,
      riskRewardRatio,
      tradeExpectancy,
      netPnl
    };
  }

  // Portfolio Analytics
  async getPortfolioAnalytics(): Promise<PortfolioAnalytics> {
    return apiClient.get<PortfolioAnalytics>(apiConfig.endpoints.analytics.portfolio);
  }

  // Combined method to get analytics for either stocks or options
  async getAnalytics(type: 'stocks' | 'options'): Promise<StockAnalytics | OptionAnalytics> {
    if (type === 'stocks') {
      return this.getStockAnalytics();
    } else {
      return this.getOptionAnalytics();
    }
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
export default analyticsService;
