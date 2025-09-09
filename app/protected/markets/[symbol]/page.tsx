"use client";

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { marketDataService } from '@/lib/services/market-data-service';
import type { QuoteData, CompanyInfo, FundamentalData } from '@/lib/types/market-data';

interface StockData {
  quote: QuoteData;
  companyInfo: CompanyInfo | null;
  fundamentals: FundamentalData | null;
}

// Validate if a string is a valid stock symbol
const isValidSymbol = (symbol: string): boolean => {
  if (!symbol || symbol.length === 0) return false;
  // Check if symbol is a number (like "0", "123", etc.)
  if (!isNaN(Number(symbol))) return false;
  // Check if symbol contains only letters, numbers, and common separators
  const symbolRegex = /^[A-Z0-9.-]{1,10}$/;
  return symbolRegex.test(symbol.toUpperCase());
};

export default function StockSymbolPage() {
  const params = useParams();
  const router = useRouter();
  const symbol = (params.symbol as string)?.toUpperCase();
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    
    // Validate symbol before making API calls
    if (!isValidSymbol(symbol)) {
      setError(`Invalid stock symbol: ${symbol}. Please use a valid symbol like AAPL, TSLA, or MSFT.`);
      setIsLoading(false);
      return;
    }

    const fetchStockData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch data from multiple endpoints in parallel
        const [quoteData, companyInfo, fundamentals] = await Promise.all([
          marketDataService.getQuoteData([symbol]).then(data => data[0] || null),
          marketDataService.getCompanyInfo(symbol).catch(() => null),
          marketDataService.getFundamentalData({ symbol }).catch(() => null),
        ]);

        if (!quoteData) {
          setError(`No data found for symbol: ${symbol}`);
          return;
        }
        
        setStockData({
          quote: quoteData,
          companyInfo,
          fundamentals,
        });
      } catch (err) {
        setError('Failed to fetch stock data');
        console.error('Error fetching stock data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStockData();
  }, [symbol]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatNumber = (value: number) => {
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const formatVolume = (value: number) => {
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toLocaleString();
  };

  if (!symbol) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-500">Invalid Symbol</h1>
          <p className="text-gray-600 mt-2">Please provide a valid stock symbol</p>
          <Link href="/protected/markets">
            <Button className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Markets
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/protected/markets">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{symbol}</h1>
              {stockData && (
                <p className="text-sm text-muted-foreground">
                  {stockData.companyInfo?.name || stockData.quote.name || symbol}
                </p>
              )}
            </div>
          </div>
          {stockData && (
            <div className="text-right">
              <div className="text-2xl font-bold">
                {formatCurrency(stockData.quote.price)}
              </div>
              <div className={`flex items-center gap-1 ${
                stockData.quote.change >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {stockData.quote.change >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span>
                  {stockData.quote.change >= 0 ? '+' : ''}
                  {formatCurrency(stockData.quote.change)} ({stockData.quote.changePercent.toFixed(2)}%)
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Main content - Scrollable area */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            {isLoading && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader className="animate-pulse">
                      <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                    </CardHeader>
                    <CardContent className="animate-pulse">
                      <div className="h-8 bg-gray-300 rounded w-3/4 mb-2"></div>
                      <div className="h-4 bg-gray-300 rounded w-1/2"></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {error && (
              <Card>
                <CardContent className="p-6">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-red-500 mb-2">Error</h3>
                    <p className="text-gray-600">{error}</p>
                    <Button 
                      onClick={() => window.location.reload()} 
                      className="mt-4"
                    >
                      Try Again
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {stockData && !isLoading && !error && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Price Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      Price Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Current Price:</span>
                      <span className="font-semibold">{formatCurrency(stockData.quote.price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Day High:</span>
                      <span>{formatCurrency(stockData.quote.dayHigh || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Day Low:</span>
                      <span>{formatCurrency(stockData.quote.dayLow || 0)}</span>
                    </div>
                    {stockData.fundamentals?.yearHigh && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">52W High:</span>
                        <span>{formatCurrency(stockData.fundamentals.yearHigh)}</span>
                      </div>
                    )}
                    {stockData.fundamentals?.yearLow && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">52W Low:</span>
                        <span>{formatCurrency(stockData.fundamentals.yearLow)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Trading Information */}
                <Card>
                  <CardHeader>
                    <CardTitle>Trading Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Volume:</span>
                      <span>{formatVolume(stockData.quote.volume || 0)}</span>
                    </div>
                    {stockData.quote.marketCap && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Market Cap:</span>
                        <span>{formatNumber(stockData.quote.marketCap)}</span>
                      </div>
                    )}
                    {stockData.fundamentals?.peRatio && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">P/E Ratio:</span>
                        <span>{stockData.fundamentals.peRatio.toFixed(2)}</span>
                      </div>
                    )}
                    {stockData.fundamentals?.dividendYield && (
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Dividend Yield:</span>
                        <span>{stockData.fundamentals.dividendYield.toFixed(2)}%</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Status */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5" />
                      Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Badge variant="outline" className="w-full justify-center py-2">
                        Market Open
                      </Badge>
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Last Updated</p>
                        <p className="text-sm font-medium">
                          {new Date(stockData.lastUpdated).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
