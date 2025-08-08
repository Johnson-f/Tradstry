"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  DollarSign,
  Target,
} from "lucide-react";

interface AnalyticsSummaryProps {
  type: 'stocks' | 'options';
  winRate: number | null;
  netPnl: number | null;
  tradeExpectancy: number | null;
  totalTrades: number;
  isLoading: boolean;
}

export function AnalyticsSummary({
  type,
  winRate,
  netPnl,
  tradeExpectancy,
  totalTrades,
  isLoading
}: AnalyticsSummaryProps) {
  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">
            {type.charAt(0).toUpperCase() + type.slice(1)} Performance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Skeleton className="h-4 w-4" />
                <div>
                  <Skeleton className="h-4 w-16 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatPercentage = (value: number | null): string => {
    if (value === null || value === undefined) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  const formatCurrency = (value: number | null): string => {
    if (value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getPerformanceStatus = (pnl: number | null): 'positive' | 'negative' | 'neutral' => {
    if (pnl === null || pnl === undefined) return 'neutral';
    if (pnl > 0) return 'positive';
    if (pnl < 0) return 'negative';
    return 'neutral';
  };

  const getWinRateStatus = (rate: number | null): 'high' | 'medium' | 'low' => {
    if (rate === null || rate === undefined) return 'low';
    if (rate >= 60) return 'high';
    if (rate >= 45) return 'medium';
    return 'low';
  };

  const performanceStatus = getPerformanceStatus(netPnl);
  const winRateStatus = getWinRateStatus(winRate);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg">
          {type.charAt(0).toUpperCase() + type.slice(1)} Performance Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-6">
          {/* Total Trades */}
          <div className="flex items-center space-x-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-semibold">{totalTrades}</div>
              <div className="text-xs text-muted-foreground">Total Trades</div>
            </div>
          </div>

          {/* Win Rate */}
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-semibold flex items-center space-x-2">
                <span>{formatPercentage(winRate)}</span>
                <Badge
                  variant={winRateStatus === 'high' ? 'default' : winRateStatus === 'medium' ? 'secondary' : 'destructive'}
                  className="text-xs"
                >
                  {winRateStatus === 'high' ? 'Excellent' : winRateStatus === 'medium' ? 'Good' : 'Needs Work'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">Win Rate</div>
            </div>
          </div>

          {/* Net P&L */}
          <div className="flex items-center space-x-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-semibold flex items-center space-x-2">
                <span className={
                  performanceStatus === 'positive' ? 'text-green-600' :
                  performanceStatus === 'negative' ? 'text-red-600' :
                  'text-muted-foreground'
                }>
                  {formatCurrency(netPnl)}
                </span>
                <Badge
                  variant={performanceStatus === 'positive' ? 'default' : performanceStatus === 'negative' ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {performanceStatus === 'positive' ? 'Profitable' : performanceStatus === 'negative' ? 'Loss' : 'Break Even'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">Net P&L</div>
            </div>
          </div>

          {/* Trade Expectancy */}
          <div className="flex items-center space-x-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className={`font-semibold ${
                tradeExpectancy && tradeExpectancy > 0 ? 'text-green-600' :
                tradeExpectancy && tradeExpectancy < 0 ? 'text-red-600' :
                'text-muted-foreground'
              }`}>
                {formatCurrency(tradeExpectancy)}
              </div>
              <div className="text-xs text-muted-foreground">Expected/Trade</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
