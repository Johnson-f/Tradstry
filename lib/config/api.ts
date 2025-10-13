const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:9000";

export const apiConfig = {
  baseURL: API_BASE_URL,
  apiPrefix: "/api",
  endpoints: {
    // User management endpoints (Rust backend)
    user: {
      initialize: "/user/initialize",
    },
    // Images endpoints
    images: {
      base: "/images",
      upload: "/images/upload",
      count: "/images/count",
      byTradeNote: (tradeNoteId: string) => `/images/trade-note/${tradeNoteId}`,
      byId: (imageId: string) => `/images/${imageId}`,
    },
    // Health check
    health: "/health",
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
    // Market Data endpoints
    marketData: {
      base: "/market-data",
      // Earnings endpoints
      earnings: {
        dailySummary: "/market-data/earnings/daily-summary",
      },
      // Company endpoints
      companies: {
        info: (symbol: string) => `/market-data/company/${symbol}`,
        bySector: "/market-data/companies/by-sector",
        search: "/market-data/companies/search",
      },
      // News endpoints
      news: {
        latest: "/market-data/news/latest",
        filtered: "/market-data/news/filtered",
        symbol: (symbol: string) => `/market-data/news/symbol/${symbol}`,
        symbolLatest: (symbol: string) => `/market-data/news/symbol/${symbol}/latest`,
        symbolStats: (symbol: string) => `/market-data/news/symbol/${symbol}/stats`,
        symbolSearch: (symbol: string) => `/market-data/news/symbol/${symbol}/search`,
      },
      // Stock metrics endpoints
      stocks: {
        quotes: (symbol: string) => `/market-data/quotes/${symbol}`,
        quotesWithPrices: (symbol: string) => `/market-data/quotes/${symbol}/with-prices`,
        fundamentals: (symbol: string) => `/market-data/fundamentals/${symbol}`,
        combined: (symbol: string) => `/market-data/stock/${symbol}/combined`,
      },
      // Price movements endpoints
      movements: {
        significant: "/market-data/movements/significant",
        topMoversToday: "/market-data/movements/top-movers-today",
      },
      // Overview endpoint
      overview: (symbol: string) => `/market-data/overview/${symbol}`,
      // Symbol management endpoints
      symbols: {
        check: (symbol: string) => `/market-data/symbols/check/${symbol}`,
        save: "/market-data/symbols/save",
      },
      // Symbol search endpoint
      search: "/market-data/search",
      // Quotes endpoint
      quotes: "/market-data/quotes",
      // Market movers endpoints - enhanced with real-time prices
      movers: {
        gainersWithPrices: "/market-data/movers/gainers-with-prices",
        losersWithPrices: "/market-data/movers/losers-with-prices",
        mostActiveWithPrices: "/market-data/movers/most-active-with-prices",
        overviewWithPrices: "/market-data/movers/overview-with-prices",
      },
      // Company logos endpoints
      logos: {
        batch: "/market-data/logos/batch",
        earningsCalendarBatch: "/market-data/logos/earnings-calendar-batch",
      },
      // Historical prices endpoints
      historical: {
        base: (symbol: string) => `/market-data/historical/${symbol}`,
        summary: (symbol: string) => `/market-data/historical/${symbol}/summary`,
        latest: (symbol: string) => `/market-data/historical/${symbol}/latest`,
        range: (symbol: string) => `/market-data/historical/${symbol}/range`,
        overview: (symbol: string) => `/market-data/historical/${symbol}/overview`,
      },
      // Health check
      health: "/market-data/health",
      // Watchlist endpoints - enhanced with real-time prices
      watchlists: {
        // Enhanced endpoints with real-time prices  
        withPrices: "/market-data/watchlists/with-prices",
        byIdWithPrices: (id: number) => `/market-data/watchlists/${id}/with-prices`,
        itemsWithPrices: (id: number) => `/market-data/watchlists/${id}/items/with-prices`,
        // CRUD operations (still needed)
        base: "/market-data/watchlists",
        addItem: "/market-data/watchlists/items",
        deleteItem: (itemId: number) => `/market-data/watchlists/items/${itemId}`,
        deleteBySymbol: (watchlistId: number, symbol: string) => `/market-data/watchlists/${watchlistId}/items/${symbol}`,
        clear: (id: number) => `/market-data/watchlists/${id}/clear`,
      },
      // Stock peers endpoints - enhanced with real-time prices
      peers: {
        withPrices: (symbol: string) => `/market-data/peers/${symbol}/with-prices`,
        topPerformersWithPrices: (symbol: string) => `/market-data/peers/${symbol}/top-performing/with-prices`,
      },
      // Enhanced cache endpoints
      cache: {
        symbol: (symbol: string) => `/market-data/cache/symbol/${symbol}`,
        majorIndices: "/market-data/cache/major-indices",
        historicalData: "/market-data/cache/historical-data",
        singleSymbol: "/market-data/cache/single-symbol",
        historicalSummary: (symbol: string) => `/market-data/cache/${symbol}/historical-summary`,
      },
      financials: {
        keyStats: (symbol: string) => `/market-data/financials/key-stats/${symbol}`,
        incomeStatement: (symbol: string) => `/market-data/financials/income-statement/${symbol}`,
        balanceSheet: (symbol: string) => `/market-data/financials/balance-sheet/${symbol}`,
        cashFlow: (symbol: string) => `/market-data/financials/cash-flow/${symbol}`,
      },
    },
    // AI Summary endpoints (Static - Production)
    aiSummary: {
      generate: "/ai-summary/generate",
      quickInsights: "/ai-summary/quick-insights",
      status: "/ai-summary/status",
      resetChat: "/ai-summary/chat/reset",
      // Reports
      reports: {
        base: "/ai-summary/reports",
        byId: (id: string) => `/ai-summary/reports/${id}`,
        searchSimilar: "/ai-summary/reports/search-similar",
        stats: "/ai-summary/reports/stats",
      },
      // Chat history and endpoints
      chat: {
        base: "/ai-summary/chat",
        history: "/ai-summary/chat/history",
        searchSimilar: "/ai-summary/chat/search-similar",
        stats: "/ai-summary/chat/stats",
        deleteQA: (qaId: string) => `/ai-summary/chat/history/${qaId}`,
      },
      health: "/ai-summary/health",
    },
    // AI Dynamic endpoints (Dynamic - Experimental)
    aiDynamic: {
      // Versioned routes
      versioned: {
        generate: (version: string) => `/ai-dynamic/${version}/generate`,
        chat: (version: string) => `/ai-dynamic/${version}/chat`,
      },
      // Service-based routes
      service: {
        base: (serviceType: string) => `/ai-dynamic/service/${serviceType}`,
        action: (serviceType: string, action: string) => `/ai-dynamic/service/${serviceType}/${action}`,
      },
      // Feature flag routes
      features: {
        base: (featureName: string) => `/ai-dynamic/features/${featureName}`,
      },
      // Wildcard routes
      dynamic: (path: string) => `/ai-dynamic/dynamic/${path}`,
    },
  },
  timeout: 300000, // 3 minutes
  retries: 3,
};

export const getFullUrl = (endpoint: string): string => {
  return `${apiConfig.baseURL}${apiConfig.apiPrefix}${endpoint}`;
};

export default apiConfig;
