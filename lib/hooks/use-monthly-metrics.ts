import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/lib/services/analytics-service';
import { MonthlyTradingMetrics } from '@/lib/types/analytics';

interface UseMonthlyMetricsReturn {
  monthlyData: MonthlyTradingMetrics | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useMonthlyMetrics(): UseMonthlyMetricsReturn {
  const {
    data: monthlyData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['monthlyTradingMetrics'],
    queryFn: () => analyticsService.getMonthlyMetrics(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    monthlyData: monthlyData?.[0] ?? null, // Take the first (and only) month's data
    isLoading,
    error: error as Error | null,
    refetch: async () => {
      await refetch();
    },
  };
}
