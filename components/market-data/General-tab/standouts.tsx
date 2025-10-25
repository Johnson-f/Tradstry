"use client";

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { useSignificantPriceMovements, useSymbolHistoricalData } from '@/lib/hooks/use-market-data';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { PriceMovement } from '@/lib/types/market-data';

// Format functions
const formatPrice = (value: number | string | null | undefined) => {
  const numValue = typeof value === 'string' ? parseFloat(value) : (value || 0);
  if (isNaN(numValue)) return '$0.00';
  return `$${numValue.toFixed(2)}`;
};

const formatPercentage = (value: number | string | null | undefined) => {
  const numValue = typeof value === 'string' ? parseFloat(value) : (value || 0);
  if (isNaN(numValue)) return '0.00%';
  const sign = numValue >= 0 ? '+' : '';
  return `${sign}${numValue.toFixed(2)}%`;
};

const formatVolume = (volume: number | string | null | undefined) => {
  const numVolume = typeof volume === 'string' ? parseFloat(volume) : (volume || 0);
  if (isNaN(numVolume)) return '0';
  
  if (numVolume >= 1000000000) {
    return `${(numVolume / 1000000000).toFixed(1)}B`;
  } else if (numVolume >= 1000000) {
    return `${(numVolume / 1000000).toFixed(1)}M`;
  } else if (numVolume >= 1000) {
    return `${(numVolume / 1000).toFixed(1)}K`;
  }
  return numVolume.toString();
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
  const chartData = (historicalData || []).map(point => ({
     // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    time: formatTime(point.timestamp),
    price: point.close,
     // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    timestamp: point.timestamp
  }));

  // Get price range for Y-axis - with fallbacks for empty data
  const prices = chartData.map(d => d.price).filter(price => price != null && !isNaN(price));
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 100;
  const priceRange = maxPrice - minPrice;
  const padding = priceRange > 0 ? priceRange * 0.1 : 10; // 10% padding or fallback

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

        {/* Chart and Metrics Side by Side */}
        <div className="flex gap-6 mb-4">
          {/* Chart - Left Side */}
          <div className="flex-1 h-[200px]">
            {chartLoading ? (
              <div className="h-full flex items-center justify-center">
                <Skeleton className="w-full h-full bg-gray-700" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData.length > 0 ? chartData : []}>
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
                    domain={chartData.length > 0 ? [minPrice - padding, maxPrice + padding] : [0, 100]}
                    tickFormatter={(value) => value.toFixed(2)}
                  />
                  <Tooltip 
                    labelFormatter={(label) => `Time: ${label}`}
                    formatter={(value: number) => [formatPrice(value), 'Price']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'hsl(var(--foreground))',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                    }}
                    labelStyle={{
                      color: 'hsl(var(--muted-foreground))',
                      fontSize: '11px'
                    }}
                  />
                  {chartData.length > 0 && (
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke={isNegative ? "#EF4444" : "#22C55E"}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: isNegative ? "#EF4444" : "#22C55E", strokeWidth: 0 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
            {!chartLoading && chartData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
                No chart data available
              </div>
            )}
          </div>

          {/* Metrics - Right Side */}
          <div className="w-48 space-y-4 flex flex-col justify-center">
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Volume</span>
              <span className="font-medium text-sm">{formatVolume(movement.volume || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Market Cap</span>
              {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
              <span className="font-medium text-sm">{formatMarketCap(movement.market_cap)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">P/E Ratio</span>
              <span className="font-medium text-sm">N/A</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400 text-sm">Dividend Yield</span>
              <span className="font-medium text-sm">N/A</span>
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

  // Deduplicate price movements by symbol to prevent duplicate cards
  const uniquePriceMovements = React.useMemo(() => {
    const seen = new Set<string>();
    return priceMovements.filter(movement => {
      if (seen.has(movement.symbol)) {
        return false;
      }
      seen.add(movement.symbol);
      return true;
    });
  }, [priceMovements]);

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Standouts</h2>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load standouts: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Standouts</h2>
          
        </div>
        <Badge variant="outline" className="text-xs">
          Min 5% movement
        </Badge>
      </div>

      <div className="space-y-6">
        {isLoading ? (
          // Show skeletons during loading
          Array.from({ length: 4 }).map((_, index) => (
            <StandoutCardSkeleton key={index} />
          ))
        ) : uniquePriceMovements.length === 0 ? (
          // No standouts available
          <div className="col-span-full">
            <Card className="bg-gray-900 border-gray-700">
              <CardContent className="p-12 text-center text-gray-400">
                <p>No significant market movements found today.</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          // Render standout cards with separators
          uniquePriceMovements.map((movement, index) => (
            <React.Fragment key={`${movement.symbol}-${index}`}>
              <StandoutCard movement={movement} />
              {index < uniquePriceMovements.length - 1 && (
                <Separator className="my-4" />
              )}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
};

export default Standouts;