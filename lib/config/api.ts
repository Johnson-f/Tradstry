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
    // Notes endpoints
    notes: {
      // Folders
      folders: {
        base: "/notes/folders/",
        byId: (id: string) => `/notes/folders/${id}`,
        bySlug: (slug: string) => `/notes/folders/slug/${slug}`,
      },
      // Notes
      notes: {
        base: "/notes/notes/",
        byId: (id: string) => `/notes/notes/${id}`,
        favorite: (id: string) => `/notes/notes/${id}/favorite`,
      },
      // Tags
      tags: {
        base: "/notes/tags/",
        byNote: (noteId: string) => `/notes/notes/${noteId}/tags`,
        removeFromNote: (noteId: string, tagName: string) => `/notes/notes/${noteId}/tags/${tagName}`,
      },
      // Templates
      templates: {
        base: "/notes/templates",
        byId: (id: string) => `/notes/templates/${id}`,
      },
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
        // Advanced metrics
        profitFactor: "/analytics/stocks/profit-factor",
        avgHoldTimeWinners: "/analytics/stocks/avg-hold-time-winners",
        avgHoldTimeLosers: "/analytics/stocks/avg-hold-time-losers",
        biggestWinner: "/analytics/stocks/biggest-winner",
        biggestLoser: "/analytics/stocks/biggest-loser",
        // New metrics
        averagePositionSize: "/analytics/stocks/average-position-size",
        averageRiskPerTrade: "/analytics/stocks/average-risk-per-trade",
        lossRate: "/analytics/stocks/loss-rate",
        // Summary endpoint
        summary: (periodType: string) => `/analytics/stocks/summary/${periodType}`,
      },
      options: {
        winRate: '/analytics/options/win-rate',
        averageGain: '/analytics/options/average-gain',
        averageLoss: '/analytics/options/average-loss',
        riskRewardRatio: '/analytics/options/risk-reward-ratio',
        tradeExpectancy: '/analytics/options/trade-expectancy',
        netPnl: '/analytics/options/net-pnl',
        // Advanced metrics
        profitFactor: '/analytics/options/profit-factor',
        avgHoldTimeWinners: '/analytics/options/avg-hold-time-winners',
        avgHoldTimeLosers: '/analytics/options/avg-hold-time-losers',
        biggestWinner: '/analytics/options/biggest-winner',
        biggestLoser: '/analytics/options/biggest-loser',
        // New metrics
        averagePositionSize: '/analytics/options/average-position-size',
        averageRiskPerTrade: '/analytics/options/average-risk-per-trade',
        lossRate: '/analytics/options/loss-rate',
        // Summary endpoint
        summary: (periodType: string) => `/analytics/options/summary/${periodType}`
      },
      portfolio: "/analytics/portfolio",
      // Combined portfolio analytics
      portfolioCombined: "/analytics/portfolio/combined",
      portfolioCombinedSummary: (periodType: string) => `/analytics/portfolio/combined/summary/${periodType}`,
      combinedTradeMetrics: "/analytics/combined-trade-metrics",
      // Combined individual metrics
      combined: {
        averagePositionSize: "/analytics/combined/average-position-size",
        averageRiskPerTrade: "/analytics/combined/average-risk-per-trade",
        lossRate: "/analytics/combined/loss-rate",
      },
      // Special analytics
      dailyPnLTrades: "/analytics/daily-pnl-trades",
      tickerProfitSummary: "/analytics/ticker-profit-summary",
      // Weekly and monthly metrics
      weeklyMetrics: "/analytics/metrics/weekly",
      monthlyMetrics: "/analytics/metrics/monthly",
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
