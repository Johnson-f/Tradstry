import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiClient } from '@/lib/services/api-client';

// Types for analytics data
interface DailyPnLTrade {
  trade_date: string;
  total_pnl: number;
  total_trades: number;
  stock_trades: number;
  option_trades: number;
}

interface TickerProfitSummary {
  symbol: string;
  total_profit: number;
  stock_trades: number;
  option_trades: number;
  total_trades: number;
}

// Query key factories
export const analyticsKeys = {
  all: ['analytics'] as const,
  dailyPnL: () => [...analyticsKeys.all, 'daily-pnl'] as const,
  dailyPnLByRange: (params: {
    period_type: string;
    custom_start_date?: string;
    custom_end_date?: string;
  }) => [...analyticsKeys.dailyPnL(), params] as const,
  tickerSummary: () => [...analyticsKeys.all, 'ticker-summary'] as const,
  tickerSummaryByRange: (params: {
    period_type: string;
    custom_start_date?: string;
    custom_end_date?: string;
    limit?: string;
  }) => [...analyticsKeys.tickerSummary(), params] as const,
  // Options analytics
  options: {
    averagePositionSize: (params: any) => [...analyticsKeys.all, 'options', 'average-position-size', params] as const,
    averageRiskPerTrade: (params: any) => [...analyticsKeys.all, 'options', 'average-risk-per-trade', params] as const,
    lossRate: (params: any) => [...analyticsKeys.all, 'options', 'loss-rate', params] as const,
  },
  // Combined analytics
  combined: {
    averagePositionSize: (params: any) => [...analyticsKeys.all, 'combined', 'average-position-size', params] as const,
    averageRiskPerTrade: (params: any) => [...analyticsKeys.all, 'combined', 'average-risk-per-trade', params] as const,
    lossRate: (params: any) => [...analyticsKeys.all, 'combined', 'loss-rate', params] as const,
  },
};

