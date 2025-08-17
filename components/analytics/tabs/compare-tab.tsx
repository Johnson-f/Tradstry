"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "@/lib/services/analytics-service";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, TrendingUp, BarChart3 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { PortfolioAnalytics, AnalyticsQuery, AnalyticsFilters, StockAnalytics, OptionAnalytics } from "@/lib/types/analytics";
import { format } from 'date-fns';

interface CompareTabProps {
  filters?: AnalyticsFilters;
}

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

export function CompareTab({ filters }: CompareTabProps) {
  const [activeSubTab, setActiveSubTab] = useState('stocks');

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

  const { data, isLoading, error, refetch } = useQuery<PortfolioAnalytics, Error>({
    queryKey: ['portfolioAnalytics', apiParams],
    queryFn: async () => {
      console.log('[CompareTab] Starting API call with params:', apiParams);
      
      try {
        const result = await analyticsService.getPortfolioAnalytics(apiParams);
        console.log('[CompareTab] API response:', result);
        return result;
      } catch (err) {
        console.error('[CompareTab] API error:', err);
        throw err;
      }
    },
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    enabled: true,
    onError: (error: any) => {
      console.error('[CompareTab] Query error:', error);
    },
    onSuccess: (data) => {
      console.log('[CompareTab] Query success:', data);
    }
  });

  // Add debugging logs
  console.log('[CompareTab] Current state:', { 
    data, 
    isLoading, 
    error, 
    filters, 
    apiParams 
  });

  // Log the raw API response to understand the structure
  console.log('[CompareTab] Raw API response structure:', {
    stocks: data?.stocks,
    options: data?.options
  });

  const stockData = data?.stocks;
  const optionData = data?.options;
  
  // Type guard to check if the data is in snake_case format
  type SnakeCaseData = {
    net_pnl?: number;
    win_rate?: number;
    profit_factor?: number;
    average_gain?: number;
    average_loss?: number;
    risk_reward_ratio?: number;
    biggest_winner?: number;
    biggest_loser?: number;
    avg_hold_time_winners?: number;
    avg_hold_time_losers?: number;
    trade_expectancy?: number;
    average_position_size?: number;
    average_risk_per_trade?: number;
    loss_rate?: number;
  };
  
  const stockApiData = stockData as unknown as SnakeCaseData | undefined;
  const optionApiData = optionData as unknown as SnakeCaseData | undefined;
  
  // Helper function to safely get number values with fallback
  const getNumberValue = (data: any, snakeKey: keyof SnakeCaseData, camelKey: keyof StockAnalytics | keyof OptionAnalytics): number | undefined => {
    const value = data?.[snakeKey] ?? data?.[camelKey];
    return typeof value === 'number' ? value : undefined;
  };
  
  // Helper function to safely format currency values
  const safeFormatCurrency = (value: number | undefined): string => {
    return value !== undefined ? formatCurrency(value) : 'N/A';
  };

  // Create metrics arrays for both stocks and options with proper field mapping and type safety
  const stockMetrics = [
    {
      title: 'Net P&L',
      value: safeFormatCurrency(getNumberValue(stockData, 'net_pnl', 'netPnl')),
      isPositive: getNumberValue(stockData, 'net_pnl', 'netPnl') !== undefined 
        ? (getNumberValue(stockData, 'net_pnl', 'netPnl') as number) >= 0 
        : undefined,
      description: 'Total profit/loss for the period'
    },
    {
      title: 'Win Rate',
      value: (() => {
        const winRate = getNumberValue(stockData, 'win_rate', 'winRate');
        if (winRate === undefined) return 'N/A';
        // If winRate is already a percentage (e.g., 100), use it directly
        // If winRate is a decimal (e.g., 0.65), multiply by 100
        const percentage = winRate > 1 ? winRate : winRate * 100;
        return `${percentage.toFixed(1)}%`;
      })(),
      description: 'Percentage of winning trades'
    },
    {
      title: 'Profit Factor',
      value: (() => {
        const value = getNumberValue(stockData, 'profit_factor', 'profitFactor');
        return value !== undefined ? value.toFixed(2) : 'N/A';
      })(),
      description: 'Gross profit / Gross loss',
      isPositive: (() => {
        const value = getNumberValue(stockData, 'profit_factor', 'profitFactor');
        return value !== undefined ? value >= 1.5 : undefined;
      })()
    },
    {
      title: 'Avg. Gain',
      value: safeFormatCurrency(getNumberValue(stockData, 'average_gain', 'averageGain')),
      description: 'Average profit of winning trades'
    },
    {
      title: 'Avg. Loss',
      value: safeFormatCurrency(getNumberValue(stockData, 'average_loss', 'averageLoss')),
      description: 'Average loss of losing trades'
    },
    {
      title: 'Risk/Reward',
      value: (() => {
        const value = getNumberValue(stockData, 'risk_reward_ratio', 'riskRewardRatio');
        return value !== undefined ? value.toFixed(2) : 'N/A';
      })(),
      description: 'Average reward per unit of risk'
    },
    {
      title: 'Biggest Winner',
      value: safeFormatCurrency(getNumberValue(stockData, 'biggest_winner', 'biggestWinner')),
      isPositive: true,
      description: 'Largest winning trade'
    },
    {
      title: 'Biggest Loser',
      value: safeFormatCurrency(getNumberValue(stockData, 'biggest_loser', 'biggestLoser')),
      isPositive: false,
      description: 'Largest losing trade'
    },
    {
      title: 'Avg. Hold (Winners)',
      value: (() => {
        const value = getNumberValue(stockData, 'avg_hold_time_winners', 'avgHoldTimeWinners');
        return value !== undefined ? `${value.toFixed(1)} days` : 'N/A';
      })(),
      description: 'Average holding period for winners'
    },
    {
      title: 'Avg. Hold (Losers)',
      value: (() => {
        const value = getNumberValue(stockData, 'avg_hold_time_losers', 'avgHoldTimeLosers');
        return value !== undefined ? `${value.toFixed(1)} days` : 'N/A';
      })(),
      description: 'Average holding period for losers'
    },
    {
      title: 'Trade Expectancy',
      value: safeFormatCurrency(getNumberValue(stockData, 'trade_expectancy', 'tradeExpectancy')),
      isPositive: (() => {
        const value = getNumberValue(stockData, 'trade_expectancy', 'tradeExpectancy');
        return value !== undefined ? value >= 0 : undefined;
      })(),
      description: 'Expected value per trade'
    },
    {
      title: 'Avg. Position Size',
      value: safeFormatCurrency(getNumberValue(stockData, 'average_position_size', 'averagePositionSize')),
      description: 'Average size of positions'
    },
    {
      title: 'Avg. Risk per Trade',
      value: safeFormatCurrency(getNumberValue(stockData, 'average_risk_per_trade', 'averageRiskPerTrade')),
      description: 'Average risk amount per trade'
    },
    {
      title: 'Loss Rate',
      value: (() => {
        const lossRate = getNumberValue(stockData, 'loss_rate', 'lossRate');
        if (lossRate === undefined) return 'N/A';
        const percentage = lossRate > 1 ? lossRate : lossRate * 100;
        return `${percentage.toFixed(1)}%`;
      })(),
      isPositive: false,
      description: 'Percentage of losing trades'
    }
  ];

  const optionMetrics = [
    {
      title: 'Net P&L',
      value: safeFormatCurrency(getNumberValue(optionData, 'net_pnl', 'netPnl')),
      isPositive: (() => {
        const value = getNumberValue(optionData, 'net_pnl', 'netPnl');
        return value !== undefined ? value >= 0 : undefined;
      })(),
      description: 'Total profit/loss for the period'
    },
    {
      title: 'Win Rate',
      value: (() => {
        const winRate = getNumberValue(optionData, 'win_rate', 'winRate');
        if (winRate === undefined) return 'N/A';
        // If winRate is already a percentage (e.g., 100), use it directly
        // If winRate is a decimal (e.g., 0.65), multiply by 100
        const percentage = winRate > 1 ? winRate : winRate * 100;
        return `${percentage.toFixed(1)}%`;
      })(),
      description: 'Percentage of winning trades'
    },
    {
      title: 'Profit Factor',
      value: (() => {
        const value = getNumberValue(optionData, 'profit_factor', 'profitFactor');
        return value !== undefined ? value.toFixed(2) : 'N/A';
      })(),
      description: 'Gross profit / Gross loss',
      isPositive: (() => {
        const value = getNumberValue(optionData, 'profit_factor', 'profitFactor');
        return value !== undefined ? value >= 1.5 : undefined;
      })()
    },
    {
      title: 'Avg. Gain',
      value: safeFormatCurrency(getNumberValue(optionData, 'average_gain', 'averageGain')),
      description: 'Average profit of winning trades'
    },
    {
      title: 'Avg. Loss',
      value: safeFormatCurrency(getNumberValue(optionData, 'average_loss', 'averageLoss')),
      description: 'Average loss of losing trades'
    },
    {
      title: 'Risk/Reward',
      value: (() => {
        const value = getNumberValue(optionData, 'risk_reward_ratio', 'riskRewardRatio');
        return value !== undefined ? value.toFixed(2) : 'N/A';
      })(),
      description: 'Average reward per unit of risk'
    },
    {
      title: 'Biggest Winner',
      value: safeFormatCurrency(getNumberValue(optionData, 'biggest_winner', 'biggestWinner')),
      isPositive: true,
      description: 'Largest winning trade'
    },
    {
      title: 'Biggest Loser',
      value: safeFormatCurrency(getNumberValue(optionData, 'biggest_loser', 'biggestLoser')),
      isPositive: false,
      description: 'Largest losing trade'
    },
    {
      title: 'Avg. Hold (Winners)',
      value: (() => {
        const value = getNumberValue(optionData, 'avg_hold_time_winners', 'avgHoldTimeWinners');
        return value !== undefined ? `${value.toFixed(1)} days` : 'N/A';
      })(),
      description: 'Average holding period for winners'
    },
    {
      title: 'Avg. Hold (Losers)',
      value: (() => {
        const value = getNumberValue(optionData, 'avg_hold_time_losers', 'avgHoldTimeLosers');
        return value !== undefined ? `${value.toFixed(1)} days` : 'N/A';
      })(),
      description: 'Average holding period for losers'
    },
    {
      title: 'Trade Expectancy',
      value: safeFormatCurrency(getNumberValue(optionData, 'trade_expectancy', 'tradeExpectancy')),
      isPositive: (() => {
        const value = getNumberValue(optionData, 'trade_expectancy', 'tradeExpectancy');
        return value !== undefined ? value >= 0 : undefined;
      })(),
      description: 'Expected value per trade'
    },
    {
      title: 'Avg. Position Size',
      value: safeFormatCurrency(getNumberValue(optionData, 'average_position_size', 'averagePositionSize')),
      description: 'Average size of positions'
    },
    {
      title: 'Avg. Risk per Trade',
      value: safeFormatCurrency(getNumberValue(optionData, 'average_risk_per_trade', 'averageRiskPerTrade')),
      description: 'Average risk amount per trade'
    },
    {
      title: 'Loss Rate',
      value: (() => {
        const lossRate = getNumberValue(optionData, 'loss_rate', 'lossRate');
        if (lossRate === undefined) return 'N/A';
        const percentage = lossRate > 1 ? lossRate : lossRate * 100;
        return `${percentage.toFixed(1)}%`;
      })(),
      isPositive: false,
      description: 'Percentage of losing trades'
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
        <h2 className="text-2xl font-semibold tracking-tight">Compare Performance</h2>
        <p className="text-sm text-muted-foreground">
          Compare your stock and options trading performance side by side
        </p>
      </div>
      
      {/* Internal Tabs for Stocks vs Options */}
      <Tabs 
        defaultValue="stocks" 
        className="w-full"
        onValueChange={setActiveSubTab}
        value={activeSubTab}
      >
        <TabsList className="grid w-full grid-cols-2 h-10">
          <TabsTrigger value="stocks" className="h-8 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Stocks
          </TabsTrigger>
          <TabsTrigger value="options" className="h-8 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Options
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          <TabsContent value="stocks">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  Stock Trading Performance
                </h3>
                <p className="text-sm text-muted-foreground">
                  Detailed analytics for your stock trading performance
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {stockMetrics.map((metric) => (
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
          </TabsContent>
          
          <TabsContent value="options">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-500" />
                  Options Trading Performance
                </h3>
                <p className="text-sm text-muted-foreground">
                  Detailed analytics for your options trading performance
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {optionMetrics.map((metric) => (
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
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
