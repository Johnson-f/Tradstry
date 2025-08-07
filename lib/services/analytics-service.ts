import { apiClient } from './api-client';
import { ApiResponse } from '@/types/api';

export interface PortfolioAnalytics {
  stocks: {
    win_rate: number;
    average_gain: number;
    average_loss: number;
    risk_reward_ratio: number;
    trade_expectancy: number;
    net_pnl: number;
  };
  options: {
    win_rate: number;
    average_gain: number;
    average_loss: number;
    risk_reward_ratio: number;
    trade_expectancy: number;
    net_pnl: number;
  };
}

export const analyticsService = {
  // Stock Analytics
  async getStockWinRate(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/stocks/win-rate');
  },

  async getStockAverageGain(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/stocks/average-gain');
  },

  async getStockAverageLoss(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/stocks/average-loss');
  },

  async getStockRiskRewardRatio(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/stocks/risk-reward-ratio');
  },

  async getStockTradeExpectancy(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/stocks/trade-expectancy');
  },

  async getStockNetPnl(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/stocks/net-pnl');
  },

  // Options Analytics
  async getOptionWinRate(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/options/win-rate');
  },

  async getOptionAverageGain(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/options/average-gain');
  },

  async getOptionAverageLoss(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/options/average-loss');
  },

  async getOptionRiskRewardRatio(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/options/risk-reward-ratio');
  },

  async getOptionTradeExpectancy(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/options/trade-expectancy');
  },

  async getOptionNetPnl(): Promise<ApiResponse<number>> {
    return apiClient.get<number>('/analytics/options/net-pnl');
  },

  // Combined Portfolio Analytics
  async getPortfolioAnalytics(): Promise<ApiResponse<PortfolioAnalytics>> {
    return apiClient.get<PortfolioAnalytics>('/analytics/portfolio');
  },
};

export default analyticsService;
