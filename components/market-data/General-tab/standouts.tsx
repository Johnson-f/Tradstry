"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSignificantPriceMovements, useSymbolHistoricalData } from '@/lib/hooks/use-market-data';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { PriceMovement } from '@/lib/types/market-data';

// Format functions
const formatPrice = (value: number) => {
  return `$${value.toFixed(2)}`;
};

const formatPercentage = (value: number) => {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatVolume = (volume: number) => {
  if (volume >= 1000000000) {
    return `${(volume / 1000000000).toFixed(1)}B`;
  } else if (volume >= 1000000) {
    return `${(volume / 1000000).toFixed(1)}M`;
  } else if (volume >= 1000) {
    return `${(volume / 1000).toFixed(1)}K`;
  }
  return volume.toString();
};

const formatMarketCap = (marketCap?: number) => {
  if (!marketCap) return 'N/A';
  if (marketCap >= 1000000000) {
    return `${(marketCap / 1000000000).toFixed(1)}B`;
  } else if (marketCap >= 1000000) {
    return `${(marketCap / 1000000).toFixed(1)}M`;
  }
  return marketCap.toString();
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  }).toUpperCase();
};

// Single standout card component
interface StandoutCardProps {
  movement: PriceMovement;
}

const StandoutCard: React.FC<StandoutCardProps> = ({ movement }) => {
  const { historicalData, isLoading: chartLoading } = useSymbolHistoricalData(movement.symbol);
  
  const isNegative = (movement.price_change_percent || 0) < 0;
  
  // Prepare chart data
  const chartData = historicalData.map(point => ({
    time: formatTime(point.timestamp),
    price: point.close,
    timestamp: point.timestamp
  }));

  // Get price range for Y-axis
  const prices = chartData.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;
  const padding = priceRange * 0.1; // 10% padding

  return (
    <Card className="bg-gray-900 border-gray-700 text-white">
      <CardContent className="p-6">
        {/* Header with company info */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-sm">
              {movement.symbol.slice(0, 2)}
            </div>
            <div>
              <div className="font-semibold text-lg">{movement.symbol}</div>
              <div className="text-sm text-gray-400">{movement.symbol} • NASDAQ</div>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-bold">
              {formatPrice(movement.close_price || 0)}
            </div>
            <div className={`flex items-center gap-1 text-sm font-medium ${
              isNegative ? 'text-red-400' : 'text-green-400'
            }`}>
              {isNegative ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              {formatPercentage(movement.price_change_percent || 0)}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[200px] mb-6">
          {chartLoading ? (
            <div className="h-full flex items-center justify-center">
              <Skeleton className="w-full h-full bg-gray-700" />
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis 
                  dataKey="time" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: '#9CA3AF' }}
                  domain={[minPrice - padding, maxPrice + padding]}
                  tickFormatter={(value) => value.toFixed(2)}
                />
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke={isNegative ? "#EF4444" : "#22C55E"}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, fill: isNegative ? "#EF4444" : "#22C55E" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              No chart data available
            </div>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-6 mb-4">
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Volume</span>
              <span className="font-medium">{formatVolume(movement.volume || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Market Cap</span>
              <span className="font-medium">N/A</span>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">P/E Ratio</span>
              <span className="font-medium">N/A</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Dividend Yield</span>
              <span className="font-medium">N/A</span>
            </div>
          </div>
        </div>

        {/* News/Description */}
        {movement.news_title && (
          <div className="border-t border-gray-700 pt-4">
            <p className="text-sm text-gray-300 leading-relaxed">
              {movement.news_title}
              {movement.news_url && (
                <a 
                  href={movement.news_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline ml-1"
                >
                  Read more
                </a>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Loading skeleton for standout card
const StandoutCardSkeleton: React.FC = () => (
  <Card className="bg-gray-900 border-gray-700">
    <CardContent className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded bg-gray-700" />
          <div className="space-y-2">
            <Skeleton className="w-20 h-5 bg-gray-700" />
            <Skeleton className="w-24 h-4 bg-gray-700" />
          </div>
        </div>
        <div className="text-right space-y-2">
          <Skeleton className="w-20 h-8 bg-gray-700" />
          <Skeleton className="w-16 h-5 bg-gray-700" />
        </div>
      </div>
      <Skeleton className="w-full h-[200px] mb-6 bg-gray-700" />
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <Skeleton className="w-full h-4 bg-gray-700" />
          <Skeleton className="w-full h-4 bg-gray-700" />
        </div>
        <div className="space-y-3">
          <Skeleton className="w-full h-4 bg-gray-700" />
          <Skeleton className="w-full h-4 bg-gray-700" />
        </div>
      </div>
    </CardContent>
  </Card>
);

// Main component
export const Standouts: React.FC = () => {
  const { 
    priceMovements, 
    isLoading, 
    error 
  } = useSignificantPriceMovements(undefined, 1, 5, 6); // Last 1 day, min 5% change, limit 6

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Market Standouts</h2>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load market standouts: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Market Standouts</h2>
          <p className="text-sm text-muted-foreground">
            Stocks with significant price movements today
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Min 5% movement
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLoading ? (
          // Show skeletons during loading
          Array.from({ length: 4 }).map((_, index) => (
            <StandoutCardSkeleton key={index} />
          ))
        ) : priceMovements.length === 0 ? (
          // No standouts available
          <div className="col-span-full">
            <Card className="bg-gray-900 border-gray-700">
              <CardContent className="p-12 text-center text-gray-400">
                <p>No significant market movements found today.</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          // Render standout cards
          priceMovements.map((movement, index) => (
            <StandoutCard key={`${movement.symbol}-${index}`} movement={movement} />
          ))
        )}
      </div>
    </div>
  );
};

export default Standouts;