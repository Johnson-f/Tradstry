"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InsightsTab } from "@/components/reporting";

export default function ReportingPage() {

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Reporting</h1>
          <Button className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Generate Insights
          </Button>
        </div>
      </div>
      
      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            <InsightsTab />
          </div>
        </div>
      </div>
    </div>
  );
}