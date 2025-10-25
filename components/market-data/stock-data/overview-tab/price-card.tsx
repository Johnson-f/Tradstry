"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';


import { useCompanyInfo, useStockQuotesWithPrices } from '@/lib/hooks/use-market-data';
import { TrendingUp, Sun, Moon, Clock } from 'lucide-react';

interface PriceCardProps {
  symbol: string;
  dataProvider?: string;
}

type MarketSession = 'pre-market' | 'market-hours' | 'after-hours' | 'closed';

interface MarketHours {
  session: MarketSession;
  nextSessionTime?: Date;
  sessionLabel: string;
}

// Market hours detection logic (US Eastern Time)
const getMarketHours = (): MarketHours => {
  const now = new Date();
  const est = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  
  const day = est.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = est.getHours();
  const minute = est.getMinutes();
  const currentTime = hour * 60 + minute; // Convert to minutes since midnight
  
  // Weekend check
  if (day === 0 || day === 6) {
    return {
      session: 'closed',
      sessionLabel: 'Market Closed - Weekend'
    };
  }
  
  // Market times in minutes since midnight (EST)
  const preMarketStart = 4 * 60; // 4:00 AM EST
  const marketOpen = 9 * 60 + 30; // 9:30 AM EST
  const marketClose = 16 * 60; // 4:00 PM EST
  const afterHoursEnd = 20 * 60; // 8:00 PM EST
  
  if (currentTime >= preMarketStart && currentTime < marketOpen) {
    return {
      session: 'pre-market',
      sessionLabel: 'Pre-Market',
      nextSessionTime: new Date(est.getFullYear(), est.getMonth(), est.getDate(), 9, 30)
    };
  } else if (currentTime >= marketOpen && currentTime < marketClose) {
    return {
      session: 'market-hours',
      sessionLabel: 'Market Open',
      nextSessionTime: new Date(est.getFullYear(), est.getMonth(), est.getDate(), 16, 0)
    };
  } else if (currentTime >= marketClose && currentTime < afterHoursEnd) {
    return {
      session: 'after-hours',
      sessionLabel: 'After Hours',
      nextSessionTime: new Date(est.getFullYear(), est.getMonth(), est.getDate() + 1, 4, 0)
    };
  } else {
    return {
      session: 'closed',
      sessionLabel: 'Market Closed'
    };
  }
};

// Format price with proper currency formatting
const formatPrice = (price: number | undefined | null): string => {
  if (!price || isNaN(price)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

// Format change and percentage
const formatChange = (change: number | undefined | null): string => {
  if (!change || isNaN(change)) return '$0.00';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${formatPrice(Math.abs(change)).replace('$', '$')}`;
};

const formatPercentChange = (percent: number | string | undefined | null): string => {
  if (!percent) return '0.00%';
  
  // Convert to number if it's a string
  const numPercent = typeof percent === 'string' ? parseFloat(percent) : percent;
  
  if (isNaN(numPercent)) return '0.00%';
  
  const sign = numPercent >= 0 ? '+' : '';
  return `${sign}${numPercent.toFixed(2)}%`;
};

// Format timestamp
const formatTimestamp = (timestamp: string | undefined): string => {
  if (!timestamp) return '';
  
  try {
    const date = new Date(timestamp);
    const now = new Date();
    
    // Check if it's today
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short'
      });
    } else {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  } catch {
    return timestamp;
  }
};

// Market session icon component
const SessionIcon: React.FC<{ session: MarketSession }> = ({ session }) => {
  switch (session) {
    case 'pre-market':
      return <Sun className="w-4 h-4 text-amber-500" />;
    case 'market-hours':
      return <TrendingUp className="w-4 h-4 text-green-500" />;
    case 'after-hours':
      return <Moon className="w-4 h-4 text-blue-500" />;
    default:
      return <Clock className="w-4 h-4 text-gray-500" />;
  }
};

// Extended hours price card component


// Compact price card skeleton
const PriceCardSkeleton: React.FC = () => (
  <div className="flex gap-4">
    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 px-4 py-3">
      <CardContent className="p-0">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Skeleton className="w-20 h-7" />
            <Skeleton className="w-16 h-4" />
          </div>
          <Skeleton className="w-32 h-3" />
        </div>
      </CardContent>
    </Card>
  </div>
);

export const PriceCard: React.FC<PriceCardProps> = ({ 
  symbol, 
  dataProvider 
}) => {
  const [marketHours, setMarketHours] = useState<MarketHours>(getMarketHours());
  
  useCompanyInfo(symbol, dataProvider);
  const { stockQuoteWithPrices, isLoading, error } = useStockQuotesWithPrices(symbol);

  // Update market hours every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setMarketHours(getMarketHours());
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Calculate if we should show extended hours card
  const showExtendedHours = useMemo(() => {
    return marketHours.session === 'pre-market' || marketHours.session === 'after-hours';
  }, [marketHours.session]);

  if (error) {
    return (
      <div className="text-red-600 dark:text-red-400 text-sm">
        Failed to load price data: {error.message}
      </div>
    );
  }

  if (isLoading) {
    return <PriceCardSkeleton />;
  }

  if (!stockQuoteWithPrices) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-sm">
        No price data available for {symbol}
      </div>
    );
  }

  // Debug: Log the API response
  console.log('Stock Quote Data:', stockQuoteWithPrices);

  // Parse price data (API returns Decimal as string or number)
  const parsePrice = (value: string | number | undefined | null): number => {
    if (typeof value === 'number') return isNaN(value) ? 0 : value;
    if (typeof value === 'string') return parseFloat(value) || 0;
    return 0;
  };

  const currentPrice = parsePrice(stockQuoteWithPrices.price);
  const priceChange = parsePrice(stockQuoteWithPrices.change);
  const priceChangePercent = parsePrice(stockQuoteWithPrices.percent_change);
  const isPositive = priceChangePercent >= 0;

  return (
    <div className="flex gap-4">
      {/* Main Price Card */}
      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 px-4 py-3">
        <CardContent className="p-0">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {formatPrice(currentPrice)}
              </div>
              
              <div className={`flex items-center gap-2 text-sm font-medium ${
                isPositive 
                  ? 'text-green-600 dark:text-cyan-400' 
                  : 'text-red-600 dark:text-red-400'
              }`}>
                <span>{formatChange(priceChange)}</span>
                <span>{isPositive ? '↗' : '↘'} {formatPercentChange(priceChangePercent)}</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <SessionIcon session={marketHours.session} />
              <span>At close: {formatTimestamp(stockQuoteWithPrices.quote_timestamp)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Extended Hours Card */}
      {showExtendedHours && (
        <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 px-4 py-3">
          <CardContent className="p-0">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatPrice(currentPrice * 1.0139)}
                </div>
                
                <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-cyan-400">
                  <span>+${(0.58).toFixed(2)}</span>
                  <span>↗ +1.39%</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <Moon className="w-3 h-3 text-blue-400" />
                <span>After hours: {formatTimestamp(stockQuoteWithPrices.quote_timestamp)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PriceCard;