"use client";

import React, { useState } from 'react';
import { useAIReports } from '@/hooks/use-ai-reports';
import { useAIInsights } from '@/hooks/use-ai-insights';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PlusIcon, BrainIcon, FileTextIcon, TrendingUpIcon, AlertTriangleIcon, RefreshCwIcon } from 'lucide-react';
import { ReportGenerationDialog } from './report-generation-dialog';
import { ReportDetailsDialog } from './report-details-dialog';
import { InsightsManagement } from './insights-management';
import type { AIReport } from '@/lib/services/ai-reports-service';
import type { AIInsight } from '@/lib/services/ai-insights-service';

export function AIReportsDashboard() {
  const [selectedReport, setSelectedReport] = useState<AIReport | null>(null);
  const [isGenerationDialogOpen, setIsGenerationDialogOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);

  const {
    reports,
    reportsLoading,
    reportsError,
    tradingContext,
    tradingContextLoading,
    generateReport,
    refetchReports,
  } = useAIReports();

  const {
    priorityInsights,
    priorityInsightsLoading,
    priorityInsightsError,
    actionableInsights,
    actionableInsightsLoading,
    actionableInsightsError,
    refetchPriorityInsights,
    refetchActionableInsights,
  } = useAIInsights({ priorityLimit: 5, actionableLimit: 10 });

  const handleReportClick = (report: AIReport) => {
    setSelectedReport(report);
    setIsDetailsDialogOpen(true);
  };

  const handleGenerateReport = () => {
    setIsGenerationDialogOpen(true);
  };

  const handleRefresh = () => {
    refetchReports();
    refetchPriorityInsights();
    refetchActionableInsights();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">AI Reports & Insights</h2>
          <p className="text-muted-foreground">
            AI-powered analysis of your trading performance and market insights
          </p>
        </div>
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

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
            <FileTextIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reports.length}</div>
            <p className="text-xs text-muted-foreground">
              Generated this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Priority Insights</CardTitle>
            <AlertTriangleIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{priorityInsights.length}</div>
            <p className="text-xs text-muted-foreground">
              Require attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actionable Items</CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{actionableInsights.length}</div>
            <p className="text-xs text-muted-foreground">
              Ready to implement
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="reports" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="management">Management</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Reports</CardTitle>
              <CardDescription>
                Your latest AI-generated trading reports and analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reportsError && (
                <Alert variant="destructive">
                  <AlertTriangleIcon className="h-4 w-4" />
                  <AlertDescription>
                    Failed to load reports: {reportsError.message}
                  </AlertDescription>
                </Alert>
              )}

              {reportsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4">
                      <Skeleton className="h-12 w-12 rounded-lg" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-[250px]" />
                        <Skeleton className="h-4 w-[200px]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : reports.length === 0 ? (
                <div className="text-center py-8">
                  <BrainIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold">No reports yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Generate your first AI report to get started
                  </p>
                  <Button onClick={handleGenerateReport}>
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Generate Report
                  </Button>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {reports.map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer"
                        onClick={() => handleReportClick(report)}
                      >
                        <div className="flex items-center space-x-4">
                          <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                            <FileTextIcon className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <h4 className="font-medium">{report.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              {new Date(report.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant={report.status === 'completed' ? 'default' : 'secondary'}>
                            {report.status}
                          </Badge>
                          <Badge variant="outline">{report.report_type}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Priority Insights */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangleIcon className="h-5 w-5" />
                  Priority Insights
                </CardTitle>
                <CardDescription>
                  High-priority insights that need your attention
                </CardDescription>
              </CardHeader>
              <CardContent>
                {priorityInsightsError && (
                  <Alert variant="destructive">
                    <AlertTriangleIcon className="h-4 w-4" />
                    <AlertDescription>
                      Failed to load priority insights: {priorityInsightsError.message}
                    </AlertDescription>
                  </Alert>
                )}

                {priorityInsightsLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : priorityInsights.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No priority insights at the moment
                  </p>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {priorityInsights.map((insight) => (
                        <div key={insight.id} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <Badge variant="destructive" className="text-xs">
                              {insight.priority}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(insight.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm">{insight.content}</p>
                          {insight.tags && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {insight.tags.map((tag, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Actionable Insights */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUpIcon className="h-5 w-5" />
                  Actionable Insights
                </CardTitle>
                <CardDescription>
                  Insights you can act on to improve your trading
                </CardDescription>
              </CardHeader>
              <CardContent>
                {actionableInsightsError && (
                  <Alert variant="destructive">
                    <AlertTriangleIcon className="h-4 w-4" />
                    <AlertDescription>
                      Failed to load actionable insights: {actionableInsightsError.message}
                    </AlertDescription>
                  </Alert>
                )}

                {actionableInsightsLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : actionableInsights.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">
                    No actionable insights available
                  </p>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                      {actionableInsights.map((insight) => (
                        <div key={insight.id} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between mb-2">
                            <Badge variant="default" className="text-xs">
                              Actionable
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(insight.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm">{insight.content}</p>
                          {insight.action_items && (
                            <div className="mt-2">
                              <p className="text-xs font-medium mb-1">Action Items:</p>
                              <ul className="text-xs space-y-1">
                                {insight.action_items.map((item, idx) => (
                                  <li key={idx} className="flex items-center gap-2">
                                    <div className="h-1 w-1 bg-current rounded-full" />
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="management">
          <InsightsManagement />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ReportGenerationDialog
        open={isGenerationDialogOpen}
        onOpenChange={setIsGenerationDialogOpen}
        onGenerate={generateReport.mutate}
        isGenerating={generateReport.isPending}
      />

      <ReportDetailsDialog
        open={isDetailsDialogOpen}
        onOpenChange={setIsDetailsDialogOpen}
        report={selectedReport}
      />
    </div>
  );
}
