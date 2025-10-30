"use client";

import { useState, useMemo } from 'react';
import { useHistorical } from '@/lib/hooks/use-market-data-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import HistoricalChart from '@/components/market-data/HistoricalChart';

export default function EducationPage() {
  const [symbol, setSymbol] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const [range, setRange] = useState<string>('1d');
  const [interval, setInterval] = useState<string>('1m');

  const allowedOptions = useMemo(
    () => [
      { range: '1d', interval: '1m' },
      { range: '5d', interval: '5m' },
      { range: '1mo', interval: '15m' },
      { range: '3mo', interval: '30m' },
      { range: '6mo', interval: '1h' },
      { range: 'ytd', interval: '1d' },
      { range: '1y', interval: '1mo' },
      { range: '2y', interval: '1d' },
      { range: '5y', interval: '1wk' },
      { range: '10y', interval: '1mo' },
      { range: 'max', interval: '1mo' },
    ],
    []
  );

  // Keep interval in sync when range changes (use defaults from list)
  const handleRangeChange = (newRange: string) => {
    setRange(newRange);
    const match = allowedOptions.find((o) => o.range === newRange);
    if (match) setInterval(match.interval);
  };

  const { historical, isLoading, error, refetch } = useHistorical(
    {
      symbol: symbol || '',
      range,
      interval,
    },
    !!symbol
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = inputValue.toUpperCase().trim();
    setSymbol(next);
  };

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
            {/* Historical Chart Section */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Historical Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Controls */}
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Enter symbol (e.g., AAPL, TSLA, MSFT)"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="flex-1"
                  />
                  <select
                    value={range}
                    onChange={(e) => handleRangeChange(e.target.value)}
                    className="border rounded px-2"
                  >
                    {allowedOptions.map((opt) => (
                      <option key={opt.range} value={opt.range}>
                        {opt.range}
                      </option>
                    ))}
                  </select>
                  <select
                    value={interval}
                    onChange={(e) => setInterval(e.target.value)}
                    className="border rounded px-2"
                  >
                    {/* Only show intervals valid for the selected range */}
                    {allowedOptions
                      .filter((o) => o.range === range)
                      .map((o) => (
                        <option key={o.interval} value={o.interval}>
                          {o.interval}
                        </option>
                      ))}
                  </select>
                  <Button type="submit" disabled={isLoading || !inputValue.trim()}>
                    {isLoading ? 'Loading...' : 'Load'}
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

                {/* Chart */}
                {symbol && historical && !isLoading && (
                  <div className="p-2">
                    <HistoricalChart data={historical.candles} />
                  </div>
                )}

                {/* No Data State */}
                {!historical && !isLoading && !error && symbol && (
                  <div className="p-4 bg-muted rounded-md">
                    <p className="text-sm text-muted-foreground">
                      No historical data available for {symbol}
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
                    <strong>Hook:</strong> <code className="bg-muted px-2 py-1 rounded">useHistorical</code>
                  </p>
                  <p>
                    <strong>Service:</strong> marketDataService.getHistorical()
                  </p>
                  <p>
                    <strong>Range/Interval:</strong> {range} / {interval}
                  </p>
                  <p>
                    <strong>Data points:</strong> {historical?.candles?.length ?? 0}
                  </p>
                  <p className="pt-2 text-xs text-muted-foreground">
                    <strong>Note:</strong> Allowed pairs include 1d/1m, 5d/5m, 1mo/15m, 3mo/30m, 6mo/1h, ytd/1d, 1y/1mo; longer ranges default to sensible intervals.
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