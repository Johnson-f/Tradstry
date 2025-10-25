"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  DollarSign,
  Target,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import Link from "next/link";

interface AnalyticsWidgetProps {
  type: "stocks" | "options";
  showViewMore?: boolean;
  className?: string;
}

export function AnalyticsWidget({
  type,
  showViewMore = true,
  className = ""
}: AnalyticsWidgetProps) {
  const {
    winRate,
    netPnl,
    tradeExpectancy,
    averageGain,
    isLoading,
    error,
  } = useAnalytics(type);

  const formatPercentage = (value: number | null): string => {
    if (value === null || value === undefined) return "N/A";
    return `${value.toFixed(1)}%`;
  };

  const formatCurrency = (
    value: number | null,
    compact: boolean = false
  ): string => {
    if (value === null || value === undefined) return "N/A";

    if (compact && Math.abs(value) >= 1000) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
    }

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

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-2">
              Unable to load {type} analytics
            </p>
            <p className="text-xs text-red-500">{error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {type.charAt(0).toUpperCase() + type.slice(1)} Performance
        </CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-20" />
            </div>
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16" />
            </div>
            <div className="flex justify-between items-center">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-20" />
            </div>
            <Skeleton className="h-8 w-full mt-4" />
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="space-y-2">
              {/* Net P&L */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-1">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Net P&L</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`font-semibold ${
                      performanceStatus === "positive"
                        ? "text-green-600"
                        : performanceStatus === "negative"
                        ? "text-red-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {formatCurrency(netPnl, true)}
                  </span>
                  <Badge
                    variant={
                      performanceStatus === "positive"
                        ? "default"
                        : performanceStatus === "negative"
                        ? "destructive"
                        : "secondary"
                    }
                    className="text-xs h-5"
                  >
                    {performanceStatus === "positive"
                      ? "↗"
                      : performanceStatus === "negative"
                      ? "↘"
                      : "→"}
                  </Badge>
                </div>
              </div>

              {/* Win Rate */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-1">
                  <Target className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Win Rate
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold">
                    {formatPercentage(winRate)}
                  </span>
                  <Badge
                    variant={
                      winRateStatus === "high"
                        ? "default"
                        : winRateStatus === "medium"
                        ? "secondary"
                        : "destructive"
                    }
                    className="text-xs h-5"
                  >
                    {winRateStatus === "high"
                      ? "High"
                      : winRateStatus === "medium"
                      ? "Med"
                      : "Low"}
                  </Badge>
                </div>
              </div>

              {/* Trade Expectancy */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-1">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Expectancy
                  </span>
                </div>
                <span
                  className={`font-semibold ${
                    tradeExpectancy && tradeExpectancy > 0
                      ? "text-green-600"
                      : tradeExpectancy && tradeExpectancy < 0
                      ? "text-red-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatCurrency(tradeExpectancy, true)}
                </span>
              </div>

              {/* Average Gain */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-1">
                  <TrendingUp className="h-3 w-3 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Avg. Gain
                  </span>
                </div>
                <span
                  className={`font-semibold ${
                    averageGain && averageGain > 0
                      ? "text-green-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatCurrency(averageGain, true)}
                </span>
              </div>
            </div>

            {/* Performance Summary */}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Overall Status:</span>
                <Badge
                  variant={
                    performanceStatus === "positive" && winRateStatus !== "low"
                      ? "default"
                      : performanceStatus === "negative" ||
                        winRateStatus === "low"
                      ? "destructive"
                      : "secondary"
                  }
                  className="text-xs"
                >
                  {performanceStatus === "positive" && winRateStatus !== "low"
                    ? "Strong"
                    : performanceStatus === "negative" ||
                      winRateStatus === "low"
                    ? "Needs Work"
                    : "Average"}
                </Badge>
              </div>
            </div>

            {/* View More Button */}
            {showViewMore && (
              <div className="pt-2">
                <Link href="/protected/analytics" passHref>
                  <Button variant="outline" size="sm" className="w-full">
                    <span>View Detailed Analytics</span>
                    <ArrowRight className="h-3 w-3 ml-2" />
                  </Button>
                </Link>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
