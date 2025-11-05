"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KeyStats } from "./key-stats";
import { IncomeStatement } from "./income-statement";
import { BalanceSheet } from "./balance-sheet";
import { CashFlow } from "./cash-flow";

interface FinancialsProps {
  symbol: string;
  className?: string;
}

export function Financials({ symbol, className }: FinancialsProps) {
  const [frequency, setFrequency] = useState<"annual" | "quarterly">("annual");

  return (
    <div className={cn("space-y-4", className)}>
      <Tabs defaultValue="key-stats" className="w-full">
        {/* Header with Tabs and Controls */}
        <div className="flex items-center justify-between mb-4">
          <TabsList className="bg-muted/50 h-9 inline-flex">
            <TabsTrigger
              value="key-stats"
              className="data-[state=active]:bg-teal-500 data-[state=active]:text-white px-4"
            >
              Key Stats
            </TabsTrigger>
            <TabsTrigger
              value="income-statement"
              className="data-[state=active]:bg-teal-500 data-[state=active]:text-white px-4"
            >
              Income Statement
            </TabsTrigger>
            <TabsTrigger
              value="balance-sheet"
              className="data-[state=active]:bg-teal-500 data-[state=active]:text-white px-4"
            >
              Balance Sheet
            </TabsTrigger>
            <TabsTrigger
              value="cash-flow"
              className="data-[state=active]:bg-teal-500 data-[state=active]:text-white px-4"
            >
              Cash Flow
            </TabsTrigger>
          </TabsList>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as "annual" | "quarterly")}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="annual">Annual</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
        </div>

        {/* Tab Content */}
        <TabsContent value="key-stats" className="mt-0">
          <KeyStats symbol={symbol} frequency={frequency} />
        </TabsContent>
        <TabsContent value="income-statement" className="mt-0">
          <IncomeStatement symbol={symbol} frequency={frequency} />
        </TabsContent>
        <TabsContent value="balance-sheet" className="mt-0">
          <BalanceSheet symbol={symbol} frequency={frequency} />
        </TabsContent>
        <TabsContent value="cash-flow" className="mt-0">
          <CashFlow symbol={symbol} frequency={frequency} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Financials;

