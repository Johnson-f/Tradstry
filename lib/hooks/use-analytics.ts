import useSWR from 'swr';
import { analyticsService, PortfolioAnalytics } from '@/lib/services/analytics-service';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes

// Fetcher function for SWR
const fetcher = async <T>(fn: () => Promise<{ data?: T; error?: { message: string } }>): Promise<T> => {
  const response = await fn();
  if (response.error) {
    throw new Error(response.error.message || 'Failed to fetch data');
  }
  return response.data as T;
};

export function usePortfolioAnalytics() {
  const { data, error, isLoading, mutate } = useSWR<PortfolioAnalytics>(
    'portfolioAnalytics',
    () => fetcher(analyticsService.getPortfolioAnalytics),
    {
      dedupingInterval: STALE_TIME,
      revalidateOnFocus: false,
    }
  );

  return {
    data,
    error,
    isLoading,
    refetch: () => mutate(),
  };
}

async function fetchStockAnalytics() {
  const [
    winRate,
    avgGain,
    avgLoss,
    riskReward,
    expectancy,
    netPnl,
  ] = await Promise.all([
    analyticsService.getStockWinRate(),
    analyticsService.getStockAverageGain(),
    analyticsService.getStockAverageLoss(),
    analyticsService.getStockRiskRewardRatio(),
    analyticsService.getStockTradeExpectancy(),
    analyticsService.getStockNetPnl(),
  ]);

  // Check for errors
  const errors = [winRate, avgGain, avgLoss, riskReward, expectancy, netPnl]
    .filter(res => res.error)
    .map(res => res.error?.message);
  
  if (errors.length > 0) {
    throw new Error(`Failed to fetch stock analytics: ${errors.join(', ')}`);
  }

  return {
    winRate: winRate.data || 0,
    averageGain: avgGain.data || 0,
    averageLoss: avgLoss.data || 0,
    riskRewardRatio: riskReward.data || 0,
    tradeExpectancy: expectancy.data || 0,
    netPnl: netPnl.data || 0,
  };
}

export function useStockAnalytics() {
  const { data, error, isLoading, mutate } = useSWR(
    'stockAnalytics',
    fetchStockAnalytics,
    {
      dedupingInterval: STALE_TIME,
      revalidateOnFocus: false,
    }
  );

  return {
    ...data,
    error,
    isLoading,
    refetch: () => mutate(),
  };
}

async function fetchOptionAnalytics() {
  const [
    winRate,
    avgGain,
    avgLoss,
    riskReward,
    expectancy,
    netPnl,
  ] = await Promise.all([
    analyticsService.getOptionWinRate(),
    analyticsService.getOptionAverageGain(),
    analyticsService.getOptionAverageLoss(),
    analyticsService.getOptionRiskRewardRatio(),
    analyticsService.getOptionTradeExpectancy(),
    analyticsService.getOptionNetPnl(),
  ]);

  // Check for errors
  const errors = [winRate, avgGain, avgLoss, riskReward, expectancy, netPnl]
    .filter(res => res.error)
    .map(res => res.error?.message);
  
  if (errors.length > 0) {
    throw new Error(`Failed to fetch option analytics: ${errors.join(', ')}`);
  }

  return {
    winRate: winRate.data || 0,
    averageGain: avgGain.data || 0,
    averageLoss: avgLoss.data || 0,
    riskRewardRatio: riskReward.data || 0,
    tradeExpectancy: expectancy.data || 0,
    netPnl: netPnl.data || 0,
  };
}

export function useOptionAnalytics() {
  const { data, error, isLoading, mutate } = useSWR(
    'optionAnalytics',
    fetchOptionAnalytics,
    {
      dedupingInterval: STALE_TIME,
      revalidateOnFocus: false,
    }
  );

  return {
    ...data,
    error,
    isLoading,
    refetch: () => mutate(),
  };
}

export function useAnalytics() {
  const { data: portfolio, error: portfolioError, isLoading: portfolioLoading, refetch: refetchPortfolio } = usePortfolioAnalytics();
  const { data: stocks, error: stocksError, isLoading: stocksLoading, refetch: refetchStocks } = useStockAnalytics();
  const { data: options, error: optionsError, isLoading: optionsLoading, refetch: refetchOptions } = useOptionAnalytics();

  const isLoading = portfolioLoading || stocksLoading || optionsLoading;
  const error = portfolioError || stocksError || optionsError;

  return {
    portfolio,
    stocks,
    options,
    isLoading,
    error,
    refetch: () => {
      refetchPortfolio();
      refetchStocks();
      refetchOptions();
    },
  };
}
