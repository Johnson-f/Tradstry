const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:9000";

export const apiConfig = {
  baseURL: API_BASE_URL,
  apiPrefix: "/api",
  ws: {
    url: (token: string) => {
      // Use wss:// for HTTPS (production), ws:// for HTTP (development)
      const protocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
      const baseUrl = new URL(API_BASE_URL);
      return `${protocol}://${baseUrl.host}${apiConfig.apiPrefix}/ws?token=${encodeURIComponent(token)}`;
    },
  },
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
      // Trade-linked notes
      byTrade: (tradeType: 'stock' | 'option', tradeId: number) => 
        `/trades/${tradeType}/${tradeId}/notes`,
    },

    // Trade Tags endpoints
    tradeTags: {
      base: "/trade-tags",
      categories: "/trade-tags/categories",
      byId: (id: string) => `/trade-tags/${id}`,
      // Trade associations
      stockTrade: (id: number) => `/trades/stock/${id}/tags`,
      optionTrade: (id: number) => `/trades/option/${id}/tags`,
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
      // Rules management
      rules: (id: string) => `/playbooks/${id}/rules`,
      rule: (id: string, ruleId: string) => `/playbooks/${id}/rules/${ruleId}`,
      // Missed trades
      missedTrades: (id: string) => `/playbooks/${id}/missed-trades`,
      missedTrade: (id: string, missedId: string) => `/playbooks/${id}/missed-trades/${missedId}`,
      // Analytics
      analytics: (id: string) => `/playbooks/${id}/analytics`,
      allAnalytics: "/playbooks/analytics",
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

    // Analytics endpoints
    analytics: {
      // Core analytics engine endpoints (from analytics.rs)
      core: "/analytics/core",
      risk: "/analytics/risk",
      performance: "/analytics/performance",
      timeSeries: "/analytics/time-series",
      grouped: "/analytics/grouped",
      comprehensive: "/analytics/comprehensive",
      // Individual trade & symbol analytics (from core_metrics.rs)
      trade: "/analytics/trade",
      symbol: "/analytics/symbol",
    },

    // Market data endpoints
    market: {
      base: "/market",
      health: "/market/health",
      hours: "/market/hours",
      quotes: "/market/quotes",
      simpleQuotes: "/market/simple-quotes",
      similar: "/market/similar",
      historical: "/market/historical",
      movers: "/market/movers",
      gainers: "/market/gainers",
      losers: "/market/losers",
      actives: "/market/actives",
      news: "/market/news",
      indices: "/market/indices",
      sectors: "/market/sectors",
      search: "/market/search",
      indicators: "/market/indicators",
      financials: "/market/financials",
      earningsTranscript: "/market/earnings-transcript",
      holders: "/market/holders",
      subscribe: "/market/subscribe",
      unsubscribe: "/market/unsubscribe",
    },

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
        list: "/ai/reports", // GET endpoint for listing reports
        byId: (id: string) => `/ai/reports/${id}`,
        tasks: {
          byId: (taskId: string) => `/ai/reports/tasks/${taskId}`,
        },
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
