"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfitCalendar } from "@/components/analytics/tabs/profit-calendar";
import { DurationPlaybookPerformance } from "@/components/analytics/tabs/performance/duration-playbook";
import { OpenTradesTable } from "@/components/analytics/tabs/open-trades-table";

export default function AnalyticsSectionPage() {
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        </div>
      </div>

      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="calendar">Calendar</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="risk">Risk</TabsTrigger>
              </TabsList>

              <div className="mt-6">
                <TabsContent value="overview" className="mt-0 space-y-6">
                  <OpenTradesTable />
                </TabsContent>

                <TabsContent value="calendar" className="mt-0">
                  <ProfitCalendar />
                </TabsContent>

                <TabsContent value="performance" className="mt-0">
                  <DurationPlaybookPerformance />
                </TabsContent>

                <TabsContent value="risk" className="mt-0">
                  {/* Risk content - empty for now */}
                  <div className="text-center py-12 text-muted-foreground">
                    Risk content coming soon
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}