import { useQuery } from '@tanstack/react-query';
import { analyticsService } from '@/lib/services/analytics-service';
import { DailyPnLTrade } from '@/lib/types/analytics';

interface UseDailyPnLParams {
  periodType?: '7d' | '30d' | '90d' | '1y' | 'all_time' | 'custom';
  customStartDate?: Date;
  customEndDate?: Date;
}

export function useDailyPnL({ 
  periodType = '30d', 
  customStartDate, 
  customEndDate 
}: UseDailyPnLParams = {}) {
  return useQuery<DailyPnLTrade[]>({
    queryKey: ['daily-pnl', periodType, customStartDate, customEndDate],
    queryFn: async () => {
      const params: any = {
        periodType,
      };

      if (periodType === 'custom' && customStartDate && customEndDate) {
        params.customStartDate = customStartDate.toISOString().split('T')[0];
        params.customEndDate = customEndDate.toISOString().split('T')[0];
      }

      return analyticsService.getDailyPnLTrades(params);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}
