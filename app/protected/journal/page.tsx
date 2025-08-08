"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useStocks } from "@/lib/hooks/use-stocks";
import { useOptions } from "@/lib/hooks/use-options";
import { AnalyticsDashboard } from "@/components/journal/analytics-dashboard";
import { StocksTable } from "@/components/journal/stocks-table";
import { OptionsTable } from "@/components/journal/options-table";

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState("stocks");
  const { stocks, error: stocksError, isLoading: stocksLoading } = useStocks();
  const { error: optionsError, isLoading: optionsLoading } = useOptions();

  const isLoading = activeTab === "stocks" ? stocksLoading : optionsLoading;
  const error = activeTab === "stocks" ? stocksError : optionsError;

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col">
        <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
          <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="p-8">
              <AnalyticsDashboard />
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
            <AnalyticsDashboard />

            <Tabs
              defaultValue="stocks"
              className="space-y-4"
              onValueChange={(value) => setActiveTab(value)}
            >
              <div className="flex items-center justify-between">
                <TabsList>
                  <TabsTrigger value="stocks">Stocks</TabsTrigger>
                  <TabsTrigger value="options">Options</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="stocks" className="space-y-4">
                <StocksTable stocks={stocks || []} isLoading={stocksLoading} />
              </TabsContent>

              <TabsContent value="options" className="space-y-4">
                <OptionsTable />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
