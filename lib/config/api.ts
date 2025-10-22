const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:9000";

export const apiConfig = {
  baseURL: API_BASE_URL,
  apiPrefix: "/api",
  endpoints: {
    // Root - unimportant endpoint 
    root: "/",
    health: "/health",
    profile: "/profile",
    me: "/me",
    myData: "/my-data",

    // Webhooks
    webhooks: {
      supabase: "/webhooks/supabase",
      clerk: "/webhooks/clerk",
    },

    // User management endpoints
    user: {
      initialize: "/user/initialize",
      check: (userId: string) => `/user/check/${userId}`,
      databaseInfo: (userId: string) => `/user/database-info/${userId}`,
      syncSchema: (userId: string) => `/user/sync-schema/${userId}`,
      schemaVersion: (userId: string) => `/user/schema-version/${userId}`,
    },

    // Images endpoints
    images: {
      base: "/images",
      test: "/images/test",
      upload: "/images/upload",
      count: "/images/count",
      byTradeNote: (tradeNoteId: string) => `/images/trade-note/${tradeNoteId}`,
      byId: (imageId: string) => `/images/${imageId}`,
      url: (imageId: string) => `/images/${imageId}/url`,
    },

    // Stocks endpoints
    stocks: {
      base: "/stocks",
      test: "/stocks/test",
      count: "/stocks/count",
      byId: (id: number) => `/stocks/${id}`,
      analytics: {
        summary: "/stocks/analytics",
        pnl: "/stocks/analytics/pnl",
        profitFactor: "/stocks/analytics/profit-factor",
        winRate: "/stocks/analytics/win-rate",
        lossRate: "/stocks/analytics/loss-rate",
        avgGain: "/stocks/analytics/avg-gain",
        avgLoss: "/stocks/analytics/avg-loss",
        biggestWinner: "/stocks/analytics/biggest-winner",
        biggestLoser: "/stocks/analytics/biggest-loser",
        avgHoldTimeWinners: "/stocks/analytics/avg-hold-time-winners",
        avgHoldTimeLosers: "/stocks/analytics/avg-hold-time-losers",
        riskRewardRatio: "/stocks/analytics/risk-reward-ratio",
        tradeExpectancy: "/stocks/analytics/trade-expectancy",
        avgPositionSize: "/stocks/analytics/avg-position-size",
        netPnl: "/stocks/analytics/net-pnl",
      },
    },

    // Options endpoints
    options: {
      base: "/options",
      test: "/options/test",
      count: "/options/count",
      byId: (id: number) => `/options/${id}`,
      analytics: {
        summary: "/options/analytics",
        pnl: "/options/analytics/pnl",
        profitFactor: "/options/analytics/profit-factor",
        winRate: "/options/analytics/win-rate",
        lossRate: "/options/analytics/loss-rate",
        avgGain: "/options/analytics/avg-gain",
        avgLoss: "/options/analytics/avg-loss",
        biggestWinner: "/options/analytics/biggest-winner",
        biggestLoser: "/options/analytics/biggest-loser",
        avgHoldTimeWinners: "/options/analytics/avg-hold-time-winners",
        avgHoldTimeLosers: "/options/analytics/avg-hold-time-losers",
        riskRewardRatio: "/options/analytics/risk-reward-ratio",
        tradeExpectancy: "/options/analytics/trade-expectancy",
        avgPositionSize: "/options/analytics/avg-position-size",
        netPnl: "/options/analytics/net-pnl",
      },
    },

    // Trade Notes endpoints
    tradeNotes: {
      base: "/trade-notes",
      test: "/trade-notes/test",
      search: "/trade-notes/search",
      recent: "/trade-notes/recent",
      count: "/trade-notes/count",
      byId: (noteId: string) => `/trade-notes/${noteId}`,
    },

    // Playbook endpoints
    playbooks: {
      base: "/playbooks",
      test: "/playbooks/test",
      count: "/playbooks/count",
      byId: (id: string) => `/playbooks/${id}`,
      tag: "/playbooks/tag",
      untag: "/playbooks/untag",
      byTrade: (tradeId: number) => `/playbooks/trades/${tradeId}`,
      trades: (setupId: string) => `/playbooks/${setupId}/trades`,
    },

    // Replicache endpoints
    replicache: {
      push: "/replicache/push",
      pull: "/replicache/pull",
    },

    // Notebook endpoints
    notebook: {
      base: "/notebook",
      notes: {
        base: "/notebook/notes",
        byId: (id: string) => `/notebook/notes/${id}`,
        tree: (id: string) => `/notebook/notes/${id}/tree`,
        reorder: (id: string) => `/notebook/notes/${id}/reorder`,
        tag: (noteId: string, tagId: string) => `/notebook/notes/${noteId}/tags/${tagId}`,
        untag: (noteId: string, tagId: string) => `/notebook/notes/${noteId}/tags/${tagId}`,
      },
      tags: {
        base: "/notebook/tags",
        byId: (id: string) => `/notebook/tags/${id}`,
      },
      templates: {
        base: "/notebook/templates",
        byId: (id: string) => `/notebook/templates/${id}`,
      },
      reminders: {
        base: "/notebook/reminders",
        byId: (id: string) => `/notebook/reminders/${id}`,
        complete: (id: string) => `/notebook/reminders/${id}/complete`,
      },
      calendar: {
        events: "/notebook/calendar/events",
        connections: "/notebook/calendar/connections",
        connect: (provider: string) => `/notebook/calendar/connect/${provider}`,
        disconnect: (id: string) => `/notebook/calendar/connections/${id}`,
        sync: (id: string) => `/notebook/calendar/connections/${id}/sync`,
        syncAll: "/notebook/calendar/sync-all",
        oauthGoogle: "/notebook/oauth/google/exchange",
        oauthMicrosoft: "/notebook/oauth/microsoft/exchange",
      },
    },

    // Analytics endpoints (Legacy or different service)
      portfolio: "/analytics/portfolio",
      portfolioCombined: "/analytics/portfolio/combined",
      portfolioCombinedSummary: (periodType: string) =>
        `/analytics/portfolio/combined/summary/${periodType}`,
      combinedTradeMetrics: "/analytics/combined-trade-metrics",
      combined: {
        averagePositionSize: "/analytics/combined/average-position-size",
        averageRiskPerTrade: "/analytics/combined/average-risk-per-trade",
        lossRate: "/analytics/combined/loss-rate",
      },
      dailyPnLTrades: "/analytics/daily-pnl-trades",
      tickerProfitSummary: "/analytics/ticker-profit-summary",
      weeklyMetrics: "/analytics/metrics/weekly",
      monthlyMetrics: "/analytics/metrics/monthly",


    // AI endpoints
    ai: {
      chat: {
        base: "/ai/chat",
        send: "/ai/chat",
        stream: "/ai/chat/stream",
        sessions: {
          base: "/ai/chat/sessions",
          byId: (id: string) => `/ai/chat/sessions/${id}`,
          updateTitle: (id: string) => `/ai/chat/sessions/${id}/title`,
        },
      },
      insights: {
        base: "/ai/insights",
        generate: "/ai/insights",
        generateAsync: "/ai/insights/async",
        byId: (id: string) => `/ai/insights/${id}`,
        tasks: {
          byId: (taskId: string) => `/ai/insights/tasks/${taskId}`,
        },
      },
      reports: {
        base: "/ai/reports",
        generate: "/ai/reports",
        generateAsync: "/ai/reports/async",
        byId: (id: string) => `/ai/reports/${id}`,
        tasks: {
          byId: (taskId: string) => `/ai/reports/tasks/${taskId}`,
        },
      },
    },

    // Market Data endpoints
    marketData: {
      base: "/market-data",
      earnings: {
        dailySummary: "/market-data/earnings/daily-summary",
      },
      companies: {
        info: (symbol: string) => `/market-data/company/${symbol}`,
        bySector: "/market-data/companies/by-sector",
        search: "/market-data/companies/search",
      },
      news: {
        latest: "/market-data/news/latest",
        filtered: "/market-data/news/filtered",
        symbol: (symbol: string) => `/market-data/news/symbol/${symbol}`,
        symbolLatest: (symbol: string) =>
          `/market-data/news/symbol/${symbol}/latest`,
        symbolStats: (symbol: string) =>
          `/market-data/news/symbol/${symbol}/stats`,
        symbolSearch: (symbol: string) =>
          `/market-data/news/symbol/${symbol}/search`,
      },
      stocks: {
        quotes: (symbol: string) => `/market-data/quotes/${symbol}`,
        quotesWithPrices: (symbol: string) =>
          `/market-data/quotes/${symbol}/with-prices`,
        fundamentals: (symbol: string) => `/market-data/fundamentals/${symbol}`,
        combined: (symbol: string) => `/market-data/stock/${symbol}/combined`,
      },
      movements: {
        significant: "/market-data/movements/significant",
        topMoversToday: "/market-data/movements/top-movers-today",
      },
      overview: (symbol: string) => `/market-data/overview/${symbol}`,
      symbols: {
        check: (symbol: string) => `/market-data/symbols/check/${symbol}`,
        save: "/market-data/symbols/save",
      },
      search: "/market-data/search",
      quotes: "/market-data/quotes",
      movers: {
        gainersWithPrices: "/market-data/movers/gainers-with-prices",
        losersWithPrices: "/market-data/movers/losers-with-prices",
        mostActiveWithPrices: "/market-data/movers/most-active-with-prices",
        overviewWithPrices: "/market-data/movers/overview-with-prices",
      },
      logos: {
        batch: "/market-data/logos/batch",
        earningsCalendarBatch: "/market-data/logos/earnings-calendar-batch",
      },
      historical: {
        base: (symbol: string) => `/market-data/historical/${symbol}`,
        summary: (symbol: string) =>
          `/market-data/historical/${symbol}/summary`,
        latest: (symbol: string) => `/market-data/historical/${symbol}/latest`,
        range: (symbol: string) => `/market-data/historical/${symbol}/range`,
        overview: (symbol: string) =>
          `/market-data/historical/${symbol}/overview`,
      },
      health: "/market-data/health",
      watchlists: {
        withPrices: "/market-data/watchlists/with-prices",
        byIdWithPrices: (id: number) =>
          `/market-data/watchlists/${id}/with-prices`,
        itemsWithPrices: (id: number) =>
          `/market-data/watchlists/${id}/items/with-prices`,
        base: "/market-data/watchlists",
        addItem: "/market-data/watchlists/items",
        deleteItem: (itemId: number) =>
          `/market-data/watchlists/items/${itemId}`,
        deleteBySymbol: (watchlistId: number, symbol: string) =>
          `/market-data/watchlists/${watchlistId}/items/${symbol}`,
        clear: (id: number) => `/market-data/watchlists/${id}/clear`,
      },
      peers: {
        withPrices: (symbol: string) =>
          `/market-data/peers/${symbol}/with-prices`,
        topPerformersWithPrices: (symbol: string) =>
          `/market-data/peers/${symbol}/top-performing/with-prices`,
      },
      cache: {
        symbol: (symbol: string) => `/market-data/cache/symbol/${symbol}`,
        majorIndices: "/market-data/cache/major-indices",
        historicalData: "/market-data/cache/historical-data",
        singleSymbol: "/market-data/cache/single-symbol",
        historicalSummary: (symbol: string) =>
          `/market-data/cache/${symbol}/historical-summary`,
      },
      financials: {
        keyStats: (symbol: string) =>
          `/market-data/financials/key-stats/${symbol}`,
        incomeStatement: (symbol: string) =>
          `/market-data/financials/income-statement/${symbol}`,
        balanceSheet: (symbol: string) =>
          `/market-data/financials/balance-sheet/${symbol}`,
        cashFlow: (symbol: string) =>
          `/market-data/financials/cash-flow/${symbol}`,
      },
    },
  },
  timeout: 30000, // 5 minutes
  retries: 3,
};

export const getFullUrl = (endpoint: string): string => {
  return `${apiConfig.baseURL}${apiConfig.apiPrefix}${endpoint}`;
};

export default apiConfig;
