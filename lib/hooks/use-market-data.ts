"use client";

import { useQuery } from '@tanstack/react-query';
import { marketDataService } from "@/lib/services/market-data-service";

// =====================================================
// EARNINGS HOOKS
// =====================================================

export function useDailyEarningsSummary(targetDate?: string) {
  const {
    data: earningsSummary,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['earnings', 'daily-summary', targetDate],
    queryFn: () => marketDataService.getDailyEarningsSummary(
      targetDate ? { target_date: targetDate } : undefined
    ),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    earningsSummary: earningsSummary ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// COMPANY INFO HOOKS
// =====================================================

export function useCompanyInfo(symbol: string, dataProvider?: string) {
  const {
    data: companyInfo,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['company', 'info', symbol, dataProvider],
    queryFn: () => marketDataService.getCompanyInfo(symbol, dataProvider),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!symbol,
  });

  return {
    companyInfo: companyInfo ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useCompaniesBySector(sector?: string, industry?: string, limit?: number, offset?: number) {
  const {
    data: companies,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['companies', 'by-sector', sector, industry, limit, offset],
    queryFn: () => marketDataService.getCompaniesBySector({
      sector,
      industry,
      limit,
      offset,
    }),
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });

  return {
    companies: companies ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useSearchCompanies(searchTerm: string, limit?: number) {
  const {
    data: companies,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['companies', 'search', searchTerm, limit],
    queryFn: () => marketDataService.searchCompanies({
      search_term: searchTerm,
      limit,
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!searchTerm && searchTerm.length > 1,
  });

  return {
    companies: companies ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// MARKET NEWS HOOKS
// =====================================================

export function useLatestMarketNews(articleLimit?: number) {
  const {
    data: marketNews,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['news', 'latest', articleLimit],
    queryFn: () => marketDataService.getLatestMarketNews(
      articleLimit ? { article_limit: articleLimit } : undefined
    ),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    marketNews: marketNews ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useFilteredMarketNews(
  articleLimit?: number,
  sourceFilter?: string,
  categoryFilter?: string,
  minRelevanceScore?: number,
  daysBack?: number
) {
  const {
    data: marketNews,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['news', 'filtered', articleLimit, sourceFilter, categoryFilter, minRelevanceScore, daysBack],
    queryFn: () => marketDataService.getFilteredMarketNews({
      article_limit: articleLimit,
      source_filter: sourceFilter,
      category_filter: categoryFilter,
      min_relevance_score: minRelevanceScore,
      days_back: daysBack,
    }),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    marketNews: marketNews ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// SYMBOL NEWS HOOKS
// =====================================================

export function useSymbolNews(
  symbol: string,
  limit?: number,
  offset?: number,
  daysBack?: number,
  minRelevance?: number,
  dataProvider?: string
) {
  const {
    data: symbolNews,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['news', 'symbol', symbol, limit, offset, daysBack, minRelevance, dataProvider],
    queryFn: () => marketDataService.getSymbolNews({
      symbol,
      limit,
      offset,
      days_back: daysBack,
      min_relevance: minRelevance,
      data_provider: dataProvider,
    }),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!symbol,
  });

  return {
    symbolNews: symbolNews ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useLatestSymbolNews(symbol: string, limit?: number) {
  const {
    data: symbolNews,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['news', 'symbol-latest', symbol, limit],
    queryFn: () => marketDataService.getLatestSymbolNews(symbol, limit),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!symbol,
  });

  return {
    symbolNews: symbolNews ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useSymbolNewsStats(symbol: string, daysBack?: number) {
  const {
    data: newsStats,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['news', 'symbol-stats', symbol, daysBack],
    queryFn: () => marketDataService.getSymbolNewsStats({
      symbol,
      days_back: daysBack,
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!symbol,
  });

  return {
    newsStats: newsStats ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useSearchSymbolNews(symbol: string, searchTerm: string, limit?: number) {
  const {
    data: newsSearch,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['news', 'symbol-search', symbol, searchTerm, limit],
    queryFn: () => marketDataService.searchSymbolNews({
      symbol,
      search_term: searchTerm,
      limit,
    }),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!symbol && !!searchTerm,
  });

  return {
    newsSearch: newsSearch ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// STOCK METRICS HOOKS
// =====================================================

export function useStockQuotes(symbol: string, quoteDate?: string, dataProvider?: string) {
  const {
    data: stockQuote,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['quotes', symbol, quoteDate, dataProvider],
    queryFn: () => marketDataService.getStockQuotes({
      symbol,
      quote_date: quoteDate,
      data_provider: dataProvider,
    }),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!symbol,
  });

  return {
    stockQuote: stockQuote ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useFundamentalData(symbol: string, dataProvider?: string) {
  const {
    data: fundamentalData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['fundamentals', symbol, dataProvider],
    queryFn: () => marketDataService.getFundamentalData({
      symbol,
      data_provider: dataProvider,
    }),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 2 * 60 * 60 * 1000, // 2 hours
    enabled: !!symbol,
  });

  return {
    fundamentalData: fundamentalData ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useCombinedStockData(symbol: string, quoteDate?: string) {
  const {
    data: combinedData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['stock', 'combined', symbol, quoteDate],
    queryFn: () => marketDataService.getCombinedStockData(symbol, quoteDate),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!symbol,
  });

  return {
    combinedData: combinedData ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// PRICE MOVEMENTS HOOKS
// =====================================================

export function useSignificantPriceMovements(
  symbol?: string,
  daysBack?: number,
  minChangePercent?: number,
  limit?: number,
  dataProvider?: string
) {
  const {
    data: priceMovements,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['movements', 'significant', symbol, daysBack, minChangePercent, limit, dataProvider],
    queryFn: () => marketDataService.getSignificantPriceMovements({
      symbol,
      days_back: daysBack,
      min_change_percent: minChangePercent,
      limit,
      data_provider: dataProvider,
    }),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    priceMovements: priceMovements ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTopMoversToday(limit?: number, minChangePercent?: number) {
  const {
    data: topMovers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['movements', 'top-movers-today', limit, minChangePercent],
    queryFn: () => marketDataService.getTopMoversToday({
      limit,
      min_change_percent: minChangePercent,
    }),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    topMovers: topMovers ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// SYMBOL OVERVIEW HOOK
// =====================================================

export function useSymbolOverview(symbol: string) {
  const {
    data: symbolOverview,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['overview', symbol],
    queryFn: () => marketDataService.getSymbolOverview(symbol),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!symbol,
  });

  return {
    symbolOverview: symbolOverview ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// HEALTH CHECK HOOK
// =====================================================

export function useMarketDataHealth() {
  const {
    data: healthStatus,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-data', 'health'],
    queryFn: () => marketDataService.getHealthCheck(),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    healthStatus: healthStatus ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
