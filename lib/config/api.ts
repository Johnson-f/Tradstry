const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export const apiConfig = {
  baseURL: API_BASE_URL,
  apiPrefix: "/api",
  endpoints: {
    // Auth endpoints
    auth: {
      login: "/auth/login",
      register: "/auth/register",
      refresh: "/auth/refresh",
      logout: "/auth/logout",
    },
    // Stock endpoints
    stocks: {
      base: "/stocks",
      byId: (id: number) => `/stocks/${id}`,
      bySymbol: (symbol: string) => `/stocks?symbol=${symbol}`,
      open: "/stocks?status=open",
      closed: "/stocks?status=closed",
      dateRange: (startDate: string, endDate: string) =>
        `/stocks?start_date=${startDate}&end_date=${endDate}`,
    },
    // Options endpoints
    options: {
      base: "/options",
      byId: (id: number) => `/options/${id}`,
      bySymbol: (symbol: string) => `/options?symbol=${symbol}`,
      byStrategy: (strategy: string) => `/options?strategy_type=${strategy}`,
      byOptionType: (type: "Call" | "Put") => `/options?option_type=${type}`,
      open: "/options?status=open",
      closed: "/options?status=closed",
      byExpiration: (date: string) => `/options?expiration_date=${date}`,
      dateRange: (startDate: string, endDate: string) =>
        `/options?start_date=${startDate}&end_date=${endDate}`,
    },
    // Analytics endpoints
    analytics: {
      stocks: {
        winRate: "/analytics/stocks/win-rate",
        averageGain: "/analytics/stocks/average-gain",
        averageLoss: "/analytics/stocks/average-loss",
        riskRewardRatio: "/analytics/stocks/risk-reward-ratio",
        tradeExpectancy: "/analytics/stocks/trade-expectancy",
        netPnl: "/analytics/stocks/net-pnl",
      },
      options: {
        winRate: "/analytics/options/win-rate",
        averageGain: "/analytics/options/average-gain",
        averageLoss: "/analytics/options/average-loss",
        riskRewardRatio: "/analytics/options/risk-reward-ratio",
        tradeExpectancy: "/analytics/options/trade-expectancy",
        netPnl: "/analytics/options/net-pnl",
      },
      portfolio: "/analytics/portfolio",
    },
    // Health check
    health: "/health",
  },
  timeout: 30000, // 30 seconds
  retries: 3,
};

export const getFullUrl = (endpoint: string): string => {
  return `${apiConfig.baseURL}${apiConfig.apiPrefix}${endpoint}`;
};

export default apiConfig;
