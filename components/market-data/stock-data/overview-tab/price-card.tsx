"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useCompanyInfo, useStockQuotes } from '@/lib/hooks/use-market-data';
import { TrendingUp, TrendingDown, Sun, Moon, Clock } from 'lucide-react';

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

const formatPercentChange = (percent: number | undefined | null): string => {
  if (!percent || isNaN(percent)) return '0.00%';
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(2)}%`;
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
interface ExtendedHoursPriceProps {
  symbol: string;
  session: MarketSession;
  sessionLabel: string;
}

const ExtendedHoursPrice: React.FC<ExtendedHoursPriceProps> = ({ 
  symbol, 
  session, 
  sessionLabel 
}) => {
  // In a real implementation, you'd have separate hooks for pre-market and after-hours data
  // For now, we'll simulate with the regular stock quote data
  const { stockQuote, isLoading } = useStockQuotes(symbol);
  
  if (isLoading || !stockQuote) {
    return (
      <Card className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="w-4 h-4 rounded-full" />
              <Skeleton className="w-20 h-4" />
            </div>
            <Skeleton className="w-16 h-6" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Simulate extended hours pricing (in reality, this would come from a different API endpoint)
  const extendedPrice = stockQuote.current_price ? stockQuote.current_price * (1 + (Math.random() - 0.5) * 0.02) : 0;
  const extendedChange = extendedPrice - (stockQuote.current_price || 0);
  const extendedChangePercent = stockQuote.current_price ? (extendedChange / stockQuote.current_price) * 100 : 0;

  const isPositive = extendedChangePercent >= 0;

  return (
    <Card className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SessionIcon session={session} />
            <span className="text-sm font-medium text-muted-foreground">
              {sessionLabel}
            </span>
          </div>
          
          <div className="text-right">
            <div className="text-lg font-bold text-foreground">
              {formatPrice(extendedPrice)}
            </div>
            <div className={`text-xs font-medium flex items-center gap-1 ${
              isPositive 
                ? 'text-green-600 dark:text-green-400' 
                : 'text-red-600 dark:text-red-400'
            }`}>
              {isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              <span>{formatChange(extendedChange)}</span>
              <span>({formatPercentChange(extendedChangePercent)})</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Main price card skeleton
const PriceCardSkeleton: React.FC = () => (
  <Card className="w-full">
    <CardContent className="p-6">
      <div className="space-y-4">
        <Skeleton className="w-32 h-8" />
        <div className="flex items-center gap-3">
          <Skeleton className="w-24 h-6" />
          <Skeleton className="w-16 h-5" />
        </div>
        <Skeleton className="w-48 h-4" />
      </div>
    </CardContent>
  </Card>
);

export const PriceCard: React.FC<PriceCardProps> = ({ 
  symbol, 
  dataProvider 
}) => {
  const [marketHours, setMarketHours] = useState<MarketHours>(getMarketHours());
  
  const { companyInfo } = useCompanyInfo(symbol, dataProvider);
  const { stockQuote, isLoading, error } = useStockQuotes(symbol, undefined, dataProvider);

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
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load price data: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return <PriceCardSkeleton />;
  }

  if (!stockQuote) {
    return (
      <Alert>
        <AlertDescription>
          No price data available for {symbol}
        </AlertDescription>
      </Alert>
    );
  }

  const currentPrice = stockQuote.current_price || 0;
  const priceChange = stockQuote.price_change || 0;
  const priceChangePercent = stockQuote.price_change_percent || 0;
  const isPositive = priceChangePercent >= 0;

  return (
    <div className="space-y-4">
      {/* Main Price Card */}
      <Card className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800">
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Price Display */}
            <div className="space-y-2">
              <div className="text-3xl font-bold text-foreground">
                {formatPrice(currentPrice)}
              </div>
              
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1 text-lg font-semibold ${
                  isPositive 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {isPositive ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  <span>{formatChange(priceChange)}</span>
                </div>
                
                <div className={`text-lg font-semibold ${
                  isPositive 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatPercentChange(priceChangePercent)}
                </div>
              </div>
            </div>
            
            {/* Timestamp and Session Info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <SessionIcon session={marketHours.session} />
                <span>{formatTimestamp(stockQuote.quote_timestamp)}</span>
              </div>
              
              <Badge 
                variant={marketHours.session === 'market-hours' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {marketHours.sessionLabel}
              </Badge>
            </div>

            {/* Additional Quote Info */}
            {(stockQuote.high_price || stockQuote.low_price || stockQuote.volume) && (
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                {stockQuote.high_price && (
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">High</div>
                    <div className="text-sm font-medium">{formatPrice(stockQuote.high_price)}</div>
                  </div>
                )}
                {stockQuote.low_price && (
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Low</div>
                    <div className="text-sm font-medium">{formatPrice(stockQuote.low_price)}</div>
                  </div>
                )}
                {stockQuote.volume && (
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground">Volume</div>
                    <div className="text-sm font-medium">
                      {stockQuote.volume.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Extended Hours Card - Shows horizontally aligned */}
      {showExtendedHours && (
        <ExtendedHoursPrice
          symbol={symbol}
          session={marketHours.session}
          sessionLabel={marketHours.sessionLabel}
        />
      )}
    </div>
  );
};

export default PriceCard;