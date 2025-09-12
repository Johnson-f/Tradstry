"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGainers, useLosers, useActives } from '@/lib/hooks/use-market-data';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import type { MarketMover } from '@/lib/types/market-data';

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
  const isPositive = (stock.changePercent ?? 0) >= 0;
  
  return (
    <div className="flex items-center justify-between p-3 hover:bg-muted/50 rounded-lg transition-colors">
      <div className="flex items-center gap-3 flex-1">
        <span className="text-xs text-muted-foreground font-mono w-6 text-center">
          {rank}
        </span>
        
        <div className="flex items-center gap-2">
          {stock.logo && (
            <img 
              src={stock.logo} 
              alt={`${stock.symbol} logo`} 
              className="w-6 h-6 rounded-full"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div>
            <div className="font-semibold text-sm">{stock.symbol}</div>
            <div className="text-xs text-muted-foreground truncate max-w-[120px]">
              {stock.name}
            </div>
          </div>
        </div>
      </div>
      
      <div className="text-right">
        <div className="font-semibold text-sm">{formatPrice(stock.price ?? 0)}</div>
        <div className="text-xs font-medium text-muted-foreground">
          {formatChange(stock.change ?? 0)}
        </div>
      </div>
      
      <div className="text-right ml-3">
        <div className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {formatPercentChange(stock.changePercent ?? 0)}
        </div>
      </div>
      
      <div className="text-right ml-4 min-w-[50px]">
        <div className="text-xs text-muted-foreground">Vol</div>
        <div className="text-xs font-medium">{formatVolume(stock.volume ?? 0)}</div>
      </div>
    </div>
  );
};

// Loading skeleton
const StockItemSkeleton: React.FC = () => (
  <div className="flex items-center justify-between p-3">
    <div className="flex items-center gap-3 flex-1">
      <Skeleton className="w-6 h-4" />
      <Skeleton className="w-6 h-6 rounded-full" />
      <div className="space-y-1">
        <Skeleton className="w-12 h-4" />
        <Skeleton className="w-20 h-3" />
      </div>
    </div>
    <div className="text-right space-y-1">
      <Skeleton className="w-16 h-4" />
      <Skeleton className="w-12 h-3" />
    </div>
    <div className="text-right ml-4 space-y-1">
      <Skeleton className="w-8 h-3" />
      <Skeleton className="w-10 h-3" />
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
      <div className="space-y-1">
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
  
  const { gainers, isLoading: gainersLoading, error: gainersError } = useGainers(25);
  const { losers, isLoading: losersLoading, error: losersError } = useLosers(25);
  const { actives, isLoading: activesLoading, error: activesError } = useActives(25);

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
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Market Movers</CardTitle>
          <Badge variant="outline" className="text-xs">
            Auto-refresh: 30s
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="gainers" className="flex items-center gap-2">
              <TrendingUp className="w-3 h-3" />
              <span>Gainers</span>
            </TabsTrigger>
            <TabsTrigger value="losers" className="flex items-center gap-2">
              <TrendingDown className="w-3 h-3" />
              <span>Losers</span>
            </TabsTrigger>
            <TabsTrigger value="actives" className="flex items-center gap-2">
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