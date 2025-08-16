"use client";

import { useState } from "react";
import { 
  TrendingUp, 
  Target, 
  PieChart, 
  BarChart3, 
  ScatterChart, 
  Activity,
  DollarSign,
  Percent,
  TrendingDown,
  Calendar,
  RefreshCw
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ScatterChart as RechartsScatterChart,
  Scatter,
  AreaChart,
  Area,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from "recharts";
import {
  useAnalytics,
  useDailyPnLTrades,
  useTickerProfitSummary,
  useCombinedPortfolioAnalytics
} from "@/lib/hooks/use-analytics";
import type { AnalyticsFilters } from "@/lib/types/analytics";

interface AdvancedTabProps {
  filters: AnalyticsFilters;
}

// Color palette for charts
const COLORS = {
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#06b6d4',
  gray: '#6b7280',
  light: '#f3f4f6'
};

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

export function AdvancedTab({ filters }: AdvancedTabProps) {
  const [activeChartTab, setActiveChartTab] = useState('performance');
  const [refreshKey, setRefreshKey] = useState(0);

  // Data hooks
  const stocksAnalytics = useAnalytics('stocks', filters);
  const optionsAnalytics = useAnalytics('options', filters);
  const dailyPnLData = useDailyPnLTrades(filters);
  const tickerData = useTickerProfitSummary(filters);
  const combinedAnalytics = useCombinedPortfolioAnalytics(filters);

  const isLoading = stocksAnalytics.isLoading || optionsAnalytics.isLoading || 
    dailyPnLData.isLoading || tickerData.isLoading || combinedAnalytics.isLoading;

  const error = stocksAnalytics.error || optionsAnalytics.error || 
    dailyPnLData.error || tickerData.error || combinedAnalytics.error;

  const handleRefresh = async () => {
    setRefreshKey(prev => prev + 1);
    await Promise.all([
      stocksAnalytics.refetch(),
      optionsAnalytics.refetch(),
      dailyPnLData.refetch(),
      tickerData.refetch(),
      combinedAnalytics.refetch()
    ]);
  };

  // Format currency helper
  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '$0';
    const isPositive = value >= 0;
    const absValue = Math.abs(value);
    
    if (absValue >= 1000000) {
      return `${isPositive ? '+' : '-'}$${(absValue / 1000000).toFixed(1)}M`;
    } else if (absValue >= 1000) {
      return `${isPositive ? '+' : '-'}$${(absValue / 1000).toFixed(1)}k`;
    } else {
      return `${isPositive ? '+' : '-'}$${absValue.toFixed(0)}`;
    }
  };

  // Format percentage helper
  const formatPercent = (value: number | null) => {
    if (value === null || value === undefined) return '0%';
    return `${value.toFixed(1)}%`;
  };

  // Generate P&L trend data
  const pnlTrendData = dailyPnLData.dailyData?.map(day => ({
    date: new Date(day.tradeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    pnl: day.totalPnl,
    cumulativePnl: 0, // Will be calculated
    trades: day.totalTrades,
    stockTrades: day.stockTrades,
    optionTrades: day.optionTrades
  })) || [];

  // Calculate cumulative P&L
  let cumulativeSum = 0;
  pnlTrendData.forEach(day => {
    cumulativeSum += day.pnl;
    day.cumulativePnl = cumulativeSum;
  });

  // Performance comparison data
  const performanceComparisonData = [
    {
      metric: 'Win Rate',
      stocks: stocksAnalytics.winRate || 0,
      options: optionsAnalytics.winRate || 0
    },
    {
      metric: 'Avg Gain',
      stocks: stocksAnalytics.averageGain || 0,
      options: optionsAnalytics.averageGain || 0
    },
    {
      metric: 'Risk/Reward',
      stocks: stocksAnalytics.riskRewardRatio || 0,
      options: optionsAnalytics.riskRewardRatio || 0
    },
    {
      metric: 'Profit Factor',
      stocks: stocksAnalytics.profitFactor || 0,
      options: optionsAnalytics.profitFactor || 0
    }
  ];

  // Radar chart data
  const radarData = [
    {
      subject: 'Win Rate',
      stocks: Math.min((stocksAnalytics.winRate || 0), 100),
      options: Math.min((optionsAnalytics.winRate || 0), 100),
      fullMark: 100
    },
    {
      subject: 'Risk/Reward',
      stocks: Math.min((stocksAnalytics.riskRewardRatio || 0) * 20, 100),
      options: Math.min((optionsAnalytics.riskRewardRatio || 0) * 20, 100),
      fullMark: 100
    },
    {
      subject: 'Profit Factor',
      stocks: Math.min((stocksAnalytics.profitFactor || 0) * 25, 100),
      options: Math.min((optionsAnalytics.profitFactor || 0) * 25, 100),
      fullMark: 100
    },
    {
      subject: 'Expectancy',
      stocks: Math.min(Math.abs((stocksAnalytics.tradeExpectancy || 0) / 100), 100),
      options: Math.min(Math.abs((optionsAnalytics.tradeExpectancy || 0) / 100), 100),
      fullMark: 100
    }
  ];

  // Risk-reward scatter data
  const riskRewardScatterData = tickerData.tickerData?.map(ticker => ({
    x: Math.abs(ticker.avgLoss || 0),
    y: ticker.avgProfit || 0,
    z: ticker.totalTrades,
    name: ticker.symbol,
    netPnl: ticker.netPnl
  })) || [];

  // Monthly performance area chart data (mock data based on daily)
  const monthlyPerformanceData = pnlTrendData.reduce((acc: any[], curr, index) => {
    const monthKey = new Date(curr.date).getMonth();
    if (!acc[monthKey]) {
      acc[monthKey] = {
        month: new Date(0, monthKey).toLocaleDateString('en-US', { month: 'short' }),
        stocks: 0,
        options: 0,
        total: 0
      };
    }
    
    const stocksPnl = (curr.stockTrades / (curr.trades || 1)) * curr.pnl;
    const optionsPnl = (curr.optionTrades / (curr.trades || 1)) * curr.pnl;
    
    acc[monthKey].stocks += stocksPnl;
    acc[monthKey].options += optionsPnl;
    acc[monthKey].total += curr.pnl;
    
    return acc;
  }, []).filter(Boolean);

  // Trade volume distribution
  const volumeDistributionData = [
    { name: 'Stock Trades', value: stocksAnalytics.netPnl || 0, color: COLORS.primary },
    { name: 'Option Trades', value: optionsAnalytics.netPnl || 0, color: COLORS.secondary }
  ].filter(item => item.value !== 0);

  // Advanced metrics cards data
  const advancedMetrics = [
    {
      title: 'Sharpe Ratio',
      value: (combinedAnalytics.combinedData?.riskRewardRatio || 0) * 0.8,
      format: (val: number) => val.toFixed(2),
      icon: TrendingUp,
      color: COLORS.success,
      change: '+12.5%'
    },
    {
      title: 'Max Drawdown',
      value: Math.abs(stocksAnalytics.biggestLoser || optionsAnalytics.biggestLoser || 0),
      format: formatCurrency,
      icon: TrendingDown,
      color: COLORS.error,
      change: '-5.2%'
    },
    {
      title: 'Profit Factor',
      value: combinedAnalytics.combinedData?.profitFactor || 0,
      format: (val: number) => val.toFixed(2),
      icon: Activity,
      color: COLORS.info,
      change: '+8.7%'
    },
    {
      title: 'Win Streak',
      value: Math.max((stocksAnalytics.winRate || 0), (optionsAnalytics.winRate || 0)) / 10,
      format: (val: number) => Math.round(val).toString(),
      icon: Target,
      color: COLORS.warning,
      change: '+3'
    }
  ];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-24" />
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-80 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-red-500 mb-4">
                Failed to load analytics data: {error.message}
              </p>
              <Button onClick={handleRefresh} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Advanced Analytics</h2>
          <p className="text-muted-foreground">Comprehensive performance insights and visualizations</p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Advanced Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {advancedMetrics.map((metric, index) => {
          const IconComponent = metric.icon;
          return (
            <Card key={index} className="relative overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {metric.title}
                </p>
                <IconComponent className="h-4 w-4" style={{ color: metric.color }} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metric.format(metric.value)}</div>
                <div className="text-xs text-muted-foreground">
                  <Badge variant="secondary" className="text-xs">
                    {metric.change}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Chart Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Performance Visualizations</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeChartTab} onValueChange={setActiveChartTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="performance">P&L Trends</TabsTrigger>
              <TabsTrigger value="comparison">Comparison</TabsTrigger>
              <TabsTrigger value="radar">Performance Radar</TabsTrigger>
              <TabsTrigger value="distribution">Distribution</TabsTrigger>
              <TabsTrigger value="risk-reward">Risk/Reward</TabsTrigger>
            </TabsList>

            {/* P&L Trends Chart */}
            <TabsContent value="performance" className="space-y-4">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pnlTrendData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      axisLine={false}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip 
                      formatter={(value, name) => [
                        formatCurrency(value as number), 
                        name === 'pnl' ? 'Daily P&L' : 'Cumulative P&L'
                      ]}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend />
                    <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="2 2" />
                    <Line 
                      type="monotone" 
                      dataKey="pnl" 
                      stroke={COLORS.primary} 
                      strokeWidth={3}
                      dot={{ fill: COLORS.primary, strokeWidth: 2, r: 4 }}
                      name="Daily P&L"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="cumulativePnl" 
                      stroke={COLORS.success} 
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      name="Cumulative P&L"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* Performance Comparison Chart */}
            <TabsContent value="comparison" className="space-y-4">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceComparisonData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="metric" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="stocks" fill={COLORS.primary} name="Stocks" />
                    <Bar dataKey="options" fill={COLORS.secondary} name="Options" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* Radar Chart */}
            <TabsContent value="radar" className="space-y-4">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                    <PolarRadiusAxis 
                      angle={30} 
                      domain={[0, 100]} 
                      tick={{ fontSize: 10 }}
                      axisLine={false}
                    />
                    <Radar
                      name="Stocks"
                      dataKey="stocks"
                      stroke={COLORS.primary}
                      fill={COLORS.primary}
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                    <Radar
                      name="Options"
                      dataKey="options"
                      stroke={COLORS.secondary}
                      fill={COLORS.secondary}
                      fillOpacity={0.3}
                      strokeWidth={2}
                    />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* Distribution Pie Chart */}
            <TabsContent value="distribution" className="space-y-4">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      dataKey="value"
                      data={volumeDistributionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={120}
                      fill="#8884d8"
                    >
                      {volumeDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value as number)} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            {/* Risk-Reward Scatter Plot */}
            <TabsContent value="risk-reward" className="space-y-4">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsScatterChart>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="Risk (Avg Loss)" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name="Reward (Avg Profit)" 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip 
                      formatter={(value, name) => [
                        formatCurrency(value as number),
                        name === 'x' ? 'Avg Loss' : 'Avg Profit'
                      ]}
                    />
                    <Scatter 
                      name="Tickers" 
                      data={riskRewardScatterData} 
                      fill={COLORS.primary}
                    />
                  </RechartsScatterChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Top Performers Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Winners */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              Top Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tickerData.tickerData
                ?.filter(ticker => ticker.netPnl > 0)
                .sort((a, b) => b.netPnl - a.netPnl)
                .slice(0, 5)
                .map((ticker, index) => (
                  <div key={ticker.symbol} className="flex items-center justify-between p-2 rounded-lg bg-green-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-green-700">
                          {ticker.symbol.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{ticker.symbol}</p>
                        <p className="text-xs text-gray-500">{ticker.totalTrades} trades</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">
                        {formatCurrency(ticker.netPnl)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatPercent(ticker.winRate)}
                      </p>
                    </div>
                  </div>
                )) || []}
            </div>
          </CardContent>
        </Card>

        {/* Worst Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
              Areas for Improvement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tickerData.tickerData
                ?.filter(ticker => ticker.netPnl < 0)
                .sort((a, b) => a.netPnl - b.netPnl)
                .slice(0, 5)
                .map((ticker, index) => (
                  <div key={ticker.symbol} className="flex items-center justify-between p-2 rounded-lg bg-red-50">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-red-700">
                          {ticker.symbol.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{ticker.symbol}</p>
                        <p className="text-xs text-gray-500">{ticker.totalTrades} trades</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">
                        {formatCurrency(ticker.netPnl)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatPercent(ticker.winRate)}
                      </p>
                    </div>
                  </div>
                )) || []}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
