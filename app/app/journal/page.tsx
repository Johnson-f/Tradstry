"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, TrendingUp, TrendingDown, DollarSign, Target, BarChart3 } from "lucide-react";
import { StocksTable } from "@/components/journal/stocks-table";
import { OptionsTable } from "@/components/journal/options-table";
import { TradeNotesHistoryModal } from "@/components/journal/trade-notes-history-modal";
import { useAuth } from "@/lib/hooks/use-auth";
import { useStockAnalytics } from "@/lib/drizzle/analytics/stocks";
import { useOptionsAnalytics } from "@/lib/drizzle/analytics/options";

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState<"stocks" | "options">("stocks");
  const [notesHistoryOpen, setNotesHistoryOpen] = useState(false);
  const { user } = useAuth();

  // Analytics state
  const [stocksAnalytics, setStocksAnalytics] = useState<any>(null);
  const [optionsAnalytics, setOptionsAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Always initialize analytics hooks (but they won't work without a user)
  const stockAnalyticsHook = useStockAnalytics(user?.id || "");
  const optionsAnalyticsHook = useOptionsAnalytics(user?.id || "");

  // Load analytics data
  useEffect(() => {
    const loadAnalytics = async () => {
      if (!user?.id) {
        setAnalyticsLoading(false);
        return;
      }

      setAnalyticsLoading(true);
      try {
        const [stocksData, optionsData] = await Promise.all([
          stockAnalyticsHook.getAllAnalytics(),
          optionsAnalyticsHook.getAllAnalytics()
        ]);
        setStocksAnalytics(stocksData);
        setOptionsAnalytics(optionsData);
      } catch (error) {
        console.error('Failed to load analytics:', error);
      } finally {
        setAnalyticsLoading(false);
      }
    };

    loadAnalytics();
  }, [user?.id, stockAnalyticsHook, optionsAnalyticsHook]);

  // Helper functions
  const formatCurrency = (value: number | null): string => {
    if (value === null || value === undefined) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number | null): string => {
    if (value === null || value === undefined) return "N/A";
    return `${value.toFixed(1)}%`;
  };

  const getPerformanceStatus = (pnl: number | null): "positive" | "negative" | "neutral" => {
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

  // Analytics Widget Component
  const AnalyticsWidget = ({ type, analytics, className }: { type: string, analytics: any, className?: string }) => {
    if (analyticsLoading) {
      return (
        <Card className={className}>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-18" />
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (!analytics) {
      return (
        <Card className={className}>
          <CardContent className="pt-6">
            <div className="text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No {type} data available</p>
            </div>
          </CardContent>
        </Card>
      );
    }

    const performanceStatus = getPerformanceStatus(analytics.netPnL);
    const winRateStatus = getWinRateStatus(analytics.winRate);

    return (
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {type.charAt(0).toUpperCase() + type.slice(1)} Performance
          </CardTitle>
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Net P&L */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Net P&L</span>
            </div>
            <div className="flex items-center space-x-2">
              {performanceStatus === "positive" && (
                <TrendingUp className="h-4 w-4 text-green-600" />
              )}
              {performanceStatus === "negative" && (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span
                className={`text-sm font-semibold ${
                  performanceStatus === "positive"
                    ? "text-green-600"
                    : performanceStatus === "negative"
                    ? "text-red-600"
                    : "text-muted-foreground"
                }`}
              >
                {formatCurrency(analytics.netPnL)}
              </span>
            </div>
          </div>

          {/* Win Rate */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Win Rate</span>
            </div>
            <Badge
              variant={
                winRateStatus === "high"
                  ? "default"
                  : winRateStatus === "medium"
                  ? "secondary"
                  : "outline"
              }
              className={`text-xs ${
                winRateStatus === "high"
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : winRateStatus === "medium"
                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
              }`}
            >
              {formatPercentage(analytics.winRate)}
            </Badge>
          </div>

          {/* Trade Expectancy */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Expectancy</span>
            </div>
            <span
              className={`text-sm font-semibold ${
                analytics.tradeExpectancy && analytics.tradeExpectancy > 0
                  ? "text-green-600"
                  : analytics.tradeExpectancy && analytics.tradeExpectancy < 0
                  ? "text-red-600"
                  : "text-muted-foreground"
              }`}
            >
              {formatCurrency(analytics.tradeExpectancy)}
            </span>
          </div>

          {/* Profit Factor */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Profit Factor</span>
            </div>
            <span
              className={`text-sm font-semibold ${
                analytics.profitFactor && analytics.profitFactor > 1
                  ? "text-green-600"
                  : analytics.profitFactor && analytics.profitFactor < 1
                  ? "text-red-600"
                  : "text-muted-foreground"
              }`}
            >
              {analytics.profitFactor ? analytics.profitFactor.toFixed(2) : "N/A"}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Analytics Summary Component
  const AnalyticsSummary = ({ type, analytics, isLoading }: { type: string, analytics: any, isLoading: boolean }) => {
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

    if (!analytics) {
      return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-xl shadow-sm md:col-span-2 lg:col-span-4">
            <CardContent className="p-6">
              <div className="text-center">
                <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No {type} analytics data available</p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    const performanceStatus = getPerformanceStatus(analytics.netPnL);
    const winRateStatus = getWinRateStatus(analytics.winRate);

    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Net P&L */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p
                  className={`text-2xl font-bold ${
                    performanceStatus === "positive"
                      ? "text-green-600"
                      : performanceStatus === "negative"
                      ? "text-red-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatCurrency(analytics.netPnL)}
                </p>
                <p className="text-sm text-muted-foreground">Net P&L</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <p className="text-2xl font-bold">{formatPercentage(analytics.winRate)}</p>
                  <Badge
                    variant={
                      winRateStatus === "high"
                        ? "default"
                        : winRateStatus === "medium"
                        ? "secondary"
                        : "outline"
                    }
                    className={`text-xs ${
                      winRateStatus === "high"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : winRateStatus === "medium"
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                    }`}
                  >
                    {winRateStatus}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">Win Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trade Expectancy */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p
                  className={`text-2xl font-bold ${
                    analytics.tradeExpectancy && analytics.tradeExpectancy > 0
                      ? "text-green-600"
                      : analytics.tradeExpectancy && analytics.tradeExpectancy < 0
                      ? "text-red-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {formatCurrency(analytics.tradeExpectancy)}
                </p>
                <p className="text-sm text-muted-foreground">Trade Expectancy</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Profit Factor */}
        <Card className="rounded-xl shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p
                  className={`text-2xl font-bold ${
                    analytics.profitFactor && analytics.profitFactor > 1
                      ? "text-green-600"
                      : analytics.profitFactor && analytics.profitFactor < 1
                      ? "text-red-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {analytics.profitFactor ? analytics.profitFactor.toFixed(2) : "N/A"}
                </p>
                <p className="text-sm text-muted-foreground">Profit Factor</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setNotesHistoryOpen(true)}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Manage Notes
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8 space-y-8">
            {/* Quick Analytics Overview */}
            <div className="grid gap-4 md:grid-cols-2">
              <AnalyticsWidget
                type="stocks"
                analytics={stocksAnalytics}
                className="md:col-span-1"
              />
              <AnalyticsWidget
                type="options"
                analytics={optionsAnalytics}
                className="md:col-span-1"
              />
            </div>

            <Tabs
              defaultValue="stocks"
              className="space-y-4"
              onValueChange={(value) =>
                setActiveTab(value as "stocks" | "options")
              }
            >
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="stocks">Stocks</TabsTrigger>
                  <TabsTrigger value="options">Options</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="stocks" className="space-y-4">
                <AnalyticsSummary
                  type="stocks"
                  analytics={stocksAnalytics}
                  isLoading={analyticsLoading}
                />
                <StocksTable />
              </TabsContent>

              <TabsContent value="options" className="space-y-4">
                <AnalyticsSummary
                  type="options"
                  analytics={optionsAnalytics}
                  isLoading={analyticsLoading}
                />
                <OptionsTable />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <TradeNotesHistoryModal
        open={notesHistoryOpen}
        onOpenChange={setNotesHistoryOpen}
        userId={user?.id || ""}
      />
    </div>
  );
}
