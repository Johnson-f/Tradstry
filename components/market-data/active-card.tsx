"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTopGainers, useTopLosers, useMostActive } from '@/lib/hooks/use-market-data';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import type { MarketMover } from '@/lib/types/market-data';
import { useQueryClient } from '@tanstack/react-query';
import { useRealtimeTable } from '@/lib/hooks/useRealtimeUpdates';

// Format functions
const formatPrice = (value: number | undefined | null): string => {
  const numValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  return numValue.toFixed(2);
};

const formatChange = (value: number | undefined | null): string => {
  const numValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  return numValue.toFixed(2);
};

const formatPercentChange = (value: number | undefined | null): string => {
  const numValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  return `${numValue.toFixed(2)}%`;
};

const formatVolume = (volume: number | undefined | null): string => {
  const numValue = typeof volume === 'number' && !isNaN(volume) ? volume : 0;
  if (numValue >= 1000000) {
    return `${(numValue / 1000000).toFixed(1)}M`;
  } else if (numValue >= 1000) {
    return `${(numValue / 1000).toFixed(1)}K`;
  }
  return numValue.toString();
};

// Stock item component
interface StockItemProps {
  stock: MarketMover;
  rank: number;
}

const StockItem: React.FC<StockItemProps> = ({ stock, rank }) => {
  // Use percent_change from backend, fallback to changePercent for compatibility
  const percentChange = stock.percent_change ?? stock.changePercent ?? 0;
  const isPositive = percentChange >= 0;
  
  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {stock.logo && (
            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <img 
                src={stock.logo} 
                alt={`${stock.symbol} logo`} 
                className="w-6 h-6 rounded-full"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              {stock.symbol}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {stock.name}
            </div>
          </div>
        </div>
      </div>
      
      <div className="text-right flex-shrink-0 ml-4">
        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
          ${formatPrice(stock.price ?? 0)}
        </div>
        <div className={`text-xs font-medium ${
          isPositive 
            ? 'text-green-600 dark:text-green-400' 
            : 'text-red-600 dark:text-red-400'
        }`}>
          {isPositive ? '+' : ''}{formatPercentChange(percentChange)}
        </div>
      </div>
    </div>
  );
};

// Loading skeleton
const StockItemSkeleton: React.FC = () => (
  <div className="flex items-center justify-between py-2 px-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
    <div className="flex items-center gap-3 flex-1">
      <Skeleton className="w-8 h-8 rounded-full" />
      <div className="space-y-1">
        <Skeleton className="w-12 h-4" />
        <Skeleton className="w-20 h-3" />
      </div>
    </div>
    <div className="text-right space-y-1">
      <Skeleton className="w-16 h-4" />
      <Skeleton className="w-12 h-3" />
    </div>
  </div>
);

// Tab content component
interface TabContentProps {
  stocks: MarketMover[];
  isLoading: boolean;
  error: Error | null;
  type: 'gainers' | 'losers' | 'actives';
}

const TabContent: React.FC<TabContentProps> = ({ stocks, isLoading, error, type }) => {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Failed to load {type}: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 10 }).map((_, index) => (
          <StockItemSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (stocks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No {type} data available at the moment.</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[400px]">
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {stocks.map((stock, index) => (
          <StockItem key={stock.symbol} stock={stock} rank={index + 1} />
        ))}
      </div>
    </ScrollArea>
  );
};

// Main component
export const ActiveCard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('gainers');
  const queryClient = useQueryClient();
  
  // Enable realtime updates for market data
  useRealtimeTable('market_movers', queryClient, ['top-gainers']);
  useRealtimeTable('market_movers', queryClient, ['top-losers']);
  useRealtimeTable('market_movers', queryClient, ['most-active']);
  
  const { gainers, isLoading: gainersLoading, error: gainersError } = useTopGainers({ limit: 25 });
  const { losers, isLoading: losersLoading, error: losersError } = useTopLosers({ limit: 25 });
  const { mostActive: actives, isLoading: activesLoading, error: activesError } = useMostActive({ limit: 25 });

  // Debug logging
  console.log('DEBUG - Gainers:', { gainers, gainersLoading, gainersError });
  console.log('DEBUG - First gainer object:', gainers[0]);
  console.log('DEBUG - Losers:', { losers, losersLoading, losersError });
  console.log('DEBUG - First loser object:', losers[0]);
  console.log('DEBUG - Actives:', { actives, activesLoading, activesError });
  console.log('DEBUG - First active object:', actives[0]);

  const getTabIcon = (tab: string) => {
    switch (tab) {
      case 'gainers':
        return <TrendingUp className="w-4 h-4" />;
      case 'losers':
        return <TrendingDown className="w-4 h-4" />;
      case 'actives':
        return <Activity className="w-4 h-4" />;
      default:
        return null;
    }
  };

  return (
    <Card className="w-full max-w-4xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
      <CardContent className="p-90">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <TabsTrigger 
              value="gainers" 
              className="flex items-center gap-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-green-600 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-green-400"
            >
              <TrendingUp className="w-3 h-3" />
              <span>Gainers</span>
            </TabsTrigger>
            <TabsTrigger 
              value="losers" 
              className="flex items-center gap-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-red-600 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-red-400"
            >
              <TrendingDown className="w-3 h-3" />
              <span>Losers</span>
            </TabsTrigger>
            <TabsTrigger 
              value="actives" 
              className="flex items-center gap-2 text-xs font-medium data-[state=active]:bg-white data-[state=active]:text-blue-600 dark:data-[state=active]:bg-gray-700 dark:data-[state=active]:text-blue-400"
            >
              <Activity className="w-3 h-3" />
              <span>Active</span>
            </TabsTrigger>
          </TabsList>
          
          <div className="mt-4">
            <TabsContent value="gainers" className="mt-0">
              <TabContent 
                stocks={gainers} 
                isLoading={gainersLoading} 
                error={gainersError}
                type="gainers"
              />
            </TabsContent>
            
            <TabsContent value="losers" className="mt-0">
              <TabContent 
                stocks={losers} 
                isLoading={losersLoading} 
                error={losersError}
                type="losers"
              />
            </TabsContent>
            
            <TabsContent value="actives" className="mt-0">
              <TabContent 
                stocks={actives} 
                isLoading={activesLoading} 
                error={activesError}
                type="actives"
              />
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ActiveCard;