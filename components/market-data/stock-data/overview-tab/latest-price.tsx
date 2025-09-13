"use client";

import React from 'react';
import { useSignificantPriceMovements } from '@/lib/hooks/use-market-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Circle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface LatestPriceMovementProps {
  symbol: string;
  className?: string;
}

interface MovementItemProps {
  date: string;
  price: number;
  changePercent: number;
  description?: string;
  isLast?: boolean;
}

const MovementItem = ({ date, price, changePercent, description, isLast = false }: MovementItemProps) => {
  const formatDate = (dateString: string): string => {
    try {
      const date = parseISO(dateString);
      return format(date, 'MMM d');
    } catch {
      return dateString;
    }
  };

  const formatPercentage = (percent: number): string => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  const getPercentageColor = (percent: number): string => {
    return percent >= 0 ? 'text-green-500' : 'text-red-500';
  };

  const getTrendIcon = (percent: number) => {
    return percent >= 0 ? (
      <TrendingUp className="h-4 w-4 text-green-500" />
    ) : (
      <TrendingDown className="h-4 w-4 text-red-500" />
    );
  };

  return (
    <div className="relative flex items-start space-x-4 pb-6">
      {/* Timeline connector */}
      <div className="flex flex-col items-center">
        <Circle className="h-3 w-3 fill-gray-600 text-gray-600" />
        {!isLast && (
          <div className="w-px h-16 bg-gray-700 mt-2" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Date and percentage */}
        <div className="flex items-center space-x-3 mb-2">
          <span className="text-gray-400 text-sm font-medium">
            {formatDate(date)}
          </span>
          <div className="flex items-center space-x-1">
            {getTrendIcon(changePercent)}
            <span className={`text-sm font-semibold ${getPercentageColor(changePercent)}`}>
              {formatPercentage(changePercent)}
            </span>
          </div>
        </div>

        {/* Price */}
        <div className="text-gray-300 text-sm mb-2">
          ${price.toFixed(2)}
        </div>

        {/* Description */}
        {description && (
          <p className="text-gray-400 text-sm leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

export function LatestPriceMovement({ symbol, className = '' }: LatestPriceMovementProps) {
  const { priceMovements, isLoading, error } = useSignificantPriceMovements(
    symbol,
    30, // Look back 30 days
    1.0, // Minimum 1% change
    8    // Limit to 8 movements
  );

  // Generate description based on movement data
  const generateDescription = (movement: any): string => {
    const action = movement.price_change_percent >= 0 ? 'climbed' : 'fell';
    const intensity = Math.abs(movement.price_change_percent) > 10 ? 'dramatically' : 
                     Math.abs(movement.price_change_percent) > 5 ? 'significantly' : '';
    
    if (movement.news_title) {
      return `${symbol} ${action} ${Math.abs(movement.price_change_percent).toFixed(2)}% following ${movement.news_title.toLowerCase()}`;
    }
    
    return `${symbol} ${action} ${intensity} ${Math.abs(movement.price_change_percent).toFixed(2)}% as market conditions influenced trading activity.`.replace('  ', ' ');
  };

  if (error) {
    return (
      <Card className={`bg-gray-900 border-gray-800 ${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg font-semibold">Latest Price Movement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-400 text-sm py-8">
            Error loading price movements: {error.message}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-gray-900 border-gray-800 ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-lg font-semibold">
          Latest Price Movement
        </CardTitle>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-6">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="animate-pulse flex items-start space-x-4">
                <div className="flex flex-col items-center">
                  <div className="h-3 w-3 bg-gray-700 rounded-full" />
                  {index < 3 && <div className="w-px h-16 bg-gray-700 mt-2" />}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center space-x-3">
                    <div className="h-4 bg-gray-700 rounded w-12" />
                    <div className="h-4 bg-gray-700 rounded w-16" />
                  </div>
                  <div className="h-4 bg-gray-700 rounded w-16" />
                  <div className="space-y-1">
                    <div className="h-3 bg-gray-700 rounded w-full" />
                    <div className="h-3 bg-gray-700 rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : priceMovements && priceMovements.length > 0 ? (
          <div className="space-y-2">
            {priceMovements.slice(0, 8).map((movement, index) => (
              <MovementItem
                key={`${movement.symbol}-${movement.movement_date}-${index}`}
                date={movement.movement_date}
                price={movement.close_price || 0}
                changePercent={movement.price_change_percent}
                description={generateDescription(movement)}
                isLast={index === Math.min(priceMovements.length - 1, 7)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8">
            <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-600" />
            <p className="text-sm">No significant price movements found for {symbol}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LatestPriceMovement;