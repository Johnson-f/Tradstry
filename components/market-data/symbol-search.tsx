"use client";

import { useState, useEffect, useRef } from 'react';
import { Search, TrendingUp, TrendingDown, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { marketDataService } from '@/lib/services/market-data-service';

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  currency?: string;
  marketCap?: number;
  sector?: string;
}

interface SymbolSearchProps {
  onSymbolSelect?: (symbol: string) => void;
  className?: string;
  placeholder?: string;
}

export function SymbolSearch({ 
  onSymbolSelect, 
  className = "", 
  placeholder = "Search stocks, ETFs, indices..." 
}: SymbolSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Debounce search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      searchSymbols(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchSymbols = async (searchQuery: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(
        `https://finance-query.onrender.com/v1/search?query=${encodeURIComponent(searchQuery)}&yahoo=true`
      );

      if (!response.ok) {
        throw new Error('Failed to search symbols');
      }

      const data = await response.json();
      
      // Transform the response to match our SearchResult interface
      // API returns an array, not an object
      const transformedResults: SearchResult[] = (Array.isArray(data) ? data : []).map((info: any) => ({
        symbol: info.symbol,
        name: info.name || info.longName || info.symbol,
        exchange: info.exchange || 'Unknown',
        type: info.quoteType || info.typeDisp || info.type || 'Stock',
        currency: info.currency,
        marketCap: info.marketCap,
        sector: info.sector,
      }));
      setResults(transformedResults.slice(0, 10)); // Limit to 10 results
      setIsOpen(true);
    } catch (err) {
      setError('Failed to search symbols');
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSymbolSelect = async (symbol: string) => {
    try {
      // First, check if symbol exists in database
      const symbolExists = await checkSymbolInDatabase(symbol);
      
      if (!symbolExists) {
        // Save symbol to database if it doesn't exist
        await saveSymbolToDatabase(symbol);
      }

      // Close dropdown
      setIsOpen(false);
      setQuery('');
      
      // Call callback or navigate
      if (onSymbolSelect) {
        onSymbolSelect(symbol);
      } else {
        router.push(`/protected/markets/${symbol}`);
      }
    } catch (err) {
      console.error('Error handling symbol selection:', err);
      // Still proceed with navigation even if database operations fail
      if (onSymbolSelect) {
        onSymbolSelect(symbol);
      } else {
        router.push(`/protected/markets/${symbol}`);
      }
    }
  };

  const checkSymbolInDatabase = async (symbol: string): Promise<boolean> => {
    try {
      const response = await marketDataService.checkSymbolExists(symbol);
      return response.exists;
    } catch (err) {
      console.error('Error checking symbol in database:', err);
      return false;
    }
  };

  const saveSymbolToDatabase = async (symbol: string): Promise<void> => {
    try {
      await marketDataService.saveSymbolToDatabase({ symbol });
    } catch (err) {
      console.error('Error saving symbol to database:', err);
      // Don't throw - we still want to proceed with navigation
    }
  };

  const getTypeIcon = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('equity') || lowerType.includes('stock')) {
      return <Building2 className="w-3 h-3" />;
    }
    if (lowerType.includes('etf')) {
      return <TrendingUp className="w-3 h-3" />;
    }
    return <TrendingUp className="w-3 h-3" />;
  };

  const getTypeBadgeVariant = (type: string) => {
    const lowerType = type.toLowerCase();
    if (lowerType.includes('equity') || lowerType.includes('stock')) {
      return 'default' as const;
    }
    if (lowerType.includes('etf')) {
      return 'secondary' as const;
    }
    return 'outline' as const;
  };

  const formatMarketCap = (marketCap?: number) => {
    if (!marketCap) return null;
    
    if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(1)}T`;
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(1)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(1)}M`;
    return `$${marketCap.toLocaleString()}`;
  };

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          className="pl-10 pr-4 py-2"
        />
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-full mt-1 w-full">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
                <span className="text-sm text-muted-foreground">Searching...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="absolute top-full mt-1 w-full">
          <Card>
            <CardContent className="p-3">
              <p className="text-sm text-red-500">{error}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search results dropdown */}
      {isOpen && results.length > 0 && !isLoading && (
        <div className="absolute top-full mt-1 w-full z-50">
          <Card className="max-h-80 overflow-y-auto">
            <CardContent className="p-0">
              {results.map((result, index) => (
                <button
                  key={`${result.symbol}-${index}`}
                  onClick={() => handleSymbolSelect(result.symbol)}
                  className="w-full p-3 text-left hover:bg-muted/50 border-b last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{result.symbol}</span>
                        <Badge variant={getTypeBadgeVariant(result.type)} className="text-xs">
                          {getTypeIcon(result.type)}
                          <span className="ml-1">{result.type}</span>
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {result.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {result.exchange}
                        </span>
                        {result.currency && (
                          <span className="text-xs text-muted-foreground">
                            {result.currency}
                          </span>
                        )}
                        {result.marketCap && (
                          <span className="text-xs text-muted-foreground">
                            {formatMarketCap(result.marketCap)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* No results */}
      {isOpen && results.length === 0 && !isLoading && query.trim() && !error && (
        <div className="absolute top-full mt-1 w-full">
          <Card>
            <CardContent className="p-3">
              <p className="text-sm text-muted-foreground">No results found for "{query}"</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
