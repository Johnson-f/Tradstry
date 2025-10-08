"use client";

import { SymbolSearch } from '@/components/market-data/symbol-search';
import { TabManager } from '@/components/market-data/tab-manager';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function MarketPage() {
  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Market</h1>
          <div className="flex-1 flex justify-center px-8">
            <SymbolSearch 
              placeholder="Search for stocks, ETFs, indices (e.g., AAPL, TSLA, SPY)..."
              className="max-w-md w-full"
            />
          </div>
          <div className="w-20"></div> {/* Spacer to balance the layout */}
        </div>
      </div>
      
      {/* Main content - Scrollable area with shadcn ScrollArea */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-8">
            <TabManager />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}