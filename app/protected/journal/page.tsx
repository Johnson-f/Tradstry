"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useStocks } from "@/lib/hooks/use-stocks";
import { useOptions } from "@/lib/hooks/use-options";
import { useAnalytics } from "@/lib/hooks/use-analytics";

import { StocksTable } from "@/components/journal/stocks-table";
import { OptionsTable } from "@/components/journal/options-table";
import { AnalyticsSummary } from "@/components/analytics/analytics-summary";
import { AnalyticsWidget } from "@/components/analytics/analytics-widget";

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState<"stocks" | "options">("stocks");
  const { stocks, error: stocksError, isLoading: stocksLoading } = useStocks();
  const {
    options,
    error: optionsError,
    isLoading: optionsLoading,
  } = useOptions();
  const {
    winRate,
    netPnl,
    tradeExpectancy,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useAnalytics(activeTab);

  const isLoading = activeTab === "stocks" ? stocksLoading : optionsLoading;
  const error = activeTab === "stocks" ? stocksError : optionsError;
  const totalTrades =
    activeTab === "stocks" ? stocks?.length || 0 : options?.length || 0;

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col">
        <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="p-8">
              <div className="mt-8">
                <Skeleton className="h-10 w-48 mb-4" />
                <Skeleton className="h-12 w-full rounded-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col">
        <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="p-8 text-red-500">
              Failed to load {activeTab}: {error.message}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8 space-y-8">
            {/* Quick Analytics Overview */}
            {/* <div className="grid gap-4 md:grid-cols-2">
              <AnalyticsWidget
                type="stocks"
                showViewMore={true}
                className="md:col-span-1"
              />
              <AnalyticsWidget
                type="options"
                showViewMore={true}
                className="md:col-span-1"
              />
            </div> */}

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
                  winRate={winRate}
                  netPnl={netPnl}
                  tradeExpectancy={tradeExpectancy}
                  totalTrades={stocks?.length || 0}
                  isLoading={analyticsLoading}
                />
                <StocksTable stocks={stocks || []} isLoading={stocksLoading} />
              </TabsContent>

              <TabsContent value="options" className="space-y-4">
                <AnalyticsSummary
                  type="options"
                  winRate={winRate}
                  netPnl={netPnl}
                  tradeExpectancy={tradeExpectancy}
                  totalTrades={options?.length || 0}
                  isLoading={analyticsLoading}
                />
                <OptionsTable />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
