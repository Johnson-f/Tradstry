"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMarketIndices } from '@/lib/hooks/use-market-data';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Clock, RefreshCw } from 'lucide-react';

// Format timestamp for chart display
const formatTime = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
};

// Format percentage with proper styling
const formatPercentage = (value: number | undefined) => {
  if (value === undefined || value === null) return '0.00%';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
};

// Format price with proper decimals
const formatPrice = (value: number | undefined) => {
  if (value === undefined || value === null) return '$0.00';
  return `$${value.toFixed(2)}`;
};

// Index card component
interface IndexCardProps {
  symbol: string;
  data: {
    historical: Array<{ timestamp: number; close: number; open: number; high: number; low: number; volume: number }>;
    quote: {
      symbol: string;
      name: string;
      price: number;
      change: number;
      changePercent: number;
      dayHigh: number;
      dayLow: number;
      volume: number;
      logo?: string;
    } | null;
    lastUpdated: number;
  };
}

const IndexCard: React.FC<IndexCardProps> = ({ symbol, data }) => {
  const { historical, quote } = data;
  
  // Prepare chart data
  const chartData = historical.slice(-60).map(point => ({
    time: formatTime(point.timestamp),
    price: point.close,
    timestamp: point.timestamp
  }));

  const isPositive = (quote?.changePercent || 0) >= 0;
  const currentPrice = quote?.price || (historical[historical.length - 1]?.close || 0);
  const change = quote?.change || 0;
  const changePercent = quote?.changePercent || 0;

  return (
    <Card className="w-full min-w-[300px] h-[280px] flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {quote?.logo && (
              <img 
                src={quote.logo} 
                alt={`${symbol} logo`} 
                className="w-6 h-6 rounded-full"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <CardTitle className="text-lg font-semibold">{symbol}</CardTitle>
          </div>
          <Badge 
            variant={isPositive ? "default" : "destructive"}
            className="flex items-center gap-1"
          >
            {isPositive ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {formatPercentage(changePercent)}
          </Badge>
        </div>
        <div className="space-y-1">
          <div className="text-2xl font-bold">{formatPrice(currentPrice)}</div>
          <div className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {change > 0 ? '+' : ''}{formatPrice(change)}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 pt-0">
        <div className="h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis 
                dataKey="time" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10 }}
                domain={['dataMin - 1', 'dataMax + 1']}
              />
              <Tooltip 
                labelFormatter={(label) => `Time: ${label}`}
                formatter={(value: number) => [formatPrice(value), 'Price']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke={isPositive ? "#22c55e" : "#ef4444"}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Additional metrics */}
        <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
          <div>High: {formatPrice(quote?.dayHigh)}</div>
          <div>Low: {formatPrice(quote?.dayLow)}</div>
        </div>
      </CardContent>
    </Card>
  );
};

// Loading skeleton for cards
const IndexCardSkeleton: React.FC = () => (
  <Card className="w-full min-w-[300px] h-[280px] flex flex-col">
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="w-6 h-6 rounded-full" />
          <Skeleton className="w-12 h-5" />
        </div>
        <Skeleton className="w-16 h-6 rounded-full" />
      </div>
      <div className="space-y-1">
        <Skeleton className="w-24 h-8" />
        <Skeleton className="w-16 h-5" />
      </div>
    </CardHeader>
    <CardContent className="flex-1 pt-0">
      <Skeleton className="w-full h-[120px] rounded" />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Skeleton className="w-16 h-4" />
        <Skeleton className="w-16 h-4" />
      </div>
    </CardContent>
  </Card>
);

// Main component
export const IndicesTab: React.FC = () => {
  const { indicesData, isLoading, error, refetch, lastUpdated } = useMarketIndices();

  const formatLastUpdated = (timestamp: number) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>Failed to load market indices: {error.message}</span>
            <button 
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
      {/* Header with last updated info */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Market Indices</h2>
          <p className="text-sm text-muted-foreground">
            Real-time data with 1-minute auto-refresh
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>Last updated: {formatLastUpdated(lastUpdated)}</span>
        </div>
      </div>

      {/* Cards container - horizontal scroll */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {isLoading && Object.keys(indicesData).length === 0 ? (
          // Show skeletons only on initial load
          Array.from({ length: 4 }).map((_, index) => (
            <IndexCardSkeleton key={index} />
          ))
        ) : (
          // Show actual data
          ['SPY', 'QQQ', 'DIA', 'VIX'].map((symbol) => {
            const data = indicesData[symbol];
            return data ? (
              <IndexCard key={symbol} symbol={symbol} data={data} />
            ) : (
              <IndexCardSkeleton key={symbol} />
            );
          })
        )}
      </div>

      {/* Info about auto-refresh */}
      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
        <p className="flex items-center gap-2">
          <RefreshCw className="w-3 h-3" />
          Data automatically refreshes every minute. Charts show the last hour of 1-minute intervals.
        </p>
      </div>
    </div>
  );
};

export default IndicesTab;