// Daily P&L query hook
export function useDailyPnLTrades(params: {
  period_type: string;
  custom_start_date?: string;
  custom_end_date?: string;
}) {
  return useQuery({
    queryKey: analyticsKeys.dailyPnLByRange(params),
    queryFn: async (): Promise<DailyPnLTrade[]> => {
      console.log('🚀 Fetching daily P&L data:', params);
      const searchParams = new URLSearchParams();
      searchParams.set('period_type', params.period_type);
      
      if (params.custom_start_date) {
        searchParams.set('custom_start_date', params.custom_start_date);
      }
      if (params.custom_end_date) {
        searchParams.set('custom_end_date', params.custom_end_date);
      }

      return apiClient.get<DailyPnLTrade[]>(`/analytics/daily-pnl-trades?${searchParams}`);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
    gcTime: 10 * 60 * 1000, // 10 minutes - cache duration
    refetchOnMount: false, // Don't refetch if data exists
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: false, // Don't refetch on reconnect
    retry: 1, // Only retry once
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    // Enable request deduplication
    structuralSharing: true,
  });
}

// Ticker profit summary query hook
export function useTickerProfitSummary(params: {
  period_type: string;
  custom_start_date?: string;
  custom_end_date?: string;
  limit?: string;
}) {
  return useQuery({
    queryKey: analyticsKeys.tickerSummaryByRange(params),
    queryFn: async (): Promise<TickerProfitSummary[]> => {
      console.log('📊 Fetching ticker summary data:', params);
      const searchParams = new URLSearchParams();
      searchParams.set('period_type', params.period_type);
      
      if (params.custom_start_date) {
        searchParams.set('custom_start_date', params.custom_start_date);
      }
      if (params.custom_end_date) {
        searchParams.set('custom_end_date', params.custom_end_date);
      }
      if (params.limit) {
        searchParams.set('limit', params.limit);
      }

      try {
        const result = await apiClient.get<TickerProfitSummary[]>(`/analytics/ticker-profit-summary?${searchParams}`);
        console.log('✅ Ticker summary API success:', result);
        return result;
      } catch (error) {
        console.error('❌ Ticker summary API error:', error);
        throw error;
      }
    },
    // Simplified config for debugging
    retry: false,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

// Helper hook for weekly P&L data
export function useWeeklyPnLTrades(weekStart: Date) {
  const startDate = new Date(weekStart);
  const endDate = new Date(weekStart);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  return useDailyPnLTrades({
    period_type: 'custom',
    custom_start_date: startDate.toISOString(),
    custom_end_date: endDate.toISOString(),
  });
}

// Helper hook for recent ticker data (last 30 days)
export function useRecentTickerSummary(limit: number = 6) {
  // Use fixed params to prevent infinite re-renders
  const params = useMemo(() => ({
    period_type: 'all_time' as const,
    // Don't include limit for now to debug
  }), []);

  return useTickerProfitSummary(params);
}

// Options Analytics Hooks
export function useOptionAveragePositionSize(params: {
  period_type: string;
  custom_start_date?: string;
  custom_end_date?: string;
}) {
  return useQuery({
    queryKey: analyticsKeys.options.averagePositionSize(params),
    queryFn: async (): Promise<number> => {
      const searchParams = new URLSearchParams();
      searchParams.set('period_type', params.period_type);
      
      if (params.custom_start_date) {
        searchParams.set('custom_start_date', params.custom_start_date);
      }
      if (params.custom_end_date) {
        searchParams.set('custom_end_date', params.custom_end_date);
      }

      return apiClient.get<number>(`/analytics/options/average-position-size?${searchParams}`);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

export function useOptionAverageRiskPerTrade(params: {
  period_type: string;
  custom_start_date?: string;
  custom_end_date?: string;
}) {
  return useQuery({
    queryKey: analyticsKeys.options.averageRiskPerTrade(params),
    queryFn: async (): Promise<number> => {
      const searchParams = new URLSearchParams();
      searchParams.set('period_type', params.period_type);
      
      if (params.custom_start_date) {
        searchParams.set('custom_start_date', params.custom_start_date);
      }
      if (params.custom_end_date) {
        searchParams.set('custom_end_date', params.custom_end_date);
      }

      return apiClient.get<number>(`/analytics/options/average-risk-per-trade?${searchParams}`);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

export function useOptionLossRate(params: {
  period_type: string;
  custom_start_date?: string;
  custom_end_date?: string;
}) {
  return useQuery({
    queryKey: analyticsKeys.options.lossRate(params),
    queryFn: async (): Promise<number> => {
      const searchParams = new URLSearchParams();
      searchParams.set('period_type', params.period_type);
      
      if (params.custom_start_date) {
        searchParams.set('custom_start_date', params.custom_start_date);
      }
      if (params.custom_end_date) {
        searchParams.set('custom_end_date', params.custom_end_date);
      }

      return apiClient.get<number>(`/analytics/options/loss-rate?${searchParams}`);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

// Combined Analytics Hooks
export function useCombinedAveragePositionSize(params: {
  period_type: string;
  custom_start_date?: string;
  custom_end_date?: string;
}) {
  return useQuery({
    queryKey: analyticsKeys.combined.averagePositionSize(params),
    queryFn: async (): Promise<number> => {
      const searchParams = new URLSearchParams();
      searchParams.set('period_type', params.period_type);
      
      if (params.custom_start_date) {
        searchParams.set('custom_start_date', params.custom_start_date);
      }
      if (params.custom_end_date) {
        searchParams.set('custom_end_date', params.custom_end_date);
      }

      return apiClient.get<number>(`/analytics/combined/average-position-size?${searchParams}`);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

export function useCombinedAverageRiskPerTrade(params: {
  period_type: string;
  custom_start_date?: string;
  custom_end_date?: string;
}) {
  return useQuery({
    queryKey: analyticsKeys.combined.averageRiskPerTrade(params),
    queryFn: async (): Promise<number> => {
      const searchParams = new URLSearchParams();
      searchParams.set('period_type', params.period_type);
      
      if (params.custom_start_date) {
        searchParams.set('custom_start_date', params.custom_start_date);
      }
      if (params.custom_end_date) {
        searchParams.set('custom_end_date', params.custom_end_date);
      }

      return apiClient.get<number>(`/analytics/combined/average-risk-per-trade?${searchParams}`);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}

export function useCombinedLossRate(params: {
  period_type: string;
  custom_start_date?: string;
  custom_end_date?: string;
}) {
  return useQuery({
    queryKey: analyticsKeys.combined.lossRate(params),
    queryFn: async (): Promise<number> => {
      const searchParams = new URLSearchParams();
      searchParams.set('period_type', params.period_type);
      
      if (params.custom_start_date) {
        searchParams.set('custom_start_date', params.custom_start_date);
      }
      if (params.custom_end_date) {
        searchParams.set('custom_end_date', params.custom_end_date);
      }

      return apiClient.get<number>(`/analytics/combined/loss-rate?${searchParams}`);
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });
}
