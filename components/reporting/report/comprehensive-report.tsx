"use client";

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  AlertCircle, 
  FileText, 
  TrendingUp, 
  Target, 
  Lightbulb, 
  Clock, 
  BarChart3, 
  Activity,
  DollarSign,
  Percent,
  Shield,
  Brain,
  Download,
  Eye,
  Trash2
} from 'lucide-react';
import { useAIReports } from '@/hooks/use-ai-reports';
import { TimeRange, ReportType } from '@/lib/types/ai-reports';
import { cn } from '@/lib/utils';

interface ComprehensiveReportCardProps {
  timeRange?: TimeRange;
  className?: string;
}

export function ComprehensiveReportCard({ timeRange = '30d', className }: ComprehensiveReportCardProps) {
  const {
    reports,
    currentReport,
    loading,
    generating,
    error,
    generateReport,
    getReport,
    deleteReport,
    clearError,
    clearCurrentReport,
  } = useAIReports();

  // Find comprehensive report for the specified time range
  const comprehensiveReport = reports.find(
    report => report.report_type === 'comprehensive' && report.time_range === timeRange
  );

  // Load comprehensive report if not already loaded
  useEffect(() => {
    console.log('Comprehensive report effect triggered:', {
      reportFound: !!comprehensiveReport,
      reportId: comprehensiveReport?.id,
      currentReportId: currentReport?.id,
      loading,
      error: error?.message
    });

    // Don't try to load report if reports list is still loading
    if (loading) {
      console.log('Reports list still loading, skipping report load');
      return;
    }

    if (comprehensiveReport && (!currentReport || currentReport.id !== comprehensiveReport.id)) {
      console.log('Attempting to load comprehensive report:', comprehensiveReport.id);
      getReport(comprehensiveReport.id).catch((error) => {
        console.error('Failed to load comprehensive report:', error);
        // Don't retry on error - let the error state handle it
      });
    }
  }, [comprehensiveReport, currentReport, getReport, loading, error]);

  const handleGenerateReport = async () => {
    try {
      await generateReport({
        time_range: timeRange,
        report_type: 'comprehensive',
        sections: ['summary', 'analytics', 'insights', 'trades', 'patterns', 'recommendations', 'risk_analysis', 'performance_metrics', 'behavioral_analysis'],
        include_predictions: true,
        force_regenerate: false,
      });
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleViewReport = () => {
    if (comprehensiveReport) {
      getReport(comprehensiveReport.id).catch(() => {
        // Error handled by hook
      });
    }
  };

  const handleDeleteReport = async () => {
    if (comprehensiveReport) {
      try {
        await deleteReport(comprehensiveReport.id);
      } catch (error) {
        // Error handled by hook
      }
    }
  };

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

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercentage = (value: number): string => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const getRiskScoreColor = (score: number): string => {
    if (score >= 0.8) return 'text-red-600 bg-red-50';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  const getRiskScoreText = (score: number): string => {
    if (score >= 0.8) return 'High Risk';
    if (score >= 0.6) return 'Medium Risk';
    return 'Low Risk';
  };

  if (loading && !comprehensiveReport && !currentReport) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-9 w-32" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  // Show generate option when no reports exist (not loading and no reports found)
  if (!loading && !comprehensiveReport && !currentReport) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Comprehensive Report
              </CardTitle>
              <CardDescription>
                {formatTimeRange(timeRange)} Complete Analysis
              </CardDescription>
            </div>
            <Button 
              onClick={handleGenerateReport}
              disabled={generating}
              className="flex items-center gap-2"
            >
              {generating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Comprehensive Report Found</h3>
            <p className="text-muted-foreground mb-4">
              Generate a comprehensive report to get a complete analysis of your trading performance, 
              risk metrics, behavioral patterns, and market insights.
            </p>
            <Button onClick={handleGenerateReport} disabled={generating}>
              {generating ? 'Generating Report...' : 'Generate Comprehensive Report'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("w-full border-red-200", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <CardTitle className="text-red-700">Comprehensive Report</CardTitle>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={clearError}
            >
              Retry
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-red-600 text-sm">
            Failed to load comprehensive report. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const report = currentReport || comprehensiveReport;
  const isExpired = report?.expires_at && new Date(report.expires_at) < new Date();

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {report?.title || 'Comprehensive Trading Report'}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {formatTimeRange(timeRange)}
              {isExpired && (
                <Badge variant="destructive" className="text-xs">
                  Expired
                </Badge>
              )}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleViewReport}
              disabled={loading}
            >
              <Eye className="h-4 w-4 mr-1" />
              View
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleGenerateReport}
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Refresh'}
            </Button>
            {comprehensiveReport && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleDeleteReport}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Report Summary */}
        {currentReport?.summary && (
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-medium text-sm text-blue-900 mb-2">Executive Summary</h4>
            <p className="text-sm text-blue-800">{currentReport.summary}</p>
          </div>
        )}

        {/* Key Metrics Grid */}
        {currentReport?.analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="text-xs font-medium text-green-900">Total P&L</span>
              </div>
              <p className="text-lg font-semibold text-green-800">
                {formatCurrency(currentReport.analytics.total_pnl)}
              </p>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <Percent className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-medium text-blue-900">Win Rate</span>
              </div>
              <p className="text-lg font-semibold text-blue-800">
                {formatPercentage(currentReport.analytics.win_rate)}
              </p>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-medium text-purple-900">Total Trades</span>
              </div>
              <p className="text-lg font-semibold text-purple-800">
                {currentReport.analytics.total_trades}
              </p>
            </div>

            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-medium text-gray-900">Risk Score</span>
              </div>
              <div className="flex items-center gap-2">
                <p className={cn("text-lg font-semibold px-2 py-1 rounded", getRiskScoreColor(currentReport.risk_metrics.risk_score))}>
                  {getRiskScoreText(currentReport.risk_metrics.risk_score)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Performance Metrics */}
        {currentReport?.performance_metrics && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <h4 className="font-medium text-sm">Performance Metrics</h4>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Sharpe Ratio</p>
                <p className="font-medium">{currentReport.analytics.sharpe_ratio.toFixed(2)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Max Drawdown</p>
                <p className="font-medium text-red-600">
                  {formatPercentage(currentReport.analytics.max_drawdown)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Profit Factor</p>
                <p className="font-medium">{currentReport.analytics.profit_factor.toFixed(2)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Average Trade</p>
                <p className="font-medium">
                  {formatCurrency(currentReport.analytics.average_gain - currentReport.analytics.average_loss)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Key Recommendations */}
        {currentReport?.recommendations && currentReport.recommendations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-sm">Key Recommendations</h4>
            </div>
            <div className="space-y-2">
              {currentReport.recommendations.slice(0, 3).map((recommendation, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="h-2 w-2 bg-amber-600 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-sm text-amber-900">{recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trading Patterns Summary */}
        {currentReport?.patterns && currentReport.patterns.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600" />
              <h4 className="font-medium text-sm">Trading Patterns</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentReport.patterns.slice(0, 4).map((pattern, index) => (
                <div key={index} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-blue-900">{pattern.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {formatPercentage(pattern.confidence_score)}
                    </Badge>
                  </div>
                  <p className="text-xs text-blue-800">{pattern.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Behavioral Insights */}
        {currentReport?.behavioral_insights && currentReport.behavioral_insights.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-pink-600" />
              <h4 className="font-medium text-sm">Behavioral Insights</h4>
            </div>
            <div className="space-y-2">
              {currentReport.behavioral_insights.slice(0, 2).map((insight, index) => (
                <div key={index} className="p-3 bg-pink-50 rounded-lg border border-pink-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-pink-900">{insight.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {formatPercentage(insight.confidence_score)}
                    </Badge>
                  </div>
                  <p className="text-xs text-pink-800">{insight.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Report Metadata */}
        {currentReport?.metadata && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-gray-600" />
              <h4 className="font-medium text-sm">Report Details</h4>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Trades Analyzed</p>
                <p className="font-medium">{currentReport.metadata.trade_count}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Analysis Period</p>
                <p className="font-medium">{currentReport.metadata.analysis_period_days} days</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Data Quality</p>
                <p className="font-medium text-green-600">
                  {formatPercentage(currentReport.metadata.data_quality_score)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Processing Time</p>
                <p className="font-medium">{currentReport.metadata.generation_time_ms}ms</p>
              </div>
            </div>
          </div>
        )}

        {/* Generated At */}
        {currentReport?.generated_at && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Generated: {new Date(currentReport.generated_at).toLocaleString()}
            {currentReport.expires_at && (
              <span className="ml-2">
                • Expires: {new Date(currentReport.expires_at).toLocaleString()}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
