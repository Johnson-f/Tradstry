"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Filter } from 'lucide-react';
import { useWatchlistsWithPrices, useWatchlistByIdWithPrices } from '@/lib/hooks/use-market-data';
import { cn } from '@/lib/utils';
import type { WatchlistItemWithPrices } from '@/lib/types/market-data';
import { WatchlistModal } from './watchlist-modal';
import { useSymbolNavigation } from '@/lib/hooks/use-symbol-navigation';

// Convert price from backend (string or number) to number for calculations
const parsePrice = (price: string | number | undefined | null): number => {
  if (typeof price === 'number') return isNaN(price) ? 0 : price;
  if (typeof price === 'string') return parseFloat(price) || 0;
  return 0;
};

// Format functions
const formatPrice = (value: number | undefined | null): string => {
  const numValue = typeof value === 'number' && !isNaN(value) ? value : 0;
  return numValue.toFixed(2);
};

// Stock item component
interface StockItemProps {
  item: WatchlistItemWithPrices;
  isTopPick?: boolean;
  onClick?: () => void;
}

const StockItem: React.FC<StockItemProps> = ({ item, isTopPick = false, onClick }) => {
  // Parse percent_change string to number
  const percentChangeStr = item.percent_change?.toString() ?? '0';
  const percentChange = parseFloat(percentChangeStr.replace('%', '')) || 0;
  const isPositive = percentChange >= 0;
  
  // Parse price
  const priceValue = parsePrice(item.price);
  
  return (
    <div 
      onClick={onClick}
      className={cn(
        "flex items-center justify-between py-3 px-4 transition-colors cursor-pointer",
        isTopPick 
          ? "hover:bg-gray-100 dark:hover:bg-gray-800/80 border-b border-gray-200 dark:border-gray-800" 
          : "hover:bg-gray-100 dark:hover:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800/50 last:border-b-0"
      )}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Logo/Icon */}
        <div className={cn(
          "rounded-lg flex items-center justify-center flex-shrink-0",
          isTopPick ? "w-12 h-12 bg-red-500" : "w-10 h-10 bg-gray-200 dark:bg-gray-800"
        )}>
          {item.logo ? (
            <img 
              src={item.logo} 
              alt={`${item.symbol} logo`} 
              className="w-full h-full rounded-lg object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <span className={cn(
              "font-bold",
              isTopPick ? "text-white text-lg" : "text-gray-600 dark:text-gray-400 text-sm"
            )}>
              {item.symbol.slice(0, 1)}
            </span>
          )}
        </div>
        
        <div className="min-w-0 flex-1">
          <div className={cn(
            "font-semibold truncate",
            isTopPick ? "text-gray-900 dark:text-white text-base" : "text-gray-900 dark:text-gray-200 text-sm"
          )}>
            {item.company_name || item.symbol}
          </div>
          <div className={cn(
            "text-gray-500 dark:text-gray-400 truncate",
            isTopPick ? "text-sm" : "text-xs"
          )}>
            {item.symbol} · NASDAQ
          </div>
        </div>
      </div>
      
      <div className="text-right flex-shrink-0 ml-4">
        <div className={cn(
          "font-semibold text-gray-900 dark:text-gray-200",
          isTopPick ? "text-base" : "text-sm"
        )}>
          ${formatPrice(priceValue)}
        </div>
        <div className={cn(
          "font-medium",
          isPositive ? "text-green-600 dark:text-cyan-400" : "text-red-600 dark:text-red-400",
          isTopPick ? "text-sm" : "text-xs"
        )}>
          {isPositive ? '+' : ''}{percentChange.toFixed(2)}%
        </div>
      </div>
    </div>
  );
};

// Loading skeleton
const StockItemSkeleton: React.FC<{ isTopPick?: boolean }> = ({ isTopPick = false }) => (
  <div className={cn(
    "flex items-center justify-between py-3 px-4 border-b border-gray-200 dark:border-gray-800",
    isTopPick ? "" : "last:border-b-0"
  )}>
    <div className="flex items-center gap-3 flex-1">
      <Skeleton className={cn(
        "rounded-lg",
        isTopPick ? "w-12 h-12" : "w-10 h-10"
      )} />
      <div className="space-y-2">
        <Skeleton className={cn(isTopPick ? "w-24 h-4" : "w-20 h-3")} />
        <Skeleton className={cn(isTopPick ? "w-28 h-3" : "w-24 h-3")} />
      </div>
    </div>
    <div className="text-right space-y-2">
      <Skeleton className={cn(isTopPick ? "w-20 h-4" : "w-16 h-3")} />
      <Skeleton className={cn(isTopPick ? "w-16 h-3" : "w-12 h-3")} />
    </div>
  </div>
);

// Main component
export const WatchlistCard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('gainers');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { navigateToSymbol } = useSymbolNavigation();
  
  // Get all watchlists (we'll use the first one for now)
  const { watchlistsWithPrices: watchlists, isLoading: watchlistsLoading } = useWatchlistsWithPrices();
  
  // Get first watchlist's items
  const firstWatchlistId = watchlists[0]?.id || 0;
  const { watchlistWithPrices: watchlist, isLoading: watchlistLoading } = useWatchlistByIdWithPrices(firstWatchlistId);
  
  const isLoading = watchlistsLoading || watchlistLoading;
  const items = watchlist?.items || [];
  
  const handleStockClick = (symbol: string) => {
    navigateToSymbol(symbol);
  };
  
  // Sort items based on active tab
  const sortedItems = [...items].sort((a, b) => {
    const aChange = parseFloat(a.percent_change?.toString().replace('%', '') || '0');
    const bChange = parseFloat(b.percent_change?.toString().replace('%', '') || '0');
    
    if (activeTab === 'gainers') {
      return bChange - aChange; // Highest to lowest
    } else if (activeTab === 'losers') {
      return aChange - bChange; // Lowest to highest
    } else {
      // Active - sort by volume or price
      const aPrice = parsePrice(a.price);
      const bPrice = parsePrice(b.price);
      return bPrice - aPrice;
    }
  });
  
  // Filter based on tab
  const filteredItems = sortedItems.filter((item) => {
    const change = parseFloat(item.percent_change?.toString().replace('%', '') || '0');
    if (activeTab === 'gainers') return change > 0;
    if (activeTab === 'losers') return change < 0;
    return true; // Active shows all
  });
  
  // Top 2 picks (shown above tabs)
  const topPicks = sortedItems.slice(0, 2);
  
  // Remaining items for tabs
  const tabItems = filteredItems.slice(0, 10);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Watchlist</h2>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Filter className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
      </div>
      
      <Card className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
        <CardContent className="p-0">
          {/* Top Picks Section */}
          <div className="border-b border-gray-200 dark:border-gray-800 last:border-b-0">
            {isLoading ? (
              <>
                <StockItemSkeleton isTopPick />
                <StockItemSkeleton isTopPick />
              </>
            ) : topPicks.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="text-sm">No watchlist items yet.</p>
                <p className="text-xs mt-1">Add symbols to your watchlist to get started.</p>
              </div>
            ) : (
              topPicks.map((item) => (
                <StockItem 
                  key={item.id} 
                  item={item} 
                  isTopPick 
                  onClick={() => handleStockClick(item.symbol)}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Watchlist Modal */}
      <WatchlistModal open={isModalOpen} onOpenChange={setIsModalOpen} />
    </div>
  );
};

export default WatchlistCard;
