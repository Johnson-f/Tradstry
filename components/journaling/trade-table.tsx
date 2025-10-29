'use client';

import React from 'react';
import { useOptions } from '@/lib/hooks/use-options';
import { useStocks } from '@/lib/hooks/use-stocks';
import { useSymbolAnalytics, useIndividualTradeAnalytics } from '@/lib/hooks/use-analytics';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import apiConfig, { getFullUrl } from '@/lib/config/api';
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
  tradeId: number | null;
  tradeTypeApi: 'stock' | 'option';
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

function calculateRMultiple(): string | undefined {
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
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
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
  const queryClient = useQueryClient();
  const { data: stocks = [], isLoading: stocksLoading } = useStocks();
  const { data: options = [], isLoading: optionsLoading } = useOptions();
  
  const isLoading = stocksLoading || optionsLoading;
  
  const supabase = React.useMemo(() => createClient(), []);

  const updateReviewed = React.useCallback(async (trade: TradeData, next: boolean) => {
    if (trade.tradeId == null) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;

    const endpoint = trade.tradeTypeApi === 'stock'
      ? apiConfig.endpoints.stocks.byId(trade.tradeId)
      : apiConfig.endpoints.options.byId(trade.tradeId);

    const res = await fetch(getFullUrl(endpoint), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reviewed: next }),
    });

    if (res.ok) {
      // Optimistically update caches
      if (trade.tradeTypeApi === 'stock') {
        queryClient.setQueryData<Stock[]>(['stocks'], (prev) =>
          prev?.map(s => Number(s.id) === trade.tradeId ? { ...s, reviewed: next } as Stock : s) ?? prev
        );
      } else {
        queryClient.setQueryData<OptionTrade[]>(['options'], (prev) =>
          prev?.map(o => Number(o.id) === trade.tradeId ? { ...o, reviewed: next } as OptionTrade : o) ?? prev
        );
      }
    }
  }, [queryClient, supabase]);

  
  // Combine and transform data
  const trades: TradeData[] = React.useMemo(() => {
    const stocksData: TradeData[] = stocks.map(stock => {
      const pl = calculateStockPL(stock);
      const status = getStatus(pl);
      const numericId = Number(stock.id);
      
      return {
        id: `stock-${stock.id}`,
        tradeId: Number.isFinite(numericId) ? numericId : null,
        tradeTypeApi: 'stock',
        symbol: stock.symbol,
        entryDate: stock.entryDate,
        reviewed: stock.reviewed,
        mistakes: stock.mistakes,
        pl,
        rMultiple: calculateRMultiple(),
        status,
        type: 'STOCK' as const,
      };
    });
    
    const optionsData: TradeData[] = options.map(option => {
      const pl = calculateOptionPL(option);
      const status = getStatus(pl);
      const numericId = Number(option.id);
      
      return {
        id: `option-${option.id}`,
        tradeId: Number.isFinite(numericId) ? numericId : null,
        tradeTypeApi: 'option',
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
                <TableHead className="text-right">Symbol P&L</TableHead>
                <TableHead className="text-center">Risk:Reward</TableHead>
                <TableHead className="text-center">Duration</TableHead>
                <TableHead className="text-center">Reviewed</TableHead>
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
                      <SymbolPnlCell symbol={trade.symbol} />
                    </TableCell>
                    <TableCell className="text-center">
                      <RiskRewardCell tradeId={trade.tradeId} tradeTypeApi={trade.tradeTypeApi} />
                    </TableCell>
                    <TableCell className="text-center">
                      <DurationCell tradeId={trade.tradeId} tradeTypeApi={trade.tradeTypeApi} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={trade.reviewed}
                        onCheckedChange={(val) => { void updateReviewed(trade, Boolean(val)); }}
                        aria-label="Reviewed"
                      />
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

function SymbolPnlCell({ symbol }: { symbol: string }) {
  // Fetch aggregated analytics for the specific symbol
  const { data, isLoading, error } = useSymbolAnalytics(symbol);

  if (isLoading) {
    return <span className="text-muted-foreground">...</span>;
  }

  if (error || !data) {
    return <span className="text-muted-foreground">-</span>;
  }

  const pnl = data.net_pnl ?? 0;
  const cls = pnl >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500';
  return <span className={cls}>{formatCurrency(pnl)}</span>;
}

function RiskRewardCell({ tradeId, tradeTypeApi }: { tradeId: number | null; tradeTypeApi: 'stock' | 'option' }) {
  const enabled = tradeId !== null;
  const { data, isLoading, error } = useIndividualTradeAnalytics(
    tradeId ?? -1,
    tradeTypeApi,
    enabled
  );

  if (!enabled) {
    return <span className="text-muted-foreground">-</span>;
  }

  if (isLoading) {
    return <span className="text-muted-foreground">...</span>;
  }

  if (error || !data) {
    return <span className="text-muted-foreground">-</span>;
  }

  const rr = data.realized_risk_to_reward ?? data.planned_risk_to_reward;
  if (rr == null) return <span className="text-muted-foreground">-</span>;

  const display = Number.isFinite(rr) ? (rr as number).toFixed(2) : '-';
  const days = typeof data.hold_time_days === 'number' && isFinite(data.hold_time_days)
    ? data.hold_time_days
    : null;
  const daysText = days != null ? `${days.toFixed(1)}d` : null;
  return (
    <span className="text-sm">
      {display}
      {daysText ? <span className="text-muted-foreground"> · {daysText}</span> : null}
    </span>
  );
}

function DurationCell({ tradeId, tradeTypeApi }: { tradeId: number | null; tradeTypeApi: 'stock' | 'option' }) {
  const enabled = tradeId !== null;
  const { data, isLoading, error } = useIndividualTradeAnalytics(
    tradeId ?? -1,
    tradeTypeApi,
    enabled
  );

  if (!enabled) {
    return <span className="text-muted-foreground">-</span>;
  }

  if (isLoading) {
    return <span className="text-muted-foreground">...</span>;
  }

  if (error || !data || typeof data.hold_time_days !== 'number' || !isFinite(data.hold_time_days)) {
    return <span className="text-muted-foreground">-</span>;
  }

  return <span className="text-sm">{data.hold_time_days.toFixed(1)}d</span>;
}

