"use client";

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { marketDataService } from '@/lib/services/market-data-service';
import { SymbolSearch } from '@/components/market-data/symbol-search';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCompanyLogos } from '@/lib/hooks/use-market-data';
import { ManagerTab } from '@/components/market-data/stock-data/manager-tab';
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

  // Get company logo
  const { logos } = useCompanyLogos({ symbols: symbol ? [symbol] : [] });

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
      <div className="w-full border-b bg-background flex-shrink-0">
        <div className="px-6 py-4">
          <div className="relative flex items-center">
            {/* Left side - Navigation breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link href="/protected/markets" className="hover:text-foreground transition-colors">
                Markets
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="font-semibold text-foreground">
                {symbol}
              </span>
            </div>
            
            {/* Centered Search */}
            <div className="absolute left-1/2 transform -translate-x-1/2 rounded-md z-[10002]">
              <div className="w-96">
                <SymbolSearch 
                  placeholder="Search for companies, tickers"
                  onSymbolSelect={(selectedSymbol) => {
                    router.push(`/protected/markets/${selectedSymbol.toUpperCase()}`);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main content - Scrollable area with shadcn ScrollArea */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
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
              <div className="space-y-6">
                {/* Company Header with Logo and Name */}
                <div className="flex items-center gap-4 pt-6 pl-6 rounded-lg">
                  {/* Company Logo */}
                  <div className="flex-shrink-0">
                    {logos.length > 0 && logos[0]?.logo ? (
                      <div className="w-12 h-12 rounded-lg overflow-hidden  flex items-center justify-center">
                        <img
                          src={logos[0].logo}
                          alt={`${symbol} logo`}
                          className="w-10 h-10 object-contain"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                            target.nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                        <div className="hidden w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-600 rounded flex items-center justify-center text-white font-bold text-lg">
                          {symbol.charAt(0)}
                        </div>
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">
                        {symbol.charAt(0)}
                      </div>
                    )}
                  </div>
                  
                  {/* Company Name */}
                  <div className="flex-1">
                    <h1 className="text-2xl font-semibold text-white">
                      {stockData.companyInfo?.name || stockData.quote.name || `${symbol} Limited`}
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">
                      {symbol} • {stockData.quote.exchange || 'Stock Exchange'}
                    </p>
                  </div>
                </div>

                {/* Tab Manager */}
                <ManagerTab symbol={symbol} />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}