"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { useAnalytics, usePortfolioAnalytics } from "@/lib/hooks/use-analytics";
import { AnalyticsCards } from "./analytics-cards";

interface AnalyticsDashboardProps {
  showPortfolioOverview?: boolean;
  defaultTab?: "stocks" | "options" | "portfolio";
  compact?: boolean;
}

export function AnalyticsDashboard({
  showPortfolioOverview = true,
  defaultTab = "stocks",
  compact = false,
}: AnalyticsDashboardProps) {
  const [activeTab, setActiveTab] = useState<
    "stocks" | "options" | "portfolio"
  >(defaultTab);

  const stocksAnalytics = useAnalytics('stocks');
  const optionsAnalytics = useAnalytics('options');
  const portfolioAnalytics = usePortfolioAnalytics();

  const getCurrentAnalytics = () => {
    switch (activeTab) {
      case "stocks":
        return stocksAnalytics;
      case "options":
        return optionsAnalytics;
      case "portfolio":
        return {
          isLoading: portfolioAnalytics.isLoading,
          error: portfolioAnalytics.error,
          refetch: portfolioAnalytics.refetch,
        };
      default:
        return stocksAnalytics;
    }
  };

  const currentAnalytics = getCurrentAnalytics();

  const handleRefresh = async () => {
    await currentAnalytics.refetch();
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

  const formatPercentage = (value: number | null): string => {
    if (value === null || value === undefined) return "N/A";
    return `${value.toFixed(1)}%`;
  };

  const getPerformanceColor = (value: number | null): string => {
    if (value === null || value === undefined) return "text-muted-foreground";
    return value > 0
      ? "text-green-600"
      : value < 0
      ? "text-red-600"
      : "text-muted-foreground";
  };

  if (currentAnalytics.error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <p className="text-red-500 mb-4">
              Failed to load analytics: {currentAnalytics.error.message}
            </p>
            <Button onClick={handleRefresh} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <h2
          className={
            compact
              ? "text-lg font-semibold"
              : "text-2xl font-bold tracking-tight"
          }
        >
          Trading Analytics
        </h2>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={currentAnalytics.isLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${currentAnalytics.isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Portfolio Overview */}
      {showPortfolioOverview && !compact && (
        <Card>
          <CardHeader>
            <CardTitle>Portfolio Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {portfolioAnalytics.isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="text-center">
                    <Skeleton className="h-4 w-16 mx-auto mb-2" />
                    <Skeleton className="h-6 w-20 mx-auto mb-1" />
                    <Skeleton className="h-3 w-12 mx-auto" />
                  </div>
                ))}
              </div>
            ) : portfolioAnalytics.portfolioData ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Stocks P&L
                  </p>
                  <p
                    className={`text-xl font-bold ${getPerformanceColor(
                      portfolioAnalytics.portfolioData.stocks.netPnl
                    )}`}
                  >
                    {formatCurrency(
                      portfolioAnalytics.portfolioData.stocks.netPnl
                    )}
                  </p>
                  <Badge variant="secondary" className="text-xs mt-1">
                    {formatPercentage(
                      portfolioAnalytics.portfolioData.stocks.winRate
                    )}{" "}
                    Win Rate
                  </Badge>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Options P&L
                  </p>
                  <p
                    className={`text-xl font-bold ${getPerformanceColor(
                      portfolioAnalytics.portfolioData.options.netPnl
                    )}`}
                  >
                    {formatCurrency(
                      portfolioAnalytics.portfolioData.options.netPnl
                    )}
                  </p>
                  <Badge variant="secondary" className="text-xs mt-1">
                    {formatPercentage(
                      portfolioAnalytics.portfolioData.options.winRate
                    )}{" "}
                    Win Rate
                  </Badge>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Total P&L
                  </p>
                  <p
                    className={`text-xl font-bold ${getPerformanceColor(
                      (portfolioAnalytics.portfolioData.stocks.netPnl || 0) +
                        (portfolioAnalytics.portfolioData.options.netPnl || 0)
                    )}`}
                  >
                    {formatCurrency(
                      (portfolioAnalytics.portfolioData.stocks.netPnl || 0) +
                        (portfolioAnalytics.portfolioData.options.netPnl || 0)
                    )}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Portfolio Score
                  </p>
                  <div className="text-xl font-bold">
                    {(() => {
                      const stocksScore =
                        (portfolioAnalytics.portfolioData.stocks.winRate || 0) >
                        50
                          ? 1
                          : 0;
                      const optionsScore =
                        (portfolioAnalytics.portfolioData.options.winRate ||
                          0) > 50
                          ? 1
                          : 0;
                      const profitScore =
                        (portfolioAnalytics.portfolioData.stocks.netPnl || 0) +
                          (portfolioAnalytics.portfolioData.options.netPnl ||
                            0) >
                        0
                          ? 1
                          : 0;
                      const totalScore =
                        stocksScore + optionsScore + profitScore;
                      const grade =
                        totalScore >= 3
                          ? "A"
                          : totalScore >= 2
                          ? "B"
                          : totalScore >= 1
                          ? "C"
                          : "D";
                      const color =
                        totalScore >= 3
                          ? "text-green-600"
                          : totalScore >= 2
                          ? "text-blue-600"
                          : totalScore >= 1
                          ? "text-yellow-600"
                          : "text-red-600";
                      return <span className={color}>{grade}</span>;
                    })()}
                  </div>
                  <Badge variant="outline" className="text-xs mt-1">
                    Performance Grade
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center">
                No portfolio data available
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Detailed Analytics Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          setActiveTab(value as "stocks" | "options" | "portfolio")
        }
        className="space-y-4"
      >
        <TabsList
          className={
            compact
              ? "grid w-full max-w-md grid-cols-2"
              : "grid w-full max-w-lg grid-cols-3"
          }
        >
          <TabsTrigger value="stocks">Stocks</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
          {!compact && <TabsTrigger value="portfolio">Portfolio</TabsTrigger>}
        </TabsList>

        <TabsContent value="stocks" className="space-y-4">
          <AnalyticsCards
            type="stocks"
            winRate={stocksAnalytics.winRate}
            avgGain={stocksAnalytics.averageGain}
            avgLoss={stocksAnalytics.averageLoss}
            riskRewardRatio={stocksAnalytics.riskRewardRatio}
            tradeExpectancy={stocksAnalytics.tradeExpectancy}
            netPnl={stocksAnalytics.netPnl}
            isLoading={stocksAnalytics.isLoading}
          />
        </TabsContent>

        <TabsContent value="options" className="space-y-4">
          <AnalyticsCards
            type="options"
            winRate={optionsAnalytics.winRate}
            avgGain={optionsAnalytics.averageGain}
            avgLoss={optionsAnalytics.averageLoss}
            riskRewardRatio={optionsAnalytics.riskRewardRatio}
            tradeExpectancy={optionsAnalytics.tradeExpectancy}
            netPnl={optionsAnalytics.netPnl}
            isLoading={optionsAnalytics.isLoading}
          />
        </TabsContent>

        {!compact && (
          <TabsContent value="portfolio" className="space-y-4">
            {portfolioAnalytics.isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Card key={index}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-7 w-20 mb-1" />
                      <Skeleton className="h-3 w-32" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : portfolioAnalytics.portfolioData ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Portfolio Comparison</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-green-700">
                            Best Performing Metrics
                          </h4>
                          <div className="space-y-1 text-sm">
                            {(() => {
                              const metrics = [];
                              const stocksData =
                                portfolioAnalytics.portfolioData.stocks;
                              const optionsData =
                                portfolioAnalytics.portfolioData.options;

                              if (
                                (stocksData.winRate || 0) >
                                (optionsData.winRate || 0)
                              ) {
                                metrics.push(
                                  `Stocks Win Rate: ${formatPercentage(
                                    stocksData.winRate
                                  )}`
                                );
                              } else {
                                metrics.push(
                                  `Options Win Rate: ${formatPercentage(
                                    optionsData.winRate
                                  )}`
                                );
                              }

                              if (
                                (stocksData.netPnl || 0) >
                                (optionsData.netPnl || 0)
                              ) {
                                metrics.push(
                                  `Stocks P&L: ${formatCurrency(
                                    stocksData.netPnl
                                  )}`
                                );
                              } else {
                                metrics.push(
                                  `Options P&L: ${formatCurrency(
                                    optionsData.netPnl
                                  )}`
                                );
                              }

                              if (
                                (stocksData.tradeExpectancy || 0) >
                                (optionsData.tradeExpectancy || 0)
                              ) {
                                metrics.push(
                                  `Stocks Expectancy: ${formatCurrency(
                                    stocksData.tradeExpectancy
                                  )}`
                                );
                              } else {
                                metrics.push(
                                  `Options Expectancy: ${formatCurrency(
                                    optionsData.tradeExpectancy
                                  )}`
                                );
                              }

                              return metrics.map((metric, index) => (
                                <p key={index} className="text-green-600">
                                  • {metric}
                                </p>
                              ));
                            })()}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <h4 className="font-semibold text-red-700">
                            Areas for Improvement
                          </h4>
                          <div className="space-y-1 text-sm">
                            {(() => {
                              const improvements = [];
                              const stocksData =
                                portfolioAnalytics.portfolioData.stocks;
                              const optionsData =
                                portfolioAnalytics.portfolioData.options;

                              if ((stocksData.winRate || 0) < 50) {
                                improvements.push(
                                  `Improve stocks win rate (${formatPercentage(
                                    stocksData.winRate
                                  )})`
                                );
                              }

                              if ((optionsData.winRate || 0) < 50) {
                                improvements.push(
                                  `Improve options win rate (${formatPercentage(
                                    optionsData.winRate
                                  )})`
                                );
                              }

                              if ((stocksData.netPnl || 0) < 0) {
                                improvements.push(
                                  `Stocks showing loss: ${formatCurrency(
                                    stocksData.netPnl
                                  )}`
                                );
                              }

                              if ((optionsData.netPnl || 0) < 0) {
                                improvements.push(
                                  `Options showing loss: ${formatCurrency(
                                    optionsData.netPnl
                                  )}`
                                );
                              }

                              if (improvements.length === 0) {
                                improvements.push(
                                  "Great job! All metrics look healthy."
                                );
                              }

                              return improvements.map((improvement, index) => (
                                <p
                                  key={index}
                                  className={
                                    improvements[0].includes("Great job")
                                      ? "text-green-600"
                                      : "text-red-600"
                                  }
                                >
                                  • {improvement}
                                </p>
                              ));
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-muted-foreground text-center">
                    No portfolio data available
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
