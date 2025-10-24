"use client";

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertCircle, 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Target, 
  Lightbulb, 
  Clock, 
  Activity,
  DollarSign,
  Percent,
  Calculator,
  Eye,
  Trash2
} from 'lucide-react';
import { useAIReports } from '@/hooks/use-ai-reports';
import { TimeRange } from '@/lib/types/ai-reports';
import { cn } from '@/lib/utils';

interface PerformanceReportCardProps {
  timeRange?: TimeRange;
  className?: string;
}

export function PerformanceReportCard({ timeRange = '30d', className }: PerformanceReportCardProps) {
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
  } = useAIReports();

  // Find performance report for the specified time range
  const performanceReport = reports.find(
    report => report.report_type === 'performance' && report.time_range === timeRange
  );

  // Load performance report if not already loaded
  useEffect(() => {
    console.log('Performance report effect triggered:', {
      reportFound: !!performanceReport,
      reportId: performanceReport?.id,
      currentReportId: currentReport?.id,
      loading,
      error: error?.message
    });

    // Don't try to load report if reports list is still loading
    if (loading) {
      console.log('Reports list still loading, skipping report load');
      return;
    }

    if (performanceReport && (!currentReport || currentReport.id !== performanceReport.id)) {
      console.log('Attempting to load performance report:', performanceReport.id);
      getReport(performanceReport.id).catch((error) => {
        console.error('Failed to load performance report:', error);
        // Don't retry on error - let the error state handle it
      });
    }
  }, [performanceReport, currentReport, getReport, loading, error]);

  const handleGenerateReport = async () => {
    try {
      await generateReport({
        time_range: timeRange,
        report_type: 'performance',
        include_trades: true,
        include_patterns: true,
        include_risk_analysis: false,
        include_behavioral_analysis: false,
        include_market_analysis: false,
      });
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleViewReport = () => {
    if (performanceReport) {
      getReport(performanceReport.id).catch(() => {
        // Error handled by hook
      });
    }
  };

  const handleDeleteReport = async () => {
    if (performanceReport) {
      try {
        await deleteReport(performanceReport.id);
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

  const getPerformanceColor = (value: number): string => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  const getPerformanceIcon = (value: number) => {
    if (value > 0) return TrendingUp;
    if (value < 0) return TrendingDown;
    return BarChart3;
  };

  // Show loading skeleton only when initially loading reports list
  if (loading && reports.length === 0) {
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

  // Show generate option when no reports exist for this time range
  if (!loading && !performanceReport && !currentReport) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Performance Report
              </CardTitle>
              <CardDescription>
                {formatTimeRange(timeRange)} Performance Analysis
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Performance Report Found</h3>
            <p className="text-muted-foreground mb-4">
              Generate a performance report to analyze your trading metrics, profitability, 
              and key performance indicators.
            </p>
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
              <CardTitle className="text-red-700">Performance Report</CardTitle>
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
            Failed to load performance report. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!performanceReport && !currentReport) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Performance Report
              </CardTitle>
              <CardDescription>
                {formatTimeRange(timeRange)} Performance Analysis
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Performance Report Found</h3>
            <p className="text-muted-foreground mb-4">
              Generate a performance report to analyze your trading metrics, profitability, 
              and key performance indicators.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const report = currentReport || performanceReport;
  const isExpired = report?.expires_at && new Date(report.expires_at) < new Date();

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              {report?.title || 'Performance Analysis Report'}
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
            {performanceReport && (
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
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <h4 className="font-medium text-sm text-green-900 mb-2">Performance Summary</h4>
            <p className="text-sm text-green-800">{currentReport.summary}</p>
          </div>
        )}

        {/* Key Performance Metrics */}
        {currentReport?.analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="text-xs font-medium text-green-900">Total P&L</span>
              </div>
              <p className={cn("text-lg font-semibold", getPerformanceColor(currentReport.analytics.total_pnl))}>
                {formatCurrency(currentReport.analytics.total_pnl)}
              </p>
            </div>

            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <Percent className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-medium text-blue-900">Win Rate</span>
              </div>
              <p className="text-lg font-semibold text-blue-800">
                {formatPercentage(currentReport.analytics.win_rate)}
              </p>
            </div>

            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-medium text-purple-900">Total Trades</span>
              </div>
              <p className="text-lg font-semibold text-purple-800">
                {currentReport.analytics.total_trades}
              </p>
            </div>

            <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <Calculator className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-medium text-amber-900">Avg Trade</span>
              </div>
              <p className={cn("text-lg font-semibold", getPerformanceColor(currentReport.analytics.average_trade_pnl))}>
                {formatCurrency(currentReport.analytics.average_trade_pnl)}
              </p>
            </div>
          </div>
        )}

        {/* Detailed Performance Metrics */}
        {currentReport?.performance_metrics && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <h4 className="font-medium text-sm">Detailed Performance Metrics</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Profitability Metrics */}
              <div className="p-4 bg-gray-50 rounded-lg border">
                <h5 className="font-medium text-sm mb-3 text-gray-900">Profitability</h5>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Sharpe Ratio</span>
                    <span className="font-medium">{currentReport.performance_metrics.sharpe_ratio.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Profit Factor</span>
                    <span className="font-medium">{currentReport.performance_metrics.profit_factor.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Return on Investment</span>
                    <span className={cn("font-medium", getPerformanceColor(currentReport.performance_metrics.roi))}>
                      {formatPercentage(currentReport.performance_metrics.roi)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Risk Metrics */}
              <div className="p-4 bg-gray-50 rounded-lg border">
                <h5 className="font-medium text-sm mb-3 text-gray-900">Risk Metrics</h5>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Max Drawdown</span>
                    <span className="font-medium text-red-600">
                      {formatPercentage(currentReport.performance_metrics.max_drawdown)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Volatility</span>
                    <span className="font-medium">
                      {formatPercentage(currentReport.performance_metrics.volatility)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Beta</span>
                    <span className="font-medium">{currentReport.performance_metrics.beta?.toFixed(2) || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Performance Insights */}
        {currentReport?.recommendations && currentReport.recommendations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-sm">Performance Insights</h4>
            </div>
            <div className="space-y-2">
              {currentReport.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="h-2 w-2 bg-amber-600 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-sm text-amber-900">{recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Performing Trades */}
        {currentReport?.trades && currentReport.trades.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600" />
              <h4 className="font-medium text-sm">Top Performing Trades</h4>
            </div>
            <div className="space-y-2">
              {currentReport.trades
                .sort((a, b) => b.pnl - a.pnl)
                .slice(0, 3)
                .map((trade, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-1 rounded", trade.pnl > 0 ? "bg-green-100" : "bg-red-100")}>
                      {(() => {
                        const Icon = getPerformanceIcon(trade.pnl);
                        return <Icon className={cn("h-3 w-3", getPerformanceColor(trade.pnl))} />;
                      })()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-blue-900">{trade.symbol}</p>
                      <p className="text-xs text-blue-700">{trade.trade_type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-sm font-medium", getPerformanceColor(trade.pnl))}>
                      {formatCurrency(trade.pnl)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(trade.entry_date).toLocaleDateString()}
                    </p>
                  </div>
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
                <p className="font-medium">{currentReport.metadata.processing_time_ms}ms</p>
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
