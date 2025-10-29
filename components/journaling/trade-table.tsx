'use client';

import React from 'react';
import { useOptions } from '@/lib/hooks/use-options';
import { useStocks } from '@/lib/hooks/use-stocks';
import { useStocksAnalytics, useOptionsAnalytics } from '@/lib/hooks/use-analytics';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import type { Stock } from '@/lib/types/stocks';
import type { OptionTrade } from '@/lib/types/options';

interface TradeData {
  id: string;
  symbol: string;
  entryDate: string;
  reviewed: boolean;
  mistakes?: string | null;
  pl: number;
  rMultiple?: string;
  status: 'WIN' | 'LOSS' | 'BE';
  type: 'STOCK' | 'OPTION';
}

function calculateStockPL(stock: Stock): number {
  if (!stock.exitPrice) return 0;
  
  const entryPriceNum = parseFloat(stock.entryPrice);
  const exitPriceNum = parseFloat(stock.exitPrice);
  const sharesNum = parseFloat(stock.numberShares);
  const commissionsNum = parseFloat(stock.commissions);
  
  const tradeValue = (exitPriceNum - entryPriceNum) * sharesNum;
  return tradeValue - commissionsNum;
}

function calculateOptionPL(option: OptionTrade): number {
  if (!option.exitPrice) return 0;
  
  const entryPriceNum = parseFloat(option.entryPrice);
  const exitPriceNum = parseFloat(option.exitPrice);
  const contracts = option.numberOfContracts;
  
  // Each contract represents 100 shares
  const tradeValue = (exitPriceNum - entryPriceNum) * contracts * 100;
  const commissionsNum = parseFloat(option.commissions || '0');
  
  return tradeValue - commissionsNum;
}

function getStatus(pl: number): 'WIN' | 'LOSS' | 'BE' {
  if (pl > 0) return 'WIN';
  if (pl < 0) return 'LOSS';
  return 'BE';
}

function calculateRMultiple(_stock: Stock, _pl: number): string | undefined {
  // Would need stop loss and take profit data to calculate properly
  // For now, returning undefined if we can't calculate
  return undefined;
}

function parseMistakes(mistakes: string | null | undefined): string[] {
  if (!mistakes) return [];
  
  // Try to parse as comma-separated or JSON array
  try {
    const parsed = JSON.parse(mistakes);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    // If not JSON, try comma-separated
    return mistakes.split(',').map(m => m.trim()).filter(Boolean);
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatCurrency(value: number): string {
  const sign = value >= 0 ? '' : '-';
  const absValue = Math.abs(value);
  return `${sign}$${absValue.toFixed(2)}`;
}

export function TradeTable() {
  const { data: stocks = [], isLoading: stocksLoading } = useStocks();
  const { data: options = [], isLoading: optionsLoading } = useOptions();
  
  // Fetch analytics data for aggregate P&L
  const { data: stocksAnalytics, isLoading: stocksAnalyticsLoading } = useStocksAnalytics();
  const { data: optionsAnalytics, isLoading: optionsAnalyticsLoading } = useOptionsAnalytics();
  
  const isLoading = stocksLoading || optionsLoading;
  const isAnalyticsLoading = stocksAnalyticsLoading || optionsAnalyticsLoading;
  
  // Calculate total P&L from analytics
  const totalPnL = React.useMemo(() => {
    if (!stocksAnalytics?.total_pnl || !optionsAnalytics?.total_pnl) return 0;
    const stocksPnl = parseFloat(stocksAnalytics.total_pnl || '0');
    const optionsPnl = parseFloat(optionsAnalytics.total_pnl || '0');
    return stocksPnl + optionsPnl;
  }, [stocksAnalytics, optionsAnalytics]);
  
  // Combine and transform data
  const trades: TradeData[] = React.useMemo(() => {
    const stocksData: TradeData[] = stocks.map(stock => {
      const pl = calculateStockPL(stock);
      const status = getStatus(pl);
      
      return {
        id: `stock-${stock.id}`,
        symbol: stock.symbol,
        entryDate: stock.entryDate,
        reviewed: stock.reviewed,
        mistakes: stock.mistakes,
        pl,
        rMultiple: calculateRMultiple(stock, pl),
        status,
        type: 'STOCK' as const,
      };
    });
    
    const optionsData: TradeData[] = options.map(option => {
      const pl = calculateOptionPL(option);
      const status = getStatus(pl);
      
      return {
        id: `option-${option.id}`,
        symbol: option.symbol,
        entryDate: option.entryDate,
        reviewed: option.reviewed,
        mistakes: option.mistakes,
        pl,
        rMultiple: undefined, // Would need additional data
        status,
        type: 'OPTION' as const,
      };
    });
    
    // Combine and sort by entry date descending
    return [...stocksData, ...optionsData].sort((a, b) => 
      new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
    );
  }, [stocks, options]);
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle>Trades</CardTitle>
            {!isAnalyticsLoading && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Total P&L:</span>
                <span
                  className={`font-semibold ${
                    totalPnL >= 0
                      ? 'text-green-600 dark:text-green-500'
                      : 'text-red-600 dark:text-red-500'
                  }`}
                >
                  {formatCurrency(totalPnL)}
                </span>
              </div>
            )}
          </div>
          <CardAction>
            <Button size="sm">
              <Plus className="size-4" />
              Add trade
            </Button>
          </CardAction>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox aria-label="Select all" />
                </TableHead>
                <TableHead className="text-center">Entry Date</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead className="text-center">Risk:Reward</TableHead>
                <TableHead>Mistakes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No trades found
                  </TableCell>
                </TableRow>
              ) : (
                trades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        {trade.reviewed ? (
                          <div className="size-5 rounded-full bg-green-500 flex items-center justify-center">
                            <svg
                              className="size-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        ) : (
                          <div className="size-5 rounded-full border-2 border-muted-foreground/30" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {formatDate(trade.entryDate)}
                    </TableCell>
                    <TableCell>{trade.symbol}</TableCell>
                    <TableCell>
                      <div className="flex justify-center">
                        <Badge
                          variant={
                            trade.status === 'WIN'
                              ? 'default'
                              : trade.status === 'LOSS'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className={
                            trade.status === 'WIN'
                              ? 'bg-green-500 hover:bg-green-600 text-white'
                              : trade.status === 'LOSS'
                              ? 'bg-red-500 hover:bg-red-600 text-white'
                              : 'bg-purple-500 hover:bg-purple-600 text-white'
                          }
                        >
                          {trade.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          trade.pl >= 0
                            ? 'text-green-600 dark:text-green-500'
                            : 'text-red-600 dark:text-red-500'
                        }
                      >
                        {formatCurrency(trade.pl)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {trade.rMultiple ? (
                        <span className="text-sm">{trade.rMultiple}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {parseMistakes(trade.mistakes).map((mistake, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-500"
                          >
                            {mistake}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

