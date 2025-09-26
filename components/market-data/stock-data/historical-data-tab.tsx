"use client";

// Historical Data Tab - Updated for new interval-only architecture
// Supports intervals: 5m, 15m, 30m, 1h, 1d, 1wk, 1mo
// Ranges are calculated dynamically on the backend

import React, { useState, useMemo } from 'react';
import { useHistoricalPrices } from '@/lib/hooks/use-market-data';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download } from 'lucide-react';
import { format } from 'date-fns';

// Time range configurations - Updated for new architecture
type TimeRange = '1d' | '5d' | '1mo' | '6mo' | 'ytd' | '1y' | '5y' | 'max';
type TimeInterval = '5m' | '15m' | '30m' | '1h' | '1d' | '1wk' | '1mo'; // NEW: Only supported intervals

interface TimeRangeConfig {
  label: string;
  range: TimeRange;
  availableIntervals: { value: TimeInterval; label: string }[];
  defaultInterval: TimeInterval;
}

const TIME_RANGES: TimeRangeConfig[] = [
  {
    label: '1D',
    range: '1d',
    availableIntervals: [
      { value: '5m', label: '5 minutes' },
      { value: '15m', label: '15 minutes' },
      { value: '30m', label: '30 minutes' },
    ],
    defaultInterval: '5m', // Changed from 1m to 5m
  },
  {
    label: '5D',
    range: '5d',
    availableIntervals: [
      { value: '15m', label: '15 minutes' },
      { value: '30m', label: '30 minutes' },
      { value: '1h', label: '1 hour' },
    ],
    defaultInterval: '15m',
  },
  {
    label: '1M',
    range: '1mo',
    availableIntervals: [
      { value: '1h', label: '1 hour' },
      { value: '1d', label: '1 day' },
    ],
    defaultInterval: '1h', // Removed 4h (not supported)
  },
  {
    label: '6M',
    range: '6mo',
    availableIntervals: [
      { value: '1d', label: '1 day' },
      { value: '1wk', label: '1 week' },
    ],
    defaultInterval: '1d', // Removed 1h for longer ranges
  },
  {
    label: 'YTD',
    range: 'ytd',
    availableIntervals: [
      { value: '1d', label: '1 day' },
      { value: '1wk', label: '1 week' },
    ],
    defaultInterval: '1d',
  },
  {
    label: '1Y',
    range: '1y',
    availableIntervals: [
      { value: '1d', label: '1 day' },
      { value: '1wk', label: '1 week' },
      { value: '1mo', label: '1 month' },
    ],
    defaultInterval: '1d',
  },
  {
    label: '5Y',
    range: '5y',
    availableIntervals: [
      { value: '1wk', label: '1 week' },
      { value: '1mo', label: '1 month' },
    ],
    defaultInterval: '1wk', // Changed from 1d to 1wk for better data coverage
  },
  {
    label: 'MAX',
    range: 'max',
    availableIntervals: [
      { value: '1mo', label: '1 month' },
    ],
    defaultInterval: '1mo',
  },
];

interface HistoricalDataTabProps {
  symbol: string;
  className?: string;
}

