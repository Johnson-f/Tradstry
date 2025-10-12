"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { StocksTable } from "@/components/journal/stocks-table";
import { OptionsTable } from "@/components/journal/options-table";
import { TradeNotesHistoryModal } from "@/components/journal/trade-notes-history-modal";

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState<"stocks" | "options">("stocks");
  const [notesHistoryOpen, setNotesHistoryOpen] = useState(false);


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
                {/* Analytics temporarily disabled */}
                {/* <AnalyticsSummary
                  type={activeTab}
                  winRate={winRate}
                  netPnl={netPnl}
                  tradeExpectancy={tradeExpectancy}
                  totalTrades={totalTrades}
                  averageGain={averageGain}
                  averageLoss={averageLoss}
                  riskRewardRatio={riskRewardRatio}
                  isLoading={analyticsLoading}
                /> */}
                <StocksTable />
              </TabsContent>

              <TabsContent value="options" className="space-y-4">
                {/* Analytics temporarily disabled */}
                {/* <AnalyticsSummary
                  type={activeTab}
                  winRate={winRate}
                  netPnl={netPnl}
                  tradeExpectancy={tradeExpectancy}
                  totalTrades={options?.length || 0}
                  isLoading={analyticsLoading}
                /> */}
                <OptionsTable />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <TradeNotesHistoryModal
        open={notesHistoryOpen}
        onOpenChange={setNotesHistoryOpen}
      />
    </div>
  );
}
