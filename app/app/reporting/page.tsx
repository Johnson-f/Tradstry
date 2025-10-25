"use client";

import { useState, useRef } from "react";
import { Plus, Brain, FileText, Zap, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { InsightsTab, ReportTab } from "@/components/reporting";
import { InsightsTabRef } from "@/components/reporting/insights/tab";
import { ReportTabRef } from "@/components/reporting/report/tab";
import { TimeRange } from "@/lib/types/ai-reports";
import { toast } from "sonner";

export default function ReportingPage() {
  const [activeTab, setActiveTab] = useState("insights");
  const [selectedTimeRange, setSelectedTimeRange] = useState<TimeRange>("30d");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Refs to access child component methods
  const insightsTabRef = useRef<InsightsTabRef | null>(null);
  const reportTabRef = useRef<ReportTabRef | null>(null);

  const timeRangeOptions = [
    { value: '7d', label: 'Last 7 Days', description: 'Recent week analysis' },
    { value: '30d', label: 'Last 30 Days', description: 'Monthly overview' },
    { value: '90d', label: 'Last 90 Days', description: 'Quarterly analysis' },
    { value: 'ytd', label: 'Year to Date', description: 'Current year performance' },
    { value: '1y', label: 'Last Year', description: 'Annual comparison' },
  ];

  const handleGenerateAnalysis = async () => {
    if (isGenerating) return;
    
    setIsGenerating(true);
    
    try {
      if (activeTab === "insights") {
        // Get the current active insight tab from the InsightsTab component
        const currentInsightTab = insightsTabRef.current?.getCurrentTab() || 'trading-patterns';
        console.log('Generating insight for tab:', currentInsightTab);
        
        if (insightsTabRef.current?.generateInsight) {
          await insightsTabRef.current.generateInsight(currentInsightTab);
          toast.success(`Generating ${currentInsightTab.replace('-', ' ')} insight...`);
        } else {
          toast.error("Insights generation not available");
        }
      } else if (activeTab === "reports") {
        // Get the current active report tab from the ReportTab component
        const currentReportTab = reportTabRef.current?.getCurrentTab() || 'comprehensive';
        
        if (reportTabRef.current?.generateReport) {
          await reportTabRef.current.generateReport(currentReportTab);
          toast.success(`Generating ${currentReportTab} report...`);
        } else {
          toast.error("Report generation not available");
        }
      }
    } catch (error) {
      console.error('Error generating analysis:', error);
      toast.error("Failed to generate analysis. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
             
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Reporting</h1>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              AI-Powered
            </Badge>
            <Button 
              className="flex items-center gap-2"
              onClick={handleGenerateAnalysis}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Generating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Generate Analysis
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main content - Scrollable area with ScrollArea */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-8">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              {/* Tab Navigation with Time Period Switch */}
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <TabsList className="grid w-full grid-cols-2 max-w-lg">
                    <TabsTrigger 
                      value="insights" 
                      className="flex items-center gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:border-blue-200"
                    >
                      <Brain className="h-4 w-4" />
                      <span>AI Insights</span>
                      <Badge variant="secondary" className="ml-1 text-xs">
                        Real-time
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger 
                      value="reports" 
                      className="flex items-center gap-2 data-[state=active]:bg-green-50 data-[state=active]:text-green-700 data-[state=active]:border-green-200"
                    >
                      <FileText className="h-4 w-4" />
                      <span>AI Reports</span>
                      <Badge variant="secondary" className="ml-1 text-xs">
                        Comprehensive
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Time Period Switch */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Time Range:</span>
                    </div>
                    <Select value={selectedTimeRange} onValueChange={(value: TimeRange) => setSelectedTimeRange(value)}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Select time range" />
                      </SelectTrigger>
                      <SelectContent>
                        {timeRangeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex flex-col">
                              <span className="font-medium">{option.label}</span>
                              <span className="text-xs text-muted-foreground">{option.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Tab Description */}
              {/*
              <div className="mb-6">
                <Card className="border-0 shadow-none bg-muted/30">
                  <CardContent className="py-4">
                    {activeTab === "insights" ? (
                      <div className="flex items-center gap-3">
                        <Brain className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium text-blue-900">AI Insights Dashboard</p>
                          <p className="text-xs text-blue-700">
                            Get real-time AI-powered insights into your trading patterns, risk assessment, 
                            performance analysis, and behavioral patterns.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-green-900">AI Reports Dashboard</p>
                          <p className="text-xs text-green-700">
                            Generate comprehensive AI-powered reports with detailed analysis, 
                            recommendations, and professional insights for your trading performance.
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              */}

              {/* Tab Content */}
              <TabsContent value="insights" className="mt-0">
                <InsightsTab 
                  ref={insightsTabRef}
                  timeRange={selectedTimeRange} 
                />
              </TabsContent>

              <TabsContent value="reports" className="mt-0">
                <ReportTab 
                  ref={reportTabRef}
                  timeRange={selectedTimeRange} 
                />
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}