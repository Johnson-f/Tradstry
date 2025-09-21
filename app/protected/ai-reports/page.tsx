"use client";

import { useState } from 'react';
import { AIReportsDashboard } from '@/components/ai-reports/ai-reports-dashboard';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useAIReports } from '@/hooks/use-ai-reports';
import { useAIInsights } from '@/hooks/use-ai-insights';
import { ReportGenerationDialog } from '@/components/ai-reports/report-generation-dialog';

export default function AireportsPage() {
  const [isGenerationDialogOpen, setIsGenerationDialogOpen] = useState(false);

  const {
    generateReport,
    refetchReports,
  } = useAIReports();

  const {
    refetchPriorityInsights,
    refetchActionableInsights,
  } = useAIInsights({ priorityLimit: 5, actionableLimit: 10 });

  const handleGenerateReport = () => {
    setIsGenerationDialogOpen(true);
  };

  const handleRefresh = () => {
    refetchReports();
    refetchPriorityInsights();
    refetchActionableInsights();
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">AI Reports & Insights</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleRefresh}>
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={handleGenerateReport}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main content - Scrollable area with shadcn ScrollArea */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-8">
            <AIReportsDashboard />
          </div>
        </ScrollArea>
      </div>

      {/* Report Generation Dialog */}
      <ReportGenerationDialog
        open={isGenerationDialogOpen}
        onOpenChange={setIsGenerationDialogOpen}
        onGenerate={generateReport.mutate}
        isGenerating={generateReport.isPending}
      />
    </div>
  );
}
