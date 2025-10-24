"use client";

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  Shield, 
  BarChart3, 
  Globe, 
  Search, 
  Brain,
  Activity,
  Clock,
  Zap,
  Calendar,
  LogIn
} from 'lucide-react';
import { TradingPatternsCard } from './trading-patterns';
import { RiskAssessmentCard } from './risk-assessment';
import { PerformanceAnalysisCard } from './performance-analysis';
import { MarketAnalysisCard } from './market-analysis';
import { OpportunityDetectionCard } from './opportunity-detection';
import { BehavioralAnalysisCard } from './behavioural-analysis';
import { TimeRange } from '@/lib/types/ai-insights';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface InsightsTabProps {
  timeRange?: TimeRange;
  className?: string;
}

export function InsightsTab({ timeRange = '30d', className }: InsightsTabProps) {
  const [activeTab, setActiveTab] = useState('trading-patterns');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

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

  const tabs = [
    {
      id: 'trading-patterns',
      label: 'Trading Patterns',
      icon: TrendingUp,
      description: 'Analyze recurring trading strategies and behavioral patterns',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    {
      id: 'risk-assessment',
      label: 'Risk Assessment',
      icon: Shield,
      description: 'Evaluate portfolio risks and risk management practices',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
    },
    {
      id: 'performance-analysis',
      label: 'Performance Analysis',
      icon: BarChart3,
      description: 'Review trading metrics and profitability analysis',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    {
      id: 'market-analysis',
      label: 'Market Analysis',
      icon: Globe,
      description: 'Understand market conditions and sector performance',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    {
      id: 'opportunity-detection',
      label: 'Opportunity Detection',
      icon: Search,
      description: 'Identify potential trading opportunities and market inefficiencies',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
    },
    {
      id: 'behavioral-analysis',
      label: 'Behavioral Analysis',
      icon: Brain,
      description: 'Analyze trading psychology and decision-making patterns',
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-200',
    },
  ];

  const getTabIcon = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    return tab ? tab.icon : Activity;
  };

  const getTabColor = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
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
                  Please log in to access AI-powered trading insights and analysis
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
          {/* Insights Header */}
          {/*
          <div className="mb-6">
            <Card className="border-0 shadow-none bg-muted/30">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <div>
                    <CardTitle className="text-lg">AI Insights Dashboard</CardTitle>
                    <CardDescription>
                      Analyze your trading patterns and performance for {formatTimeRange(timeRange)}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </div>
          */}
          
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Tab Navigation */}
        <div className="mb-6">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 gap-2 p-1 bg-muted/50">
            {tabs.map((tab) => {
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
              <div className="flex items-center gap-3">
                {(() => {
                  const Icon = getTabIcon(activeTab);
                  const color = getTabColor(activeTab);
                  return <Icon className={cn("h-6 w-6", color)} />;
                })()}
                <div>
                  <CardTitle className="text-xl">
                    {tabs.find(t => t.id === activeTab)?.label}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {tabs.find(t => t.id === activeTab)?.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Tab Content Cards */}
          <TabsContent value="trading-patterns" className="mt-0">
            <TradingPatternsCard timeRange={timeRange} />
          </TabsContent>

          <TabsContent value="risk-assessment" className="mt-0">
            <RiskAssessmentCard timeRange={timeRange} />
          </TabsContent>

          <TabsContent value="performance-analysis" className="mt-0">
            <PerformanceAnalysisCard timeRange={timeRange} />
          </TabsContent>

          <TabsContent value="market-analysis" className="mt-0">
            <MarketAnalysisCard timeRange={timeRange} />
          </TabsContent>

          <TabsContent value="opportunity-detection" className="mt-0">
            <OpportunityDetectionCard timeRange={timeRange} />
          </TabsContent>

          <TabsContent value="behavioral-analysis" className="mt-0">
            <BehavioralAnalysisCard timeRange={timeRange} />
          </TabsContent>
        </div>

        {/* Quick Stats Footer */}
        <div className="mt-8 pt-6 border-t">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>Analysis Period: {formatTimeRange(timeRange)}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Zap className="h-4 w-4" />
                <span>AI-Powered Insights</span>
              </div>
              <Badge variant="outline" className="text-xs">
                Real-time Analysis
              </Badge>
            </div>
          </div>
        </div>
      </Tabs>
        </>
      )}
    </div>
  );
}
