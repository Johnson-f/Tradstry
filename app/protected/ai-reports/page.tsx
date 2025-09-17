"use client";

import { AIReportsDashboard } from '@/components/ai-reports/ai-reports-dashboard';

export default function AireportsPage() {
  return (
    <div className="h-screen flex flex-col">
      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            <AIReportsDashboard />
          </div>
        </div>
      </div>
    </div>
  );
}
