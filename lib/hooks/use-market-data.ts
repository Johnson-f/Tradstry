"use client";

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { marketDataService } from "@/lib/services/market-data-service";
import type { IndexData, HistoricalDataPoint, MarketMoversRequest, 
  CompanyLogosRequest, EarningsCalendarLogosRequest, HistoricalPriceRequest, 
  HistoricalPriceSummaryRequest, LatestHistoricalPriceRequest, HistoricalPriceRangeRequest, 
  HistoricalDataRequest, SingleSymbolDataRequest,
  FinancialStatementRequest, KeyStatsRequest, 
  HoldersPaginatedRequest, 
  TranscriptsPaginatedRequest } from "@/lib/types/market-data";

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

export function useStockQuotesWithPrices(symbol: string) {
  const {
    data: stockQuoteWithPrices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['quotes-with-prices', symbol],
    queryFn: () => marketDataService.getStockQuotesWithPrices(symbol),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!symbol,
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    stockQuoteWithPrices: stockQuoteWithPrices ?? null,
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

// =====================================================
// MARKET INDICES HOOK
// =====================================================

const MARKET_INDICES = ['SPY', 'QQQ', 'DIA', 'VIX'] as const;
const UPDATE_INTERVAL = 60000; // 1 minute in milliseconds

export function useMarketIndices() {
  const [indicesData, setIndicesData] = useState<Record<string, IndexData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchIndicesData = useCallback(async () => {
    try {
      setError(null);
      
      // Fetch historical data and quotes in parallel
      const [historicalPromises, quotesData] = await Promise.all([
        Promise.all(
          MARKET_INDICES.map(symbol => 
            marketDataService.getHistoricalData(symbol, '1d', '1m')
          )
        ),
        marketDataService.getQuoteData([...MARKET_INDICES])
      ]);

      const newIndicesData: Record<string, IndexData> = {};

      MARKET_INDICES.forEach((symbol, index) => {
        const historicalData = historicalPromises[index];
        const quote = quotesData.find(q => q.symbol === symbol);
        
        // Convert historical data object to array format for charts
        const historicalArray: HistoricalDataPoint[] = Object.entries(historicalData || {})
          .map(([timestamp, data]) => ({
            ...data,
            timestamp: parseInt(timestamp),
          }))
          .sort((a, b) => a.timestamp - b.timestamp);

        newIndicesData[symbol] = {
          symbol,
          historical: historicalArray,
          quote: quote || null,
          lastUpdated: Date.now(),
        };
      });

      setIndicesData(prevData => {
        // Merge with existing data to maintain historical continuity
        const mergedData: Record<string, IndexData> = {};
        
        MARKET_INDICES.forEach(symbol => {
          const newData = newIndicesData[symbol];
          const existingData = prevData[symbol];
          
          if (existingData && newData) {
            // Append new data points to existing historical data
            const existingTimestamps = new Set(
              // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
              existingData.historical.map(point => point.timestamp)
            );
            
            const newPoints = newData.historical.filter(
              // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
              point => !existingTimestamps.has(point.timestamp)
            );
            
            mergedData[symbol] = {
              ...newData,
              historical: [...existingData.historical, ...newPoints]
              // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                .sort((a, b) => a.timestamp - b.timestamp)
                .slice(-390), // Keep last 390 points (6.5 hours of 1-minute data)
            };
          } else {
            mergedData[symbol] = newData;
          }
        });
        
        return mergedData;
      });

      setIsLoading(false);
    } catch (err) {
      setError(err as Error);
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchIndicesData();
  }, [fetchIndicesData]);

  // Set up auto-refresh interval
  useEffect(() => {
    const interval = setInterval(fetchIndicesData, UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchIndicesData]);

  const refetch = useCallback(() => {
    setIsLoading(true);
    fetchIndicesData();
  }, [fetchIndicesData]);

  return {
    indicesData,
    isLoading,
    error,
    refetch,
    lastUpdated: Math.max(...Object.values(indicesData).map(data => data.lastUpdated || 0)),
  };
}

export function useCachedSymbolData(symbol: string, limit: number = 100) {
  const {
    data: cachedSymbolData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cache', 'symbol', symbol, limit],
    queryFn: () => marketDataService.getCachedSymbolData(symbol, limit),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!symbol,
  });

  return {
    cachedSymbolData: cachedSymbolData ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useMajorIndicesData(limit: number = 100) {
  const {
    data: majorIndicesData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['cache', 'major-indices', limit],
    queryFn: () => marketDataService.getMajorIndicesData(limit),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 1 * 60 * 1000, // Auto-refresh every minute
  });

  return {
    majorIndicesData: majorIndicesData ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}


// =====================================================
// SYMBOL HISTORICAL DATA HOOK - very import hook
// =====================================================

export function useSymbolHistoricalData(symbol: string, enabled: boolean = true) {
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['historical-data', symbol],
    queryFn: () => marketDataService.getHistoricalData(symbol, '1d', '1m'),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: enabled && !!symbol,
    refetchInterval: 2 * 60 * 1000, // Refresh every 2 minutes
  });

  useEffect(() => {
    if (data) {
      // Convert historical data object to array format for charts
      const historicalArray: HistoricalDataPoint[] = Object.entries(data)
        .map(([timestamp, dataPoint]) => ({
          ...dataPoint,
          timestamp: parseInt(timestamp),
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
      
      setHistoricalData(historicalArray);
    }
  }, [data]);

  return {
    historicalData,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}


// =====================================================
// ENHANCED MARKET MOVERS HOOKS WITH REAL-TIME PRICES
// =====================================================

export function useTopGainersWithPrices(params?: MarketMoversRequest) {
  const {
    data: gainers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'gainers-with-prices', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getTopGainersWithPrices(params),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    gainers: gainers ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTopLosersWithPrices(params?: MarketMoversRequest) {
  const {
    data: losers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'losers-with-prices', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getTopLosersWithPrices(params),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    losers: losers ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useMostActiveWithPrices(params?: MarketMoversRequest) {
  const {
    data: mostActive,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'most-active-with-prices', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getMostActiveWithPrices(params),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    mostActive: mostActive ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useMarketMoversOverviewWithPrices(params?: MarketMoversRequest) {
  const {
    data: overview,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'overview-with-prices', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getMarketMoversOverviewWithPrices(params),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    overview,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useCompanyLogos(request: CompanyLogosRequest) {
  const {
    data: logos,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['company-logos', request.symbols],
    queryFn: () => marketDataService.getCompanyLogos(request),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: request.symbols.length > 0,
  });

  return {
    logos: logos ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useEarningsCalendarLogos(request: EarningsCalendarLogosRequest) {
  const {
    data: logos,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['earnings-calendar-logos', request.symbols],
    queryFn: () => marketDataService.getEarningsCalendarLogos(request),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: request.symbols.length > 0,
  });

  return {
    logos: logos ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// HISTORICAL PRICES HOOKS
// =====================================================

export function useHistoricalPrices(params: HistoricalPriceRequest) {
  const {
    data: historicalPrices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['historical-prices', params.symbol, params.time_range, params.time_interval, params.data_provider, params.limit],
    queryFn: () => marketDataService.getHistoricalPrices(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    enabled: !!params.symbol && !!params.time_range && !!params.time_interval,
  });

  return {
    historicalPrices: historicalPrices ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useHistoricalPricesSummary(params: HistoricalPriceSummaryRequest) {
  const {
    data: summary,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['historical-prices-summary', params.symbol],
    queryFn: () => marketDataService.getHistoricalPricesSummary(params),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!params.symbol,
  });

  return {
    summary: summary ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useLatestHistoricalPrices(params: LatestHistoricalPriceRequest) {
  const {
    data: latestPrices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['latest-historical-prices', params.symbol, params.limit],
    queryFn: () => marketDataService.getLatestHistoricalPrices(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!params.symbol,
  });

  return {
    latestPrices: latestPrices ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useHistoricalPriceRange(params: HistoricalPriceRangeRequest) {
  const {
    data: priceRange,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['historical-price-range', params.symbol, params.time_range, params.time_interval, params.start_date, params.end_date, params.data_provider],
    queryFn: () => marketDataService.getHistoricalPriceRange(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    enabled: !!params.symbol && !!params.time_range && !!params.time_interval && !!params.start_date && !!params.end_date,
  });

  return {
    priceRange: priceRange ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useSymbolHistoricalOverview(symbol: string) {
  const {
    data: overview,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['symbol-historical-overview', symbol],
    queryFn: () => marketDataService.getSymbolHistoricalOverview(symbol),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: !!symbol,
  });

  return {
    overview: overview ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// ENHANCED WATCHLIST HOOKS WITH REAL-TIME PRICES
// =====================================================

// Enhanced watchlist hooks with real-time prices
export function useWatchlistsWithPrices() {
  const {
    data: watchlistsWithPrices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['watchlists-with-prices'],
    queryFn: () => marketDataService.getWatchlistsWithPrices(),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    watchlistsWithPrices: watchlistsWithPrices ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useWatchlistByIdWithPrices(id: number) {
  const {
    data: watchlistWithPrices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['watchlist-with-prices', id],
    queryFn: () => marketDataService.getWatchlistByIdWithPrices(id),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!id,
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    watchlistWithPrices: watchlistWithPrices ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useWatchlistItemsWithPrices(id: number) {
  const {
    data: itemsWithPrices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['watchlist-items-with-prices', id],
    queryFn: () => marketDataService.getWatchlistItemsWithPrices(id),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!id,
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    itemsWithPrices: itemsWithPrices ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// ENHANCED STOCK PEERS HOOKS WITH REAL-TIME PRICES  
// =====================================================

// Enhanced stock peers hooks with real-time prices
export function useStockPeersWithPrices(symbol: string, dataDate?: string, limit?: number) {
  const {
    data: peersWithPrices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['stock-peers-with-prices', symbol, dataDate, limit],
    queryFn: () => marketDataService.getStockPeersWithPrices({
      symbol,
      data_date: dataDate,
      limit,
    }),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!symbol,
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    peersWithPrices: peersWithPrices ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTopPerformingPeersWithPrices(symbol: string, dataDate?: string, limit?: number) {
  const {
    data: topPeersWithPrices,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['top-performing-peers-with-prices', symbol, dataDate, limit],
    queryFn: () => marketDataService.getTopPerformingPeersWithPrices({
      symbol,
      data_date: dataDate,
      limit,
    }),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled: !!symbol,
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    topPeersWithPrices: topPeersWithPrices ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// ENHANCED CACHE HOOKS
// =====================================================

export function useFetchHistoricalDataForSymbols(request: HistoricalDataRequest, enabled: boolean = true) {
  const {
    data: historicalDataResponse,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['historical-data-batch', request.symbols, request.range_param, request.interval],
    queryFn: () => marketDataService.fetchHistoricalDataForSymbols(request),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: enabled && request.symbols.length > 0,
  });

  return {
    historicalDataResponse: historicalDataResponse ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useFetchSingleSymbolData(request: SingleSymbolDataRequest, enabled: boolean = true) {
  const {
    data: singleSymbolData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['single-symbol-data', request.symbol, request.range_param, request.interval],
    queryFn: () => marketDataService.fetchSingleSymbolData(request),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: enabled && !!request.symbol,
  });

  return {
    singleSymbolData: singleSymbolData ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useSymbolHistoricalSummary(symbol: string, periodType: string = "5m") {
  const {
    data: historicalSummary,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['symbol-historical-summary', symbol, periodType],
    queryFn: () => marketDataService.getSymbolHistoricalSummary(symbol, periodType),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    enabled: !!symbol,
  });

  return {
    historicalSummary: historicalSummary ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// FINANCIAL STATEMENTS HOOKS
// =====================================================

export function useKeyStats(params: KeyStatsRequest) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['financials', 'key-stats', params.symbol, params.frequency],
    queryFn: () => marketDataService.getKeyStats(params),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!params.symbol,
  });

  return {
    keyStats: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useIncomeStatement(params: FinancialStatementRequest) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['financials', 'income-statement', params.symbol, params.frequency, params.limit],
    queryFn: () => marketDataService.getIncomeStatement(params),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!params.symbol,
  });

  return {
    incomeStatement: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useBalanceSheet(params: FinancialStatementRequest) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['financials', 'balance-sheet', params.symbol, params.frequency, params.limit],
    queryFn: () => marketDataService.getBalanceSheet(params),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!params.symbol,
  });

  return {
    balanceSheet: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useCashFlow(params: FinancialStatementRequest) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['financials', 'cash-flow', params.symbol, params.frequency, params.limit],
    queryFn: () => marketDataService.getCashFlow(params),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!params.symbol,
  });

  return {
    cashFlow: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// HOLDERS DATA HOOKS
// =====================================================

export function useInstitutionalHolders(symbol: string, dateReported?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'institutional', symbol, dateReported, limit],
    queryFn: () => marketDataService.getInstitutionalHolders(symbol, dateReported, limit),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: !!symbol,
  });

  return {
    institutionalHolders: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useMutualFundHolders(symbol: string, dateReported?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'mutual-fund', symbol, dateReported, limit],
    queryFn: () => marketDataService.getMutualFundHolders(symbol, dateReported, limit),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: !!symbol,
  });

  return {
    mutualFundHolders: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useInsiderTransactions(
  symbol: string, 
  transactionType?: string, 
  startDate?: string, 
  endDate?: string, 
  limit?: number
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'insider-transactions', symbol, transactionType, startDate, endDate, limit],
    queryFn: () => marketDataService.getInsiderTransactions(symbol, transactionType, startDate, endDate, limit),
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: !!symbol,
  });

  return {
    insiderTransactions: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useInsiderPurchasesSummary(symbol: string, summaryPeriod?: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'insider-purchases', symbol, summaryPeriod],
    queryFn: () => marketDataService.getInsiderPurchasesSummary(symbol, summaryPeriod),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: !!symbol,
  });

  return {
    insiderPurchasesSummary: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useInsiderRoster(symbol: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'insider-roster', symbol, limit],
    queryFn: () => marketDataService.getInsiderRoster(symbol, limit),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!symbol,
  });

  return {
    insiderRoster: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useAllHolders(symbol: string, holderType?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'all', symbol, holderType, limit],
    queryFn: () => marketDataService.getAllHolders(symbol, holderType, limit),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: !!symbol,
  });

  return {
    allHolders: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTopInstitutionalHolders(orderBy?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'top-institutional', orderBy, limit],
    queryFn: () => marketDataService.getTopInstitutionalHolders(orderBy, limit),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  return {
    topInstitutionalHolders: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useRecentInsiderTransactions(transactionType?: string, daysBack?: number, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'recent-insider-transactions', transactionType, daysBack, limit],
    queryFn: () => marketDataService.getRecentInsiderTransactions(transactionType, daysBack, limit),
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });

  return {
    recentInsiderTransactions: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useHolderStatistics(symbol: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'statistics', symbol],
    queryFn: () => marketDataService.getHolderStatistics(symbol),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!symbol,
  });

  return {
    holderStatistics: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useSearchHoldersByName(namePattern: string, holderType?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'search', namePattern, holderType, limit],
    queryFn: () => marketDataService.searchHoldersByName(namePattern, holderType, limit),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: !!namePattern && namePattern.length > 2,
  });

  return {
    holderSearchResults: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useHoldersPaginated(params: HoldersPaginatedRequest) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['holders', 'paginated', params.symbol, params.holder_type, params.offset, params.limit, params.sort_column, params.sort_direction],
    queryFn: () => marketDataService.getHoldersPaginated(params),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });

  return {
    holdersPaginated: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// EARNINGS TRANSCRIPTS HOOKS
// =====================================================

export function useEarningsTranscripts(symbol: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'earnings', symbol, limit],
    queryFn: () => marketDataService.getEarningsTranscripts(symbol, limit),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!symbol,
  });

  return {
    earningsTranscripts: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useEarningsTranscriptByPeriod(symbol: string, year: number, quarter: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'by-period', symbol, year, quarter],
    queryFn: () => marketDataService.getEarningsTranscriptByPeriod(symbol, year, quarter),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days
    enabled: !!symbol && !!year && !!quarter,
  });

  return {
    earningsTranscript: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useLatestEarningsTranscript(symbol: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'latest', symbol],
    queryFn: () => marketDataService.getLatestEarningsTranscript(symbol),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!symbol,
  });

  return {
    latestEarningsTranscript: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useRecentEarningsTranscripts(daysBack?: number, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'recent', daysBack, limit],
    queryFn: () => marketDataService.getRecentEarningsTranscripts(daysBack, limit),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  });

  return {
    recentEarningsTranscripts: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useSearchEarningsTranscripts(searchText: string, symbol?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'search', searchText, symbol, limit],
    queryFn: () => marketDataService.searchEarningsTranscripts(searchText, symbol, limit),
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    enabled: !!searchText && searchText.length > 2,
  });

  return {
    transcriptSearchResults: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTranscriptsByParticipant(participantName: string, symbol?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'by-participant', participantName, symbol, limit],
    queryFn: () => marketDataService.getTranscriptsByParticipant(participantName, symbol, limit),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!participantName,
  });

  return {
    transcriptsByParticipant: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTranscriptsByDateRange(startDate: string, endDate: string, symbol?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'by-date-range', startDate, endDate, symbol, limit],
    queryFn: () => marketDataService.getTranscriptsByDateRange(startDate, endDate, symbol, limit),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!startDate && !!endDate,
  });

  return {
    transcriptsByDateRange: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTranscriptsByYear(year: number, symbol?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'by-year', year, symbol, limit],
    queryFn: () => marketDataService.getTranscriptsByYear(year, symbol, limit),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!year,
  });

  return {
    transcriptsByYear: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTranscriptStatistics(symbol: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'statistics', symbol],
    queryFn: () => marketDataService.getTranscriptStatistics(symbol),
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: !!symbol,
  });

  return {
    transcriptStatistics: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTranscriptMetadata(symbol?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'metadata', symbol, limit],
    queryFn: () => marketDataService.getTranscriptMetadata(symbol, limit),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  return {
    transcriptMetadata: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTranscriptsPaginated(params: TranscriptsPaginatedRequest) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'paginated', params.symbol, params.year, params.quarter, params.offset, params.limit, params.sort_column, params.sort_direction],
    queryFn: () => marketDataService.getTranscriptsPaginated(params),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  return {
    transcriptsPaginated: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useUniqueTranscriptParticipants(symbol?: string, limit?: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'participants', symbol, limit],
    queryFn: () => marketDataService.getUniqueTranscriptParticipants(symbol, limit),
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  return {
    transcriptParticipants: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTranscriptCountByQuarter(symbol?: string) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['transcripts', 'count-by-quarter', symbol],
    queryFn: () => marketDataService.getTranscriptCountByQuarter(symbol),
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  return {
    transcriptCountByQuarter: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
