"use client";

import { useState, useCallback } from 'react';
import { useSimpleQuotes } from '@/lib/hooks/use-market-data-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function EducationPage() {
  const [symbol, setSymbol] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const [imageError, setImageError] = useState<Record<string, boolean>>({});
  const { quotes, isLoading, error, refetch } = useSimpleQuotes(
    { symbols: symbol ? [symbol] : [] },
    !!symbol
  );
  const quote = quotes?.[0] ?? null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSymbol(inputValue.toUpperCase().trim());
    // Reset image error for new symbol
    setImageError({});
  };

  const handleImageError = useCallback((symbol: string) => {
    setImageError(prev => {
      if (prev[symbol]) return prev; // Already marked as error
      return { ...prev, [symbol]: true };
    });
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Education</h1>
      </div>
      
      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8 max-w-4xl mx-auto">
            {/* Quote Testing Section */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Simple Quote Hook Testing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Symbol Input */}
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Enter symbol (e.g., AAPL, TSLA, MSFT)"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Loading...' : 'Get Quote'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => refetch()}
                    disabled={isLoading}
                  >
                    Refetch
                  </Button>
                </form>

                {/* Error Display */}
                {error && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                    <p className="text-sm text-destructive font-medium">Error:</p>
                    <p className="text-sm text-destructive/80">{error.message}</p>
                  </div>
                )}

                {/* Loading State */}
                {isLoading && (
                  <div className="p-4 bg-muted rounded-md">
                    <p className="text-sm text-muted-foreground">Loading quote for {symbol}...</p>
                  </div>
                )}

                {/* Quote Data Display */}
                {quote && !isLoading && (
                  <div className="p-4 bg-muted rounded-md space-y-2">
                    <div className="flex items-center gap-3">
                      {quote.logo && !imageError[quote.symbol] ? (
                        <div className="relative w-12 h-12 rounded overflow-hidden bg-background flex items-center justify-center shrink-0">
                          {/* Use img tag with corsproxy or direct link - COEP credentialless allows it */}
                          <img
                            src={quote.logo}
                            alt={`${quote.symbol} logo`}
                            className="w-full h-full object-contain"
                            onError={() => handleImageError(quote.symbol)}
                            crossOrigin="anonymous"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded bg-muted-foreground/20 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-muted-foreground">
                            {quote.symbol.slice(0, 2)}
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg">{quote.symbol}</h3>
                        {quote.name && (
                          <p className="text-sm text-muted-foreground truncate">{quote.name}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Price</p>
                        <p className="text-lg font-semibold">
                          {quote.price ? `$${quote.price}` : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Change</p>
                        <p
                          className={`text-lg font-semibold ${
                            quote.change?.startsWith('-')
                              ? 'text-destructive'
                              : quote.change?.startsWith('+') || (quote.change && parseFloat(quote.change) > 0)
                              ? 'text-green-600'
                              : ''
                          }`}
                        >
                          {quote.change || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Percent Change</p>
                        <p
                          className={`text-lg font-semibold ${
                            quote.percentChange?.startsWith('-')
                              ? 'text-destructive'
                              : quote.percentChange?.startsWith('+') || (quote.percentChange && parseFloat(quote.percentChange) > 0)
                              ? 'text-green-600'
                              : ''
                          }`}
                        >
                          {quote.percentChange || 'N/A'}
                        </p>
                      </div>
                      {quote.afterHoursPrice && (
                        <div>
                          <p className="text-xs text-muted-foreground">After Hours</p>
                          <p className="text-lg font-semibold">
                            ${quote.afterHoursPrice}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* No Data State */}
                {!quote && !isLoading && !error && symbol && (
                  <div className="p-4 bg-muted rounded-md">
                    <p className="text-sm text-muted-foreground">
                      No quote data available for {symbol}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Hook Info */}
            <Card>
              <CardHeader>
                <CardTitle>Hook Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <p>
                    <strong>Hook:</strong> <code className="bg-muted px-2 py-1 rounded">useSimpleQuotes</code>
                  </p>
                  <p>
                    <strong>Service:</strong> marketDataService.getSimpleQuotes()
                  </p>
                  <p>
                    <strong>Auto-refetch:</strong> Every 15 seconds
                  </p>
                  <p>
                    <strong>Cache time:</strong> 1 minute
                  </p>
                  <p>
                    <strong>Stale time:</strong> 10 seconds
                  </p>
                  <p className="pt-2 text-xs text-muted-foreground">
                    <strong>Note:</strong> Simple quotes provide summary data (price, change, logo) without detailed metrics.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}