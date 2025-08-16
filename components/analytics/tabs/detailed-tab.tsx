"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { analyticsService } from "@/lib/services/analytics-service";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, PieChart, BarChart3, Calendar } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { CombinedAnalytics, AnalyticsQuery, AnalyticsFilters } from "@/lib/types/analytics";
import { format, subDays } from 'date-fns';
import { 
  BarChart, 
  Bar, 
  Pie, 
  PieChart as RechartsPieChart, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  TooltipProps
} from 'recharts';

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
    },
    // Mock data for visualizations
    pnlDistribution: [
      { range: '> $1000', count: 5 },
      { range: '$500-$1000', count: 8 },
      { range: '$100-$500', count: 15 },
      { range: '$0-$100', count: 20 },
      { range: '-$100-$0', count: 18 },
      { range: '-$500--$100', count: 10 },
      { range: '< -$500', count: 4 }
    ],
    winLossData: [
      { name: 'Wins', value: 67.5, color: '#10b981' },
      { name: 'Losses', value: 32.5, color: '#ef4444' }
    ],
    dailyPerformance: [
      { day: 'Mon', week: '1', value: 1200 },
      { day: 'Tue', week: '1', value: -450 },
      { day: 'Wed', week: '1', value: 780 },
      { day: 'Thu', week: '1', value: -200 },
      { day: 'Fri', week: '1', value: 1500 },
      { day: 'Mon', week: '2', value: 900 },
      { day: 'Tue', week: '2', value: -300 },
      { day: 'Wed', week: '2', value: 1200 },
      { day: 'Thu', week: '2', value: -600 },
      { day: 'Fri', week: '2', value: 2000 },
      { day: 'Mon', week: '3', value: -150 },
      { day: 'Tue', week: '3', value: 800 },
      { day: 'Wed', week: '3', value: -200 },
      { day: 'Thu', week: '3', value: 1100 },
      { day: 'Fri', week: '3', value: 1700 },
      { day: 'Mon', week: '4', value: 600 },
      { day: 'Tue', week: '4', value: -400 },
      { day: 'Wed', week: '4', value: 900 },
      { day: 'Thu', week: '4', value: 1300 },
      { day: 'Fri', week: '4', value: -100 }
    ]
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
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[DetailedTab] Query error:', errorMessage);
    },
    onSuccess: (data) => {
      console.log('[DetailedTab] Query success:', data);
    }
  });

  // Add type-safe debug logging
  const debugState = {
    data: data as CombinedAnalytics | null,
    isLoading,
    error: error ? error.message : null,
    filters,
    apiParams
  };
  console.log('[DetailedTab] Current state:', debugState);

  // Type for the tooltip formatter
  type TooltipFormatter = (value: number | string) => [string, string];
  

  // Define the API response type that includes both snake_case and camelCase properties
  interface ApiData extends CombinedAnalytics {
    // Snake case versions from API
    win_rate?: number;
    average_gain?: number;
    average_loss?: number;
    risk_reward_ratio?: number;
    trade_expectancy?: number;
    net_pnl?: number;
    profit_factor?: number;
    avg_hold_time_winners?: number;
    avg_hold_time_losers?: number;
    biggest_winner?: number;
    biggest_loser?: number;
    
    // Additional visualization data
    pnl_distribution?: Array<{ range: string; count: number }>;
    win_loss_data?: Array<{ name: string; value: number; color: string }>;
    daily_performance?: Array<{ day: string; week: string; value: number }>;
  }
  
  // Safely type the API data with fallbacks to camelCase properties
  const apiData = (data || {}) as ApiData;
  
  // Helper function to safely get values with fallbacks
  const getApiValue = <T,>(value: T | undefined, fallback: T): T => {
    return value !== undefined ? value : fallback;
  };
  
  const metrics = [
    {
      title: 'Net P&L',
      value: formatCurrency(getApiValue(apiData.netPnl || apiData.net_pnl, 0)),
      isPositive: (apiData.netPnl || apiData.net_pnl || 0) >= 0,
      description: 'Total profit/loss for the period'
    },
    {
      title: 'Win Rate',
      value: `${getApiValue(apiData.winRate || apiData.win_rate, 0).toFixed(1)}%`,
      description: 'Percentage of winning trades',
      isPositive: (apiData.winRate || apiData.win_rate || 0) > 50
    },
    {
      title: 'Profit Factor',
      value: getApiValue(apiData.profitFactor || apiData.profit_factor, 0).toFixed(2),
      description: 'Gross profit / Gross loss',
      isPositive: (apiData.profitFactor || apiData.profit_factor || 0) >= 1.5
    },
    {
      title: 'Avg. Gain',
      value: formatCurrency(getApiValue(apiData.averageGain || apiData.average_gain, 0)),
      description: 'Average profit of winning trades',
      isPositive: true
    },
    {
      title: 'Avg. Loss',
      value: formatCurrency(Math.abs(getApiValue(apiData.averageLoss || apiData.average_loss, 0))),
      description: 'Average loss of losing trades',
      isPositive: false
    },
    {
      title: 'Risk/Reward',
      value: getApiValue(apiData.riskRewardRatio || apiData.risk_reward_ratio, 0).toFixed(2),
      description: 'Average reward per unit of risk',
      isPositive: (apiData.riskRewardRatio || apiData.risk_reward_ratio || 0) >= 1
    },
    {
      title: 'Biggest Winner',
      value: formatCurrency(getApiValue(apiData.biggestWinner || apiData.biggest_winner, 0)),
      isPositive: true,
      description: 'Largest winning trade'
    },
    {
      title: 'Biggest Loser',
      value: formatCurrency(Math.abs(getApiValue(apiData.biggestLoser || apiData.biggest_loser, 0))),
      isPositive: false,
      description: 'Largest losing trade'
    },
    {
      title: 'Avg. Hold (Winners)',
      value: `${getApiValue(apiData.avgHoldTimeWinners || apiData.avg_hold_time_winners, 0).toFixed(1)} days`,
      description: 'Average holding period for winners',
      isPositive: true
    },
    {
      title: 'Avg. Hold (Losers)',
      value: `${getApiValue(apiData.avgHoldTimeLosers || apiData.avg_hold_time_losers, 0).toFixed(1)} days`,
      description: 'Average holding period for losers',
      isPositive: false
    },
    {
      title: 'Trade Expectancy',
      value: formatCurrency(getApiValue(apiData.tradeExpectancy || apiData.trade_expectancy, 0)),
      isPositive: (apiData.tradeExpectancy || apiData.trade_expectancy || 0) >= 0,
      description: 'Expected value per trade'
    }
  ];

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
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

  // Custom tooltip for the heatmap
  const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    
    const value = payload[0]?.value || 0;
    const color = value >= 0 ? (value > 1000 ? '#10b981' : '#86efac') : (value < -500 ? '#ef4444' : '#fca5a5');
    
    return (
      <div className="bg-background border rounded-md p-2 text-sm">
        <p className="font-medium">{label}</p>
        <p style={{ color }}>{formatCurrency(Number(value))}</p>
      </div>
    );
  };

  // X-axis labels are handled by the day field in the data

  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Performance Metrics</h2>
        <p className="text-sm text-muted-foreground">
          Detailed analytics for your combined portfolio performance
        </p>
      </div>
      
      {/* Main Metrics Grid */}
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

      {/* Visualization Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        {/* P&L Distribution */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              P&L Distribution
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="h-[300px] pt-4">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={apiData?.pnl_distribution || mockData.pnlDistribution}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => [`${value} trades`, 'Count']}
                    labelFormatter={(label) => `P&L Range: ${label}`}
                  />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Win/Loss Ratio */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Win/Loss Ratio
            </CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="h-[300px] pt-4">
            {isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <div className="flex items-center justify-center h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={apiData?.win_loss_data || mockData.winLossData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {(apiData?.win_loss_data || mockData.winLossData).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={((value: number) => [`${value}%`, 'Percentage']) as TooltipFormatter}
                    />
                    <Legend />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Performance Heatmap */}
      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Daily Performance Heatmap (Last 30 Days)
          </CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="pt-4">
          {isLoading ? (
            <Skeleton className="h-[400px] w-full" />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={apiData?.daily_performance || mockData.dailyPerformance}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="day" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      tickFormatter={(value) => `$${value}`}
                      axisLine={false}
                      tickLine={false}
                      width={60}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar 
                      dataKey="value"
                      radius={[4, 4, 0, 0]}
                    >
                      {(apiData?.daily_performance || mockData.dailyPerformance).map((entry: any, index: number) => {
                        const value = entry.value || 0;
                        const color = value >= 0 
                          ? (value > 1000 ? '#10b981' : '#86efac') 
                          : (value < -500 ? '#ef4444' : '#fca5a5');
                        
                        return <Cell key={`cell-${index}`} fill={color} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
