"use client";

import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  FileText, 
  BarChart3, 
  Shield, 
  TrendingUp, 
  Brain,
  Globe,
  Activity,
  Clock,
  Zap,
  Calendar,
  LogIn,
  Download
} from 'lucide-react';
import { 
  ComprehensiveReportCard,
  PerformanceReportCard,
  RiskReportCard,
  TradingReportCard,
  BehavioralReportCard,
  MarketReportCard
} from './index';
import { TimeRange, ReportType } from '@/lib/types/ai-reports';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useAIReports } from '@/hooks/use-ai-reports';

interface ReportTabProps {
  timeRange?: TimeRange;
  className?: string;
}

export interface ReportTabRef {
  generateReport: (reportType: string) => Promise<void>;
  getCurrentTab: () => string;
}

export const ReportTab = forwardRef<ReportTabRef, ReportTabProps>(({ timeRange = '30d', className }, ref) => {
  const [activeTab, setActiveTab] = useState<ReportType>('comprehensive');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  
  const { generateReport } = useAIReports();

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    generateReport: async (reportType: string) => {
      try {
        await generateReport({
          time_range: timeRange,
          report_type: reportType as ReportType,
          include_trades: true,
          include_patterns: true,
          include_risk_analysis: true,
          include_behavioral_analysis: true,
          include_market_analysis: true,
        });
      } catch (error) {
        console.error('Error generating report:', error);
        throw error;
      }
    },
    getCurrentTab: () => activeTab,
  }));

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        setIsAuthenticated(!!session?.access_token);
      } catch (error) {
        console.error('Error checking authentication:', error);
        setIsAuthenticated(false);
      }
    };

    checkAuth();

    // Listen for auth changes
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session?.access_token);
    });

    return () => subscription.unsubscribe();
  }, []);

  const formatTimeRange = (range: TimeRange): string => {
    switch (range) {
      case '7d':
        return 'Last 7 Days';
      case '30d':
        return 'Last 30 Days';
      case '90d':
        return 'Last 90 Days';
      case 'ytd':
        return 'Year to Date';
      case '1y':
        return 'Last Year';
      default:
        return 'Custom Range';
    }
  };

  const reportTabs = [
    {
      id: 'comprehensive' as ReportType,
      label: 'Comprehensive',
      icon: FileText,
      description: 'Complete trading analysis with all metrics and insights',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    {
      id: 'performance' as ReportType,
      label: 'Performance',
      icon: BarChart3,
      description: 'Detailed performance metrics and profitability analysis',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    {
      id: 'risk' as ReportType,
      label: 'Risk Assessment',
      icon: Shield,
      description: 'Portfolio risk analysis and risk management recommendations',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    {
      id: 'trading' as ReportType,
      label: 'Trading Analysis',
      icon: TrendingUp,
      description: 'Trading patterns, strategies, and execution analysis',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
    },
    {
      id: 'behavioral' as ReportType,
      label: 'Behavioral',
      icon: Brain,
      description: 'Trading psychology and behavioral pattern analysis',
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-200',
    },
    {
      id: 'market' as ReportType,
      label: 'Market Analysis',
      icon: Globe,
      description: 'Market conditions and sector performance analysis',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
    },
  ];

  const getTabIcon = (tabId: ReportType) => {
    const tab = reportTabs.find(t => t.id === tabId);
    return tab ? tab.icon : Activity;
  };

  const getTabColor = (tabId: ReportType) => {
    const tab = reportTabs.find(t => t.id === tabId);
    return tab ? tab.color : 'text-gray-600';
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Authentication Check */}
      {isAuthenticated === false && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <LogIn className="h-5 w-5 text-amber-600" />
              <div>
                <CardTitle className="text-lg text-amber-800">Authentication Required</CardTitle>
                <CardDescription className="text-amber-700">
                  Please log in to access AI-powered trading reports and analysis
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => window.location.href = '/auth/login'}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <LogIn className="h-4 w-4 mr-2" />
              Go to Login
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isAuthenticated === null && (
        <Card className="mb-6">
          <CardContent className="py-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-muted-foreground">Checking authentication...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content - Only show if authenticated */}
      {isAuthenticated === true && (
        <>
          {/* Reports Header */}
          {/*
          <div className="mb-6">
            <Card className="border-0 shadow-none bg-muted/30">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div>
                    <CardTitle className="text-lg">AI Reports Dashboard</CardTitle>
                    <CardDescription>
                      Generate comprehensive trading reports with AI-powered analysis and insights for {formatTimeRange(timeRange)}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </div>
          */}

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ReportType)} className="w-full">
            {/* Tab Navigation */}
            <div className="mb-6">
              <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-2 p-1 bg-muted/50">
                {reportTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  
                  return (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className={cn(
                        "flex flex-col items-center gap-2 p-3 text-xs font-medium transition-all",
                        "hover:bg-background/80 data-[state=active]:bg-background",
                        "data-[state=active]:shadow-sm data-[state=active]:border",
                        isActive && cn(tab.borderColor, tab.bgColor)
                      )}
                    >
                      <Icon className={cn("h-4 w-4", isActive ? tab.color : "text-muted-foreground")} />
                      <span className={cn("text-center leading-tight", isActive ? tab.color : "text-muted-foreground")}>
                        {tab.label}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {/* Tab Content */}
            <div className="space-y-6">
              {/* Active Tab Header */}
              <Card className="border-0 shadow-none bg-muted/30">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const Icon = getTabIcon(activeTab);
                        const color = getTabColor(activeTab);
                        return <Icon className={cn("h-6 w-6", color)} />;
                      })()}
                      <div>
                        <CardTitle className="text-xl">
                          {reportTabs.find(t => t.id === activeTab)?.label} Report
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {reportTabs.find(t => t.id === activeTab)?.description}
                        </CardDescription>
                      </div>
                    </div>
                    
                  </div>
                </CardHeader>
              </Card>

              {/* Tab Content Cards */}
              <TabsContent value="comprehensive" className="mt-0">
                <ComprehensiveReportCard timeRange={timeRange} />
              </TabsContent>

              <TabsContent value="performance" className="mt-0">
                <PerformanceReportCard timeRange={timeRange} />
              </TabsContent>

              <TabsContent value="risk" className="mt-0">
                <RiskReportCard timeRange={timeRange} />
              </TabsContent>

              <TabsContent value="trading" className="mt-0">
                <TradingReportCard timeRange={timeRange} />
              </TabsContent>

              <TabsContent value="behavioral" className="mt-0">
                <BehavioralReportCard timeRange={timeRange} />
              </TabsContent>

              <TabsContent value="market" className="mt-0">
                <MarketReportCard timeRange={timeRange} />
              </TabsContent>
            </div>

            {/* Quick Stats Footer */}
            <div className="mt-8 pt-6 border-t">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Report Period: {formatTimeRange(timeRange)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <Zap className="h-4 w-4" />
                    <span>AI-Generated Reports</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    Professional Analysis
                  </Badge>
                </div>
              </div>
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
});

ReportTab.displayName = 'ReportTab';
