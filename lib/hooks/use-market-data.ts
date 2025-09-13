"use client";

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { marketDataService } from "@/lib/services/market-data-service";
import type { IndexData, HistoricalDataPoint, MarketMover, MarketMoverWithLogo, MarketMoversOverview, MarketMoversRequest, CompanyLogosRequest, CompanyLogo, EarningsCalendarLogosRequest, HistoricalPrice, HistoricalPriceSummary, LatestHistoricalPrice, HistoricalPriceRange, HistoricalPriceRequest, HistoricalPriceSummaryRequest, LatestHistoricalPriceRequest, HistoricalPriceRangeRequest, SymbolHistoricalOverview } from "@/lib/types/market-data";

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
              existingData.historical.map(point => point.timestamp)
            );
            
            const newPoints = newData.historical.filter(
              point => !existingTimestamps.has(point.timestamp)
            );
            
            mergedData[symbol] = {
              ...newData,
              historical: [...existingData.historical, ...newPoints]
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

export function useGainers(count: number = 25) {
  const {
    data: gainers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'gainers', count],
    queryFn: () => marketDataService.getGainers(count),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    gainers: gainers ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useLosers(count: number = 25) {
  const {
    data: losers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'losers', count],
    queryFn: () => marketDataService.getLosers(count),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    losers: losers ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useActives(count: number = 25) {
  const {
    data: actives,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'actives', count],
    queryFn: () => marketDataService.getActives(count),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
  });

  return {
    actives: actives ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// SYMBOL HISTORICAL DATA HOOK
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
// NEW MARKET MOVERS HOOKS (BACKEND INTEGRATION)
// =====================================================

export function useTopGainers(params?: MarketMoversRequest) {
  const {
    data: gainers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'gainers', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getTopGainers(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    gainers: gainers ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTopLosers(params?: MarketMoversRequest) {
  const {
    data: losers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'losers', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getTopLosers(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    losers: losers ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useMostActive(params?: MarketMoversRequest) {
  const {
    data: mostActive,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'most-active', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getMostActive(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    mostActive: mostActive ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTopGainersWithLogos(params?: MarketMoversRequest) {
  const {
    data: gainers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'gainers-with-logos', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getTopGainersWithLogos(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    gainers: gainers ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTopLosersWithLogos(params?: MarketMoversRequest) {
  const {
    data: losers,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'losers-with-logos', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getTopLosersWithLogos(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    losers: losers ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useMostActiveWithLogos(params?: MarketMoversRequest) {
  const {
    data: mostActive,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'most-active-with-logos', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getMostActiveWithLogos(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    mostActive: mostActive ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useMarketMoversOverview(params?: MarketMoversRequest) {
  const {
    data: overview,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['market-movers', 'overview', params?.data_date, params?.limit],
    queryFn: () => marketDataService.getMarketMoversOverview(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
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
