"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeUpdates";
import { TrendingUp, DollarSign, Target } from "lucide-react";

interface AnalyticsSummaryProps {
  type: "stocks" | "options";
  winRate: number | null;
  netPnl: number | null;
  tradeExpectancy: number | null;
  totalTrades: number;
  averageGain?: number | null;
  averageLoss?: number | null;
  riskRewardRatio?: number | null;
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
  const queryClient = useQueryClient();

  // Subscribe to real-time updates for the current trade type
  useRealtimeTable(type, queryClient, ["analytics", type]);

  // Also subscribe to the other trade type to keep everything in sync
  const otherType = type === "stocks" ? "options" : "stocks";
  useRealtimeTable(otherType, queryClient, ["analytics", otherType]);
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="rounded-xl shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div>
                  <Skeleton className="h-5 w-24 mb-1" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formatPercentage = (value: number | null): string => {
    if (value === null || value === undefined) return "N/A";
    return `${value.toFixed(1)}%`;
  };

  const formatCurrency = (value: number | null): string => {
    if (value === null || value === undefined) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getPerformanceStatus = (
    pnl: number | null
  ): "positive" | "negative" | "neutral" => {
    if (pnl === null || pnl === undefined) return "neutral";
    if (pnl > 0) return "positive";
    if (pnl < 0) return "negative";
    return "neutral";
  };

  const getWinRateStatus = (rate: number | null): "high" | "medium" | "low" => {
    if (rate === null || rate === undefined) return "low";
    if (rate >= 60) return "high";
    if (rate >= 45) return "medium";
    return "low";
  };

  const performanceStatus = getPerformanceStatus(netPnl);
  const winRateStatus = getWinRateStatus(winRate);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Total Trades */}
      <Card className="rounded-xl shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center space-x-4">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalTrades}</p>
              <p className="text-sm text-muted-foreground">Total Trades</p>
            </div>
          </div>
        </CardContent>
      </Card>

        {/* Win Rate */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <p className="text-2xl font-bold">
                    {formatPercentage(winRate)}
                  </p>
                  <Badge
                    variant={
                      winRateStatus === "high"
                        ? "default"
                        : winRateStatus === "medium"
                        ? "secondary"
                        : "destructive"
                    }
                    className="h-5 text-xs"
                  >
                    {winRateStatus === "high"
                      ? "Excellent"
                      : winRateStatus === "medium"
                      ? "Good"
                      : "Needs Work"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">Win Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Net P&L */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <p
                    className={`text-2xl font-bold ${
                      performanceStatus === "positive"
                        ? "text-green-600"
                        : performanceStatus === "negative"
                        ? "text-red-600"
                        : "text-foreground"
                    }`}
                  >
                    {formatCurrency(netPnl)}
                  </p>
                  <Badge
                    variant={
                      performanceStatus === "positive"
                        ? "default"
                        : performanceStatus === "negative"
                        ? "destructive"
                        : "secondary"
                    }
                    className="h-5 text-xs"
                  >
                    {performanceStatus === "positive"
                      ? "Profitable"
                      : performanceStatus === "negative"
                      ? "Loss"
                      : "Break Even"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">Net P&L</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trade Expectancy */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p
                  className={`text-2xl font-bold ${
                    tradeExpectancy && tradeExpectancy > 0
                      ? "text-green-600"
                      : tradeExpectancy && tradeExpectancy < 0
                      ? "text-red-600"
                      : "text-foreground"
                  }`}
                >
                  {formatCurrency(tradeExpectancy)}
                </p>
                <p className="text-sm text-muted-foreground">Expected/Trade</p>
              </div>
            </div>
          </CardContent>
        </Card>


    </div>
  );
}
