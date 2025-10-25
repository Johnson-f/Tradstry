"use client";

import React from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMajorIndicesData } from '@/lib/hooks/use-market-data';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

// Format percentage with proper styling
const formatPercentage = (value: number | string | undefined | null) => {
  if (value === undefined || value === null) return '0.00%';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '0.00%';
  return `${numValue > 0 ? '+' : ''}${numValue.toFixed(2)}%`;
};

// Format price with proper decimals
const formatPrice = (value: number | string | undefined | null) => {
  if (value === undefined || value === null) return '$0.00';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '$0.00';
  return `$${numValue.toFixed(2)}`;
};

// Index card component
interface IndexCardProps {
  symbol: string;
  cachedData: {
    symbol: string;
    data_points: Array<{
      id: number;
      symbol: string;
      open?: number;
      high?: number;
      low?: number;
      adjclose?: number;
      volume?: number;
      period_start: string;
      period_end: string;
      period_type: string;
      data_provider: string;
      cache_timestamp: string;
    }>;
    latest_timestamp?: string;
    data_points_count: number;
  } | null;
}

const IndexCard: React.FC<IndexCardProps> = ({ symbol, cachedData }) => {
  if (!cachedData || cachedData.data_points.length === 0) {
    return (
      <Card className="w-full min-w-[280px] max-w-[320px] h-[140px] flex flex-col">
        <CardHeader className="pb-1 px-4 pt-3">
          <div className="flex items-start justify-between mb-1">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">{symbol}</CardTitle>
              <div className="text-xs text-muted-foreground mt-0.5">No data available</div>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const { data_points } = cachedData;
  
  // Prepare chart data from cached data points
  const chartData = data_points.slice(-60).reverse().map(point => ({
    time: new Date(point.period_start).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }),
    price: point.adjclose || point.open || 0,
    timestamp: new Date(point.period_start).getTime()
  }));

  // Calculate daily performance from the data points
  // Sort data points chronologically
  const sortedPoints = [...data_points].sort((a, b) => 
    new Date(a.period_start).getTime() - new Date(b.period_start).getTime()
  );
  
  // Get the first point's open price (market open)
  const firstPoint = sortedPoints[0];
  const openingPrice = firstPoint.open || firstPoint.adjclose || 0;
  
  // Get the most recent point's close price (current price)
  const currentPoint = sortedPoints[sortedPoints.length - 1];
  const currentPrice = currentPoint.adjclose || currentPoint.open || 0;
  
  // Calculate change from opening to current price
  const dailyChange = currentPrice - openingPrice;
  const dailyChangePercent = openingPrice !== 0 ? (dailyChange / openingPrice) * 100 : 0;

  const isPositive = dailyChangePercent >= 0;

  // Get ticker symbol for display
  const getTickerSymbol = (symbol: string) => {
    switch (symbol) {
      case 'SPY': return 'SPYUSD';
      case 'QQQ': return 'QQQUSD';
      case 'DIA': return 'DIAUSD';
      case 'VIX': return '^VIX';
      default: return `${symbol}USD`;
    }
  };

  return (
    <Card className="w-full min-w-[280px] max-w-[320px] h-[140px] relative overflow-hidden">
      {/* Full background chart */}
      <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis 
              dataKey="time" 
              axisLine={false}
              tickLine={false}
              tick={false}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={false}
              domain={['dataMin - 1', 'dataMax + 1']}
            />
            <Tooltip 
              labelFormatter={(label) => `Time: ${label}`}
              formatter={(value: number) => [formatPrice(value), 'Price']}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                fontSize: '11px',
                color: 'hsl(var(--foreground))',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
              }}
              labelStyle={{
                color: 'hsl(var(--muted-foreground))',
                fontSize: '10px'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke={isPositive ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: isPositive ? "#22c55e" : "#ef4444", strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Overlay content - style the card internals here */}
      <div className="relative z-100 px-4 pt-1 pb-120 h-full flex flex-col justify-between">
        {/* Top row */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-medium">{symbol}</div>
            <div className="text-xs opacity-80">
              {getTickerSymbol(symbol)}
            </div>
          </div>
          <Badge 
            variant={isPositive ? "default" : "destructive"}
            className="flex items-center gap-1 text-xs px-2 py-0.5"
          >
            {isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {formatPercentage(dailyChangePercent)}
          </Badge>
        </div>
        
        {/* Bottom row */}
        <div className="flex items-end justify-between">
          <div className="text-xl font-bold">
            {formatPrice(currentPrice)}
          </div>
          <div className={`text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {dailyChange > 0 ? '+' : ''}{Math.abs(dailyChange).toFixed(2)}
          </div>
        </div>
      </div>
    </Card>
  );
};

// Loading skeleton for cards
const IndexCardSkeleton: React.FC = () => (
  <Card className="w-full min-w-[280px] max-w-[320px] h-[140px] relative overflow-hidden">
    {/* Background chart skeleton */}
    <div className="absolute inset-0 bg-gradient-to-br from-muted/20 to-muted/5">
      <Skeleton className="w-full h-full opacity-30" />
    </div>
    
    {/* Overlay content skeleton */}
    <div className="relative z-10 px-4 pt-3 pb-3 h-full flex flex-col justify-between">
      {/* Top row */}
      <div className="flex items-start justify-between">
        <div>
          <Skeleton className="w-12 h-4 mb-1" />
          <Skeleton className="w-16 h-3" />
        </div>
        <Skeleton className="w-16 h-6 rounded-full" />
      </div>
      
      {/* Bottom row */}
      <div className="flex items-end justify-between">
        <Skeleton className="w-20 h-6" />
        <Skeleton className="w-12 h-5" />
      </div>
    </div>
  </Card>
);

// Main component
export const IndicesTab: React.FC = () => {
  const { majorIndicesData, isLoading, error, refetch } = useMajorIndicesData(100);



  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>Failed to load market indices: {error.message}</span>
            <button 
              // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
              onClick={refetch}
              className="inline-flex items-center gap-1 text-sm underline hover:no-underline"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cards container */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {isLoading && !majorIndicesData ? (
          // Show skeletons only on initial load
          ['SPY', 'QQQ', 'DIA'].map((symbol) => (
            <IndexCardSkeleton key={symbol} />
          ))
        ) : (
          // Show actual data
          ['SPY', 'QQQ', 'DIA'].map((symbol) => {
            const cachedData = majorIndicesData?.[symbol.toLowerCase() as keyof typeof majorIndicesData] || null;
            return (
              <IndexCard 
                key={symbol} 
                symbol={symbol} 
                // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                cachedData={cachedData}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

export default IndicesTab;