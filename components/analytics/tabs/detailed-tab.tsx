"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "@/lib/services/analytics-service";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { CombinedAnalytics, AnalyticsQuery, AnalyticsFilters } from "@/lib/types/analytics";
import { format } from 'date-fns';

interface MetricCardProps {
  title: string;
  value: string | number;
  description?: string;
  isPositive?: boolean;
  isLoading?: boolean;
}

const MetricCard = ({ title, value, description, isPositive, isLoading }: MetricCardProps) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium text-gray-500">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className={`text-2xl font-bold ${
          isPositive === true ? 'text-green-600' : isPositive === false ? 'text-red-600' : 'text-foreground'
        }`}>
          {value}
        </div>
      )}
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
    </CardContent>
  </Card>
);

interface DetailedTabProps {
  filters?: AnalyticsFilters;
}

export function DetailedTab({ filters }: DetailedTabProps) {
  // Test mode - set to true to use mock data for testing UI
  const TEST_MODE = false;
  
  const mockData: CombinedAnalytics = {
    netPnl: 15420.50,
    winRate: 0.675,
    profitFactor: 2.34,
    averageGain: 480.25,
    averageLoss: -205.80,
    riskRewardRatio: 2.33,
    biggestWinner: 2850.00,
    biggestLoser: -890.50,
    avgHoldTimeWinners: 5.2,
    avgHoldTimeLosers: 3.8,
    tradeExpectancy: 186.75,
    periodInfo: {
      periodType: '30d'
    }
  };

  // Convert filters to API query parameters
  const getApiQueryParams = (): AnalyticsQuery => {
    if (!filters) {
      return { periodType: '30d' };
    }

    const params: AnalyticsQuery = {
      periodType: filters.periodType || '30d'
    };

    // Add custom date range if provided
    if (filters.customStartDate && filters.customEndDate) {
      params.customStartDate = format(filters.customStartDate, 'yyyy-MM-dd');
      params.customEndDate = format(filters.customEndDate, 'yyyy-MM-dd');
    }

    return params;
  };

  const apiParams = getApiQueryParams();

  const { data, isLoading, error, refetch } = useQuery<CombinedAnalytics, Error>({
    queryKey: ['combinedPortfolioAnalytics', apiParams],
    queryFn: async () => {
      console.log('[DetailedTab] Starting API call with params:', apiParams);
      
      if (TEST_MODE) {
        console.log('[DetailedTab] Using mock data (TEST_MODE enabled)');
        return mockData;
      }
      
      try {
        const result = await analyticsService.getCombinedPortfolioAnalytics(apiParams);
        console.log('[DetailedTab] API response:', result);
        return result;
      } catch (err) {
        console.error('[DetailedTab] API error:', err);
        throw err;
      }
    },
    retry: 1, // Reduce retries for faster debugging
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    enabled: true, // Always enabled for testing
    onError: (error: any) => {
      console.error('[DetailedTab] Query error:', error);
    },
    onSuccess: (data) => {
      console.log('[DetailedTab] Query success:', data);
    }
  });

  // Add debugging logs
  console.log('[DetailedTab] Current state:', { 
    data, 
    isLoading, 
    error, 
    filters, 
    apiParams 
  });

  // Handle snake_case to camelCase conversion from API
  const apiData = data as any; // Cast to any to access snake_case properties
  
  const metrics = [
    {
      title: 'Net P&L',
      value: apiData?.net_pnl !== undefined ? formatCurrency(apiData.net_pnl) : 'N/A',
      isPositive: apiData?.net_pnl ? apiData.net_pnl >= 0 : undefined,
      description: 'Total profit/loss for the period'
    },
    {
      title: 'Win Rate',
      value: apiData?.win_rate !== undefined ? `${apiData.win_rate.toFixed(1)}%` : 'N/A',
      description: 'Percentage of winning trades'
    },
    {
      title: 'Profit Factor',
      value: apiData?.profit_factor !== undefined ? apiData.profit_factor.toFixed(2) : 'N/A',
      description: 'Gross profit / Gross loss',
      isPositive: apiData?.profit_factor ? apiData.profit_factor >= 1.5 : undefined
    },
    {
      title: 'Avg. Gain',
      value: apiData?.average_gain !== undefined ? formatCurrency(apiData.average_gain) : 'N/A',
      description: 'Average profit of winning trades'
    },
    {
      title: 'Avg. Loss',
      value: apiData?.average_loss !== undefined ? formatCurrency(apiData.average_loss) : 'N/A',
      description: 'Average loss of losing trades'
    },
    {
      title: 'Risk/Reward',
      value: apiData?.risk_reward_ratio !== undefined ? apiData.risk_reward_ratio.toFixed(2) : 'N/A',
      description: 'Average reward per unit of risk'
    },
    {
      title: 'Biggest Winner',
      value: apiData?.biggest_winner !== undefined ? formatCurrency(apiData.biggest_winner) : 'N/A',
      isPositive: true,
      description: 'Largest winning trade'
    },
    {
      title: 'Biggest Loser',
      value: apiData?.biggest_loser !== undefined ? formatCurrency(apiData.biggest_loser) : 'N/A',
      isPositive: false,
      description: 'Largest losing trade'
    },
    {
      title: 'Avg. Hold (Winners)',
      value: apiData?.avg_hold_time_winners ? `${apiData.avg_hold_time_winners.toFixed(1)} days` : 'N/A',
      description: 'Average holding period for winners'
    },
    {
      title: 'Avg. Hold (Losers)',
      value: apiData?.avg_hold_time_losers ? `${apiData.avg_hold_time_losers.toFixed(1)} days` : 'N/A',
      description: 'Average holding period for losers'
    },
    {
      title: 'Trade Expectancy',
      value: apiData?.trade_expectancy !== undefined ? formatCurrency(apiData.trade_expectancy) : 'N/A',
      isPositive: apiData?.trade_expectancy ? apiData.trade_expectancy >= 0 : undefined,
      description: 'Expected value per trade'
    }
  ];

  if (error) {
    const errorMessage = (error as any)?.message || 'Unknown error occurred';
    const isAuthError = errorMessage.includes('Authorization') || errorMessage.includes('401');
    
    return (
      <div className="p-4">
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-red-800">
              {isAuthError ? 'Authentication Required' : 'Error Loading Data'}
            </h3>
          </div>
          <div className="text-sm text-red-700 mb-3">
            {isAuthError 
              ? 'Please make sure you are logged in to view analytics data.'
              : `Error: ${errorMessage}`
            }
          </div>
          <Button 
            onClick={() => refetch()} 
            variant="outline" 
            size="sm"
            className="text-red-700 border-red-200 hover:bg-red-100"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Performance Metrics</h2>
        <p className="text-sm text-muted-foreground">
          Detailed analytics for your combined portfolio performance
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.title}
            title={metric.title}
            value={metric.value}
            description={metric.description}
            isPositive={metric.isPositive}
            isLoading={isLoading}
          />
        ))}
      </div>
    </div>
  );
}
