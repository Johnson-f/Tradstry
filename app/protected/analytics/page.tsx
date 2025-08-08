"use client";

import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export default function AnalyticsSectionPage() {
  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
      </div>

      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            <AnalyticsDashboard
              showPortfolioOverview={true}
              defaultTab="stocks"
              compact={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
