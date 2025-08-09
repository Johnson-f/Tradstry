"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useStocks } from "@/lib/hooks/use-stocks";
import { useOptions } from "@/lib/hooks/use-options";
import { useAnalytics, type AnalyticsFilters } from "@/lib/hooks/use-analytics";

import { StocksTable } from "@/components/journal/stocks-table";
import { OptionsTable } from "@/components/journal/options-table";
import { AnalyticsSummary } from "@/components/analytics/analytics-summary";
import { DateRangePicker } from "@/components/analytics/date-range-picker";

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState<"stocks" | "options">("stocks");
  const [filters, setFilters] = useState<AnalyticsFilters>({
    periodType: "all_time",
    customStartDate: null,
    customEndDate: null,
  });

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
    averageGain,
    averageLoss,
    riskRewardRatio,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useAnalytics(activeTab, filters);

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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
          <DateRangePicker 
            onDateChange={({ startDate, endDate, periodType }) => {
              setFilters({
                periodType,
                customStartDate: startDate,
                customEndDate: endDate,
              });
            }}
          />
        </div>
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
                  type={activeTab}
                  winRate={winRate}
                  netPnl={netPnl}
                  tradeExpectancy={tradeExpectancy}
                  totalTrades={totalTrades}
                  averageGain={averageGain}
                  averageLoss={averageLoss}
                  riskRewardRatio={riskRewardRatio}
                  isLoading={analyticsLoading}
                />
                <StocksTable stocks={stocks || []} isLoading={stocksLoading} />
              </TabsContent>

              <TabsContent value="options" className="space-y-4">
                <AnalyticsSummary
                  type={activeTab}
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
