"use client";

import React, { useState, useMemo } from 'react';
import { useHistoricalPrices } from '@/lib/hooks/use-market-data';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';

// Time range configurations
type TimeRange = '1d' | '5d' | '1mo' | '3mo' | '6mo' | 'ytd' | '1y' | '5y' | 'max';
type TimeInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1wk' | '1mo';

interface TimeRangeConfig {
  label: string;
  range: TimeRange;
  interval: TimeInterval;
}

const TIME_RANGES: TimeRangeConfig[] = [
  { label: '1D', range: '1d', interval: '5m' },
  { label: '5D', range: '5d', interval: '15m' },
  { label: '1M', range: '1mo', interval: '1h' },
  { label: '6M', range: '6mo', interval: '1d' },
  { label: 'YTD', range: 'ytd', interval: '1d' },
  { label: '1Y', range: '1y', interval: '1d' },
  { label: '5Y', range: '5y', interval: '1d' },
  { label: 'MAX', range: 'max', interval: '1mo' },
];

interface ChartData {
  timestamp: string;
  price: number;
  volume: number;
  date: Date;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartData;
    value: number;
  }>;
  label?: string;
}

interface PriceChartProps {
  symbol: string;
  className?: string;
}

export function PriceChart({ symbol, className = '' }: PriceChartProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRangeConfig>(TIME_RANGES[0]);

  const { historicalPrices, isLoading, error } = useHistoricalPrices({
    symbol,
    time_range: selectedRange.range,
    time_interval: selectedRange.interval,
    limit: 1000,
  });

  // Transform data for chart
  const chartData: ChartData[] = useMemo(() => {
    if (!historicalPrices || historicalPrices.length === 0) return [];

    return historicalPrices
      .map((price) => ({
        timestamp: price.timestamp_utc,
        price: Number(price.close || price.adjusted_close) || 0,
        volume: Number(price.volume) || 0,
        date: new Date(price.timestamp_utc),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [historicalPrices]);

  // Calculate price change
  const priceChange = useMemo(() => {
    if (chartData.length < 2) return { amount: 0, percentage: 0, isPositive: true };

    const firstPrice = Number(chartData[0]?.price) || 0;
    const lastPrice = Number(chartData[chartData.length - 1]?.price) || 0;
    const amount = lastPrice - firstPrice;
    const percentage = firstPrice > 0 ? (amount / firstPrice) * 100 : 0;

    return {
      amount,
      percentage,
      isPositive: amount >= 0,
    };
  }, [chartData]);

  const currentPrice = Number(chartData[chartData.length - 1]?.price) || 0;
  const previousClose = chartData.length > 1 ? Number(chartData[0]?.price) || 0 : currentPrice;

  // Format time labels based on selected range
  const formatTimeLabel = (timestamp: string) => {
    const date = parseISO(timestamp);
    
    switch (selectedRange.range) {
      case '1d':
        return format(date, 'h:mm a');
      case '5d':
        if (isToday(date)) return format(date, 'h:mm a');
        if (isYesterday(date)) return 'Yesterday';
        return format(date, 'MMM d');
      case '1mo':
      case '3mo':
      case '6mo':
      case 'ytd':
        return format(date, 'MMM d');
      case '1y':
        return format(date, 'MMM yyyy');
      case '5y':
      case 'max':
        return format(date, 'yyyy');
      default:
        return format(date, 'MMM d');
    }
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: TooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-lg">
          <p className="text-gray-300 text-sm">
            {format(data.date, 'MMM d, yyyy h:mm a')}
          </p>
          <p className="text-white font-semibold">
            ${data.price.toFixed(2)}
          </p>
          <p className="text-gray-400 text-sm">
            Volume: {data.volume.toLocaleString()}
          </p>
        </div>
      );
    }
    return null;
  };

  if (error) {
    return (
      <Card className={`bg-gray-900 border-gray-800 ${className}`}>
        <CardContent className="p-6">
          <div className="text-center text-red-400">
            Error loading chart data: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-gray-900 border-gray-800 ${className}`}>
      <CardContent className="p-6">
        {/* Header with price and change */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {priceChange.isPositive ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-500" />
              )}
              <span className="text-2xl font-bold text-white">
                ${currentPrice.toFixed(2)}
              </span>
            </div>
            <div className={`flex items-center space-x-1 ${
              priceChange.isPositive ? 'text-green-500' : 'text-red-500'
            }`}>
              <span className="font-semibold">
                {priceChange.isPositive ? '+' : ''}${priceChange.amount.toFixed(2)}
              </span>
              <span className="font-semibold">
                {priceChange.isPositive ? '+' : ''}{priceChange.percentage.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex items-center space-x-1 bg-gray-800 rounded-lg p-1">
            {TIME_RANGES.map((range) => (
              <Button
                key={range.range}
                variant={selectedRange.range === range.range ? "default" : "ghost"}
                size="sm"
                onClick={() => setSelectedRange(range)}
                className={`px-3 py-1 text-xs font-medium ${
                  selectedRange.range === range.range
                    ? 'bg-cyan-600 text-white hover:bg-cyan-700'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {range.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Previous close reference */}
        {previousClose > 0 && (
          <div className="mb-4 text-sm text-gray-400">
            Prev close: ${previousClose.toFixed(2)}
          </div>
        )}

        {/* Chart */}
        <div className="h-80">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop 
                      offset="5%" 
                      stopColor={priceChange.isPositive ? "#06b6d4" : "#ef4444"} 
                      stopOpacity={0.6}
                    />
                    <stop 
                      offset="95%" 
                      stopColor={priceChange.isPositive ? "#06b6d4" : "#ef4444"} 
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatTimeLabel}
                  stroke="#9ca3af"
                  fontSize={12}
                  axisLine={false}
                  tickLine={false}
                />
                
                <YAxis
                  domain={['dataMin - 1', 'dataMax + 1']}
                  tickFormatter={(value) => `$${value.toFixed(0)}`}
                  stroke="#9ca3af"
                  fontSize={12}
                  axisLine={false}
                  tickLine={false}
                />
                
                <Tooltip content={<CustomTooltip />} />
                
                {/* Previous close reference line */}
                {previousClose > 0 && (
                  <Area
                    type="monotone"
                    dataKey={() => previousClose}
                    stroke="#6b7280"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    fill="none"
                  />
                )}
                
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={priceChange.isPositive ? "#06b6d4" : "#ef4444"}
                  strokeWidth={2}
                  fill="url(#priceGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              No data available
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default PriceChart;