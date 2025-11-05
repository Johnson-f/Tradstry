"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Financials } from "./financials";

interface SymbolTabsProps {
  symbol: string;
  className?: string;
}

export function SymbolTabs({ symbol, className }: SymbolTabsProps) {
  return (
    <div className={cn("w-full", className)}>
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="bg-transparent h-auto p-0 gap-2 inline-flex">
          <TabsTrigger
            value="overview"
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-all",
              "border border-border bg-muted/50 text-muted-foreground",
              "data-[state=active]:bg-teal-500 data-[state=active]:text-teal-50",
              "data-[state=active]:border-teal-500 data-[state=active]:shadow-none",
              "hover:bg-muted/70"
            )}
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="financials"
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-all",
              "border border-border bg-muted/50 text-muted-foreground",
              "data-[state=active]:bg-teal-500 data-[state=active]:text-teal-50",
              "data-[state=active]:border-teal-500 data-[state=active]:shadow-none",
              "hover:bg-muted/70"
            )}
          >
            Financials
          </TabsTrigger>
          <TabsTrigger
            value="earnings"
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-all",
              "border border-border bg-muted/50 text-muted-foreground",
              "data-[state=active]:bg-teal-500 data-[state=active]:text-teal-50",
              "data-[state=active]:border-teal-500 data-[state=active]:shadow-none",
              "hover:bg-muted/70"
            )}
          >
            Earnings
          </TabsTrigger>
          <TabsTrigger
            value="holders"
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-all",
              "border border-border bg-muted/50 text-muted-foreground",
              "data-[state=active]:bg-teal-500 data-[state=active]:text-teal-50",
              "data-[state=active]:border-teal-500 data-[state=active]:shadow-none",
              "hover:bg-muted/70"
            )}
          >
            Holders
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="overview" className="mt-0">
            <div className="space-y-6">
              {/* Overview content will go here */}
              <div className="text-sm text-muted-foreground">Overview content coming soon</div>
            </div>
          </TabsContent>
          <TabsContent value="financials" className="mt-0">
            <Financials symbol={symbol} />
          </TabsContent>
          <TabsContent value="earnings" className="mt-0">
            <div className="text-sm text-muted-foreground">Earnings content coming soon</div>
          </TabsContent>
          <TabsContent value="holders" className="mt-0">
            <div className="text-sm text-muted-foreground">Holders content coming soon</div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default SymbolTabs;

