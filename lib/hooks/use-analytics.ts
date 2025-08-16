"use client";

import { useQuery } from '@tanstack/react-query';
import { analyticsService } from "@/lib/services/analytics-service";
import type {
  StockAnalytics,
  OptionAnalytics,
  PortfolioAnalytics,
  CombinedAnalytics,
  DailyPnLTrade,
  TickerProfitSummary,
  UseAnalyticsReturn,
  UsePortfolioAnalyticsReturn,
  UseCombinedAnalyticsReturn,
  UseDailyPnLTradesReturn,
  UseTickerProfitSummaryReturn,
  AnalyticsFilters,
  PeriodType
} from "@/lib/types/analytics";

export function useAnalytics(
  type: 'stocks' | 'options',
  filters?: AnalyticsFilters
): UseAnalyticsReturn {
  // Format dates to ISO strings for the API
  const formatDate = (date: Date | null | undefined): string | undefined => {
    return date ? date.toISOString().split('T')[0] : undefined;
  };

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['analytics', type, filters],
    queryFn: () =>
      analyticsService.getAnalytics(type, {
        periodType: filters?.periodType,
        customStartDate: formatDate(filters?.customStartDate),
        customEndDate: formatDate(filters?.customEndDate),
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    winRate: data?.winRate ?? null,
    averageGain: data?.averageGain ?? null,
    averageLoss: data?.averageLoss ?? null,
    riskRewardRatio: data?.riskRewardRatio ?? null,
    tradeExpectancy: data?.tradeExpectancy ?? null,
    netPnl: data?.netPnl ?? null,
    // Advanced metrics
    profitFactor: data?.profitFactor ?? null,
    avgHoldTimeWinners: data?.avgHoldTimeWinners ?? null,
    avgHoldTimeLosers: data?.avgHoldTimeLosers ?? null,
    biggestWinner: data?.biggestWinner ?? null,
    biggestLoser: data?.biggestLoser ?? null,
    // New metrics (only available for stocks)
    averagePositionSize: (data as StockAnalytics)?.averagePositionSize ?? null,
    averageRiskPerTrade: (data as StockAnalytics)?.averageRiskPerTrade ?? null,
    lossRate: (data as StockAnalytics)?.lossRate ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function usePortfolioAnalytics(filters?: AnalyticsFilters): UsePortfolioAnalyticsReturn {
  // Format dates to ISO strings for the API
  const formatDate = (date: Date | null | undefined): string | undefined => {
    return date ? date.toISOString().split('T')[0] : undefined;
  };
  const {
    data: portfolioData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['portfolioAnalytics', filters],
    queryFn: () =>
      analyticsService.getPortfolioAnalytics({
        periodType: filters?.periodType,
        customStartDate: formatDate(filters?.customStartDate),
        customEndDate: formatDate(filters?.customEndDate),
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    portfolioData: portfolioData ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useCombinedPortfolioAnalytics(filters?: AnalyticsFilters): UseCombinedAnalyticsReturn {
  // Format dates to ISO strings for the API
  const formatDate = (date: Date | null | undefined): string | undefined => {
    return date ? date.toISOString().split('T')[0] : undefined;
  };

  const {
    data: combinedData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['combinedPortfolioAnalytics', filters],
    queryFn: () =>
      analyticsService.getCombinedPortfolioAnalytics({
        periodType: filters?.periodType,
        customStartDate: formatDate(filters?.customStartDate),
        customEndDate: formatDate(filters?.customEndDate),
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    combinedData: combinedData ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useDailyPnLTrades(filters?: AnalyticsFilters): UseDailyPnLTradesReturn {
  // Format dates to ISO strings for the API
  const formatDate = (date: Date | null | undefined): string | undefined => {
    return date ? date.toISOString().split('T')[0] : undefined;
  };

  const {
    data: dailyData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dailyPnLTrades', filters],
    queryFn: () =>
      analyticsService.getDailyPnLTrades({
        periodType: filters?.periodType,
        customStartDate: formatDate(filters?.customStartDate),
        customEndDate: formatDate(filters?.customEndDate),
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    dailyData: dailyData ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useTickerProfitSummary(filters?: AnalyticsFilters): UseTickerProfitSummaryReturn {
  // Format dates to ISO strings for the API
  const formatDate = (date: Date | null | undefined): string | undefined => {
    return date ? date.toISOString().split('T')[0] : undefined;
  };

  const {
    data: tickerData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['tickerProfitSummary', filters],
    queryFn: () =>
      analyticsService.getTickerProfitSummary({
        periodType: filters?.periodType,
        customStartDate: formatDate(filters?.customStartDate),
        customEndDate: formatDate(filters?.customEndDate),
      }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    tickerData: tickerData ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// Individual metric hooks for granular usage
export function useStockWinRate(filters?: AnalyticsFilters) {
  const {
    data: winRate,
    isLoading,
    error,
    refetch,
  } = useQuery<number>({
    queryKey: ['stockWinRate', filters],
    queryFn: () => analyticsService.getStockWinRate({
      periodType: filters?.periodType,
      customStartDate: filters?.customStartDate?.toISOString().split('T')[0],
      customEndDate: filters?.customEndDate?.toISOString().split('T')[0],
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    winRate: winRate ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useOptionWinRate(filters?: AnalyticsFilters) {
  const {
    data: winRate,
    isLoading,
    error,
    refetch,
  } = useQuery<number>({
    queryKey: ['optionWinRate', filters],
    queryFn: () => analyticsService.getOptionWinRate({
      periodType: filters?.periodType,
      customStartDate: filters?.customStartDate?.toISOString().split('T')[0],
      customEndDate: filters?.customEndDate?.toISOString().split('T')[0],
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    winRate: winRate ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// Advanced metric hooks
export function useStockProfitFactor(filters?: AnalyticsFilters) {
  const {
    data: profitFactor,
    isLoading,
    error,
    refetch,
  } = useQuery<number>({
    queryKey: ['stockProfitFactor', filters],
    queryFn: () => analyticsService.getStockProfitFactor({
      periodType: filters?.periodType,
      customStartDate: filters?.customStartDate?.toISOString().split('T')[0],
      customEndDate: filters?.customEndDate?.toISOString().split('T')[0],
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    profitFactor: profitFactor ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useStockBiggestWinner(filters?: AnalyticsFilters) {
  const {
    data: biggestWinner,
    isLoading,
    error,
    refetch,
  } = useQuery<number>({
    queryKey: ['stockBiggestWinner', filters],
    queryFn: () => analyticsService.getStockBiggestWinner({
      periodType: filters?.periodType,
      customStartDate: filters?.customStartDate?.toISOString().split('T')[0],
      customEndDate: filters?.customEndDate?.toISOString().split('T')[0],
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    biggestWinner: biggestWinner ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useStockBiggestLoser(filters?: AnalyticsFilters) {
  const {
    data: biggestLoser,
    isLoading,
    error,
    refetch,
  } = useQuery<number>({
    queryKey: ['stockBiggestLoser', filters],
    queryFn: () => analyticsService.getStockBiggestLoser({
      periodType: filters?.periodType,
      customStartDate: filters?.customStartDate?.toISOString().split('T')[0],
      customEndDate: filters?.customEndDate?.toISOString().split('T')[0],
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    biggestLoser: biggestLoser ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// Convenience hooks for summary data
export function useStockSummary(periodType: PeriodType) {
  const {
    data: stockSummary,
    isLoading,
    error,
    refetch,
  } = useQuery<StockAnalytics>({
    queryKey: ['stockSummary', periodType],
    queryFn: () => analyticsService.getStockSummary(periodType),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    stockSummary: stockSummary ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useOptionSummary(periodType: PeriodType) {
  const {
    data: optionSummary,
    isLoading,
    error,
    refetch,
  } = useQuery<OptionAnalytics>({
    queryKey: ['optionSummary', periodType],
    queryFn: () => analyticsService.getOptionSummary(periodType),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    optionSummary: optionSummary ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useCombinedPortfolioSummary(periodType: PeriodType) {
  const {
    data: combinedSummary,
    isLoading,
    error,
    refetch,
  } = useQuery<CombinedAnalytics>({
    queryKey: ['combinedPortfolioSummary', periodType],
    queryFn: () => analyticsService.getCombinedPortfolioSummary(periodType),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    combinedSummary: combinedSummary ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// New individual metric hooks for the new analytics
export function useStockAveragePositionSize(filters?: AnalyticsFilters) {
  const {
    data: averagePositionSize,
    isLoading,
    error,
    refetch,
  } = useQuery<number>({
    queryKey: ['stockAveragePositionSize', filters],
    queryFn: () => analyticsService.getStockAveragePositionSize({
      periodType: filters?.periodType,
      customStartDate: filters?.customStartDate?.toISOString().split('T')[0],
      customEndDate: filters?.customEndDate?.toISOString().split('T')[0],
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    averagePositionSize: averagePositionSize ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useStockAverageRiskPerTrade(filters?: AnalyticsFilters) {
  const {
    data: averageRiskPerTrade,
    isLoading,
    error,
    refetch,
  } = useQuery<number>({
    queryKey: ['stockAverageRiskPerTrade', filters],
    queryFn: () => analyticsService.getStockAverageRiskPerTrade({
      periodType: filters?.periodType,
      customStartDate: filters?.customStartDate?.toISOString().split('T')[0],
      customEndDate: filters?.customEndDate?.toISOString().split('T')[0],
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    averageRiskPerTrade: averageRiskPerTrade ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useStockLossRate(filters?: AnalyticsFilters) {
  const {
    data: lossRate,
    isLoading,
    error,
    refetch,
  } = useQuery<number>({
    queryKey: ['stockLossRate', filters],
    queryFn: () => analyticsService.getStockLossRate({
      periodType: filters?.periodType,
      customStartDate: filters?.customStartDate?.toISOString().split('T')[0],
      customEndDate: filters?.customEndDate?.toISOString().split('T')[0],
    }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    lossRate: lossRate ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
