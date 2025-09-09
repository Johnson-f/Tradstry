"use client";

import { SymbolSearch } from '@/components/market-data/symbol-search';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Search, BarChart3 } from 'lucide-react';

export default function MarketPage() {
  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Market</h1>
        </div>
      </div>
      
      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8 space-y-8">
            {/* Search Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Search Stocks
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SymbolSearch 
                  placeholder="Search for stocks, ETFs, indices (e.g., AAPL, TSLA, SPY)..."
                  className="max-w-md"
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Search and select a symbol to view detailed market data and analytics.
                </p>
              </CardContent>
            </Card>

            {/* Quick Access Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    Market Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    View market indices, top movers, and market summaries
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    Earnings Calendar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Track upcoming earnings and company reports
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Search className="w-5 h-5 text-purple-500" />
                    Watchlist
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Monitor your favorite stocks and track their performance
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Instructions */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <h3 className="font-semibold">How to use Market Search:</h3>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li>Type a stock symbol or company name in the search box above</li>
                    <li>Select from the dropdown recommendations</li>
                    <li>Click on a symbol to view detailed market data</li>
                    <li>The system will automatically save new symbols to your database</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}