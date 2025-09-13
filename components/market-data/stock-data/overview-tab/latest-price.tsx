"use client";

import React from 'react';
import { useStockQuotes, useCompanyInfo } from '@/lib/hooks/use-market-data';
import { Skeleton } from '@/components/ui/skeleton';

interface StockMetricsProps {
  symbol: string;
  className?: string;
}

interface MetricItemProps {
  label: string;
  value: string | number;
  format?: 'currency' | 'percentage' | 'number' | 'range';
}

const MetricItem = ({ label, value, format = 'number' }: MetricItemProps) => {
  const formatValue = (val: string | number) => {
    if (val === null || val === undefined || val === '') return '—';
    
    switch (format) {
      case 'currency':
        return typeof val === 'number' ? `$${val.toFixed(2)}` : val;
      case 'percentage':
        return typeof val === 'number' ? `${val.toFixed(2)}%` : val;
      case 'number':
        return typeof val === 'number' ? val.toLocaleString() : val;
      case 'range':
        return val;
      default:
        return val;
    }
  };

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium">{formatValue(value)}</span>
    </div>
  );
};

export function StockMetrics({ symbol, className = '' }: StockMetricsProps) {
  const { stockQuote, isLoading: quoteLoading, error: quoteError } = useStockQuotes(symbol);
  const { companyInfo, isLoading: companyLoading } = useCompanyInfo(symbol);

  const isLoading = quoteLoading || companyLoading;

  if (quoteError) {
    return (
      <div className={`text-red-400 text-sm ${className}`}>
        Error loading stock data: {quoteError.message}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`space-y-3 ${className}`}>
        {[...Array(6)].map((_, index) => (
          <div key={index} className="flex items-center justify-between py-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!stockQuote) {
    return (
      <div className={`text-gray-400 text-sm ${className}`}>
        No stock data available for {symbol}
      </div>
    );
  }

  // Calculate derived values
  const dayHigh = Number(stockQuote.high_price) || 0;
  const dayLow = Number(stockQuote.low_price) || 0;
  const dayRange = (typeof dayHigh === 'number' && typeof dayLow === 'number' && !isNaN(dayHigh) && !isNaN(dayLow)) 
    ? `$${dayLow.toFixed(2)} - $${dayHigh.toFixed(2)}` 
    : '—';
  
  const week52High = Number(companyInfo?.week_52_high) || 0;
  const week52Low = Number(companyInfo?.week_52_low) || 0;
  const week52Range = (typeof week52High === 'number' && typeof week52Low === 'number' && !isNaN(week52High) && !isNaN(week52Low))
    ? `$${week52Low.toFixed(2)} - $${week52High.toFixed(2)}` 
    : '—';
  
  const marketCap = companyInfo?.market_cap;
  const formatMarketCap = (cap: number) => {
    if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
    if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
    return `$${cap?.toLocaleString()}`;
  };

  const volume = stockQuote.volume;
  const formatVolume = (vol: number) => {
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
    return vol?.toLocaleString();
  };

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="grid grid-cols-3 gap-x-8">
        {/* Left Column */}
        <div className="space-y-1">
          <MetricItem 
            label="Prev Close" 
            value={stockQuote.previous_close || 0} 
            format="currency" 
          />
          <MetricItem 
            label="Open" 
            value={stockQuote.open_price || 0} 
            format="currency" 
          />
          <MetricItem 
            label="Day Range" 
            value={dayRange} 
            format="range" 
          />
        </div>

        {/* Middle Column */}
        <div className="space-y-1">
          <MetricItem 
            label="52W Range" 
            value={week52Range} 
            format="range" 
          />
          <MetricItem 
            label="P/E Ratio" 
            value={companyInfo?.pe_ratio || '—'} 
            format="number" 
          />
          <MetricItem 
            label="Volume" 
            value={volume ? formatVolume(volume) : '—'} 
            format="range" 
          />
        </div>

        {/* Right Column */}
        <div className="space-y-1">
          <MetricItem 
            label="Market Cap" 
            value={marketCap ? formatMarketCap(marketCap) : '—'} 
            format="range" 
          />
          <MetricItem 
            label="Dividend Yield" 
            value={companyInfo?.dividend_yield || '—'} 
            format="percentage" 
          />
          <MetricItem 
            label="EPS" 
            value={companyInfo?.eps || '—'} 
            format="currency" 
          />
        </div>
      </div>
    </div>
  );
}

export default StockMetrics;