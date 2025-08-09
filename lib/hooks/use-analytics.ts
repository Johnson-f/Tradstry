"use client";

import { useQuery } from '@tanstack/react-query';
import { analyticsService, type StockAnalytics, type OptionAnalytics, type PortfolioAnalytics } from "@/lib/services/analytics-service";

export interface UseAnalyticsReturn {
  winRate: number | null;
  averageGain: number | null;
  averageLoss: number | null;
  riskRewardRatio: number | null;
  tradeExpectancy: number | null;
  netPnl: number | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export interface UsePortfolioAnalyticsReturn {
  portfolioData: PortfolioAnalytics | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface AnalyticsFilters {
  periodType?: string;
  customStartDate?: Date | null;
  customEndDate?: Date | null;
}

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

// Individual metric hooks for granular usage
export function useStockWinRate() {
  const {
    data: winRate,
    isLoading,
    error,
    refetch,
  } = useQuery<number>({
    queryKey: ['stockWinRate'],
    queryFn: () => analyticsService.getStockWinRate(),
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

export function useOptionWinRate() {
  const {
    data: winRate,
    isLoading,
    error,
    refetch,
  } = useQuery<number>({
    queryKey: ['optionWinRate'],
    queryFn: () => analyticsService.getOptionWinRate(),
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