export function HistoricalDataTab({ symbol, className = '' }: HistoricalDataTabProps) {
  const [selectedRangeConfig, setSelectedRangeConfig] = useState<TimeRangeConfig>(TIME_RANGES[0]);
  const [selectedInterval, setSelectedInterval] = useState<TimeInterval>(TIME_RANGES[0].defaultInterval);

  const { historicalPrices, isLoading, error } = useHistoricalPrices({
    symbol,
    time_range: selectedRangeConfig.range,
    time_interval: selectedInterval,
    limit: 1000,
  });

  // Handle range change
  const handleRangeChange = (rangeConfig: TimeRangeConfig) => {
    setSelectedRangeConfig(rangeConfig);
    setSelectedInterval(rangeConfig.defaultInterval);
  };

  // Format data for table
  const tableData = useMemo(() => {
    if (!historicalPrices || historicalPrices.length === 0) return [];

    return historicalPrices
      .map((price) => ({
        timestamp: price.timestamp_utc,
        date: new Date(price.timestamp_utc),
        open: Number(price.open) || 0,
        high: Number(price.high) || 0,
        low: Number(price.low) || 0,
        close: Number(price.close || price.adjusted_close) || 0,
        volume: Number(price.volume) || 0,
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime()); // Most recent first
  }, [historicalPrices]);

  // Format date based on interval - Updated for new architecture
  const formatDate = (date: Date): string => {
    switch (selectedInterval) {
      case '5m':
      case '15m':
      case '30m':
        return format(date, 'MMM d, yyyy, hh:mm a');
      case '1h':
        return format(date, 'MMM d, yyyy, hh:mm a');
      case '1d':
        return format(date, 'MMM d, yyyy');
      case '1wk':
      case '1mo':
        return format(date, 'MMM yyyy');
      default:
        return format(date, 'MMM d, yyyy');
    }
  };

  // Format volume
  const formatVolume = (volume: number): string => {
    if (volume >= 1e9) return `${(volume / 1e9).toFixed(1)}B`;
    if (volume >= 1e6) return `${(volume / 1e6).toFixed(1)}M`;
    if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}K`;
    return volume.toLocaleString();
  };

  // Download functionality
  const handleDownload = () => {
    if (!tableData.length) return;

    const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'];
    const csvContent = [
      headers.join(','),
      ...tableData.map(row => [
        formatDate(row.date),
        row.open.toFixed(2),
        row.high.toFixed(2),
        row.low.toFixed(2),
        row.close.toFixed(2),
        row.volume.toString(),
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${symbol}_${selectedRangeConfig.range}_${selectedInterval}_historical_data.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (error) {
    return (
      <Card className={`bg-gray-900 border-gray-800 ${className}`}>
        <CardContent className="p-6">
          <div className="text-center text-red-400">
            Error loading historical data: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-gray-900 border-gray-800 ${className}`}>
      <CardContent className="p-6">
        {/* Controls */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
          {/* Range buttons - with horizontal scroll for mobile */}
          <ScrollArea className="w-full lg:w-auto">
            <div className="flex items-center gap-2 min-w-max pb-2">
              {TIME_RANGES.map((rangeConfig) => (
                <Button
                  key={rangeConfig.range}
                  variant={selectedRangeConfig.range === rangeConfig.range ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleRangeChange(rangeConfig)}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${
                    selectedRangeConfig.range === rangeConfig.range
                      ? 'bg-cyan-600 text-white hover:bg-cyan-700 border-cyan-600'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700 border-gray-600'
                  }`}
                >
                  {rangeConfig.label}
                </Button>
              ))}
            </div>
          </ScrollArea>

          {/* Interval selector and download */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Select value={selectedInterval} onValueChange={(value: TimeInterval) => setSelectedInterval(value)}>
              <SelectTrigger className="w-36 bg-gray-800 border-gray-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {selectedRangeConfig.availableIntervals.map((interval) => (
                  <SelectItem 
                    key={interval.value} 
                    value={interval.value}
                    className="text-white hover:bg-gray-700 focus:bg-gray-700"
                  >
                    {interval.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={!tableData.length}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              Download {selectedRangeConfig.label}
            </Button>
          </div>
        </div>

        {/* Data Table Container with ScrollArea */}
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-6 gap-4 py-3 border-b border-gray-700">
                {['Date', 'Open', 'High', 'Low', 'Close', 'Volume'].map((header) => (
                  <div key={header} className="text-gray-400 text-sm font-medium">
                    {header}
                  </div>
                ))}
              </div>
              {[...Array(10)].map((_, index) => (
                <div key={index} className="grid grid-cols-6 gap-4 py-3 animate-pulse">
                  <div className="h-4 bg-gray-700 rounded"></div>
                  <div className="h-4 bg-gray-700 rounded"></div>
                  <div className="h-4 bg-gray-700 rounded"></div>
                  <div className="h-4 bg-gray-700 rounded"></div>
                  <div className="h-4 bg-gray-700 rounded"></div>
                  <div className="h-4 bg-gray-700 rounded"></div>
                </div>
              ))}
            </div>
          ) : tableData.length > 0 ? (
            <>
              {/* Table Header - Fixed outside ScrollArea */}
              <div className="grid grid-cols-6 gap-4 py-4 px-4 border-b border-gray-700 bg-gray-900 sticky top-0 z-10">
                <div className="text-gray-400 text-sm font-medium">Date</div>
                <div className="text-gray-400 text-sm font-medium text-right">Open</div>
                <div className="text-gray-400 text-sm font-medium text-right">High</div>
                <div className="text-gray-400 text-sm font-medium text-right">Low</div>
                <div className="text-gray-400 text-sm font-medium text-right">Close</div>
                <div className="text-gray-400 text-sm font-medium text-right">Volume</div>
              </div>

              {/* Scrollable Table Body */}
              <ScrollArea className="h-[400px]">
                <div className="px-4">
                  {tableData.map((row, index) => (
                    <div 
                      key={`${row.timestamp}-${index}`} 
                      className="grid grid-cols-6 gap-4 py-3 hover:bg-gray-800/50 transition-colors border-b border-gray-800/50 last:border-b-0"
                    >
                      <div className="text-white text-sm">
                        {formatDate(row.date)}
                      </div>
                      <div className="text-white text-sm text-right">
                        ${row.open.toFixed(2)}
                      </div>
                      <div className="text-white text-sm text-right">
                        ${row.high.toFixed(2)}
                      </div>
                      <div className="text-white text-sm text-right">
                        ${row.low.toFixed(2)}
                      </div>
                      <div className="text-white text-sm text-right">
                        ${row.close.toFixed(2)}
                      </div>
                      <div className="text-white text-sm text-right">
                        {formatVolume(row.volume)}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="text-center text-gray-400 py-8">
              No historical data available for {symbol}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default HistoricalDataTab;