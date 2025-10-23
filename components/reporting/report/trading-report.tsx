"use client";

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertCircle, 
  TrendingUp, 
  Target, 
  Lightbulb, 
  Clock, 
  Activity,
  BarChart3,
  PieChart,
  Calendar,
  Eye,
  Trash2
} from 'lucide-react';
import { useAIReports } from '@/hooks/use-ai-reports';
import { TimeRange } from '@/lib/types/ai-reports';
import { cn } from '@/lib/utils';

interface TradingReportCardProps {
  timeRange?: TimeRange;
  className?: string;
}

export function TradingReportCard({ timeRange = '30d', className }: TradingReportCardProps) {
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

  // Find trading report for the specified time range
  const tradingReport = reports.find(
    report => report.report_type === 'trading' && report.time_range === timeRange
  );

  // Load trading report if not already loaded
  useEffect(() => {
    console.log('Trading report effect triggered:', {
      reportFound: !!tradingReport,
      reportId: tradingReport?.id,
      currentReportId: currentReport?.id,
      loading,
      error: error?.message
    });

    // Don't try to load report if reports list is still loading
    if (loading) {
      console.log('Reports list still loading, skipping report load');
      return;
    }

    if (tradingReport && (!currentReport || currentReport.id !== tradingReport.id)) {
      console.log('Attempting to load trading report:', tradingReport.id);
      getReport(tradingReport.id).catch((error) => {
        console.error('Failed to load trading report:', error);
        // Don't retry on error - let the error state handle it
      });
    }
  }, [tradingReport, currentReport, getReport, loading, error]);

  const handleGenerateReport = async () => {
    try {
      await generateReport({
        time_range: timeRange,
        report_type: 'trading',
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
    if (tradingReport) {
      getReport(tradingReport.id).catch(() => {
        // Error handled by hook
      });
    }
  };

  const handleDeleteReport = async () => {
    if (tradingReport) {
      try {
        await deleteReport(tradingReport.id);
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

  const getPatternConfidenceColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  if (loading && !tradingReport && !currentReport) {
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
  if (!loading && !tradingReport && !currentReport) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Trading Analysis Report
              </CardTitle>
              <CardDescription>
                {formatTimeRange(timeRange)} Trading Strategy Analysis
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
                  <TrendingUp className="h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Trading Analysis Report Found</h3>
            <p className="text-muted-foreground mb-4">
              Generate a trading analysis report to examine your trading patterns, 
              strategies, and execution performance.
            </p>
            <Button onClick={handleGenerateReport} disabled={generating}>
              {generating ? 'Generating Report...' : 'Generate Trading Analysis Report'}
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
              <CardTitle className="text-red-700">Trading Analysis Report</CardTitle>
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
            Failed to load trading analysis report. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!tradingReport && !currentReport) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Trading Analysis Report
              </CardTitle>
              <CardDescription>
                {formatTimeRange(timeRange)} Trading Strategy Analysis
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
                  <TrendingUp className="h-4 w-4" />
                  Generate Report
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Trading Analysis Report Found</h3>
            <p className="text-muted-foreground mb-4">
              Generate a trading analysis report to examine your trading patterns, 
              strategies, and execution performance.
            </p>
            <Button onClick={handleGenerateReport} disabled={generating}>
              {generating ? 'Generating Report...' : 'Generate Trading Analysis Report'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const report = currentReport || tradingReport;
  const isExpired = report?.expires_at && new Date(report.expires_at) < new Date();

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {report?.title || 'Trading Analysis Report'}
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
            {tradingReport && (
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
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h4 className="font-medium text-sm text-purple-900 mb-2">Trading Analysis Summary</h4>
            <p className="text-sm text-purple-800">{currentReport.summary}</p>
          </div>
        )}

        {/* Trading Statistics */}
        {currentReport?.analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-medium text-blue-900">Total Trades</span>
              </div>
              <p className="text-lg font-semibold text-blue-800">
                {currentReport.analytics.total_trades}
              </p>
            </div>

            <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-xs font-medium text-green-900">Win Rate</span>
              </div>
              <p className="text-lg font-semibold text-green-800">
                {formatPercentage(currentReport.analytics.win_rate)}
              </p>
            </div>

            <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-medium text-purple-900">Avg Hold Time</span>
              </div>
              <p className="text-lg font-semibold text-purple-800">
                {currentReport.analytics.average_hold_time || 'N/A'}
              </p>
            </div>

            <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <PieChart className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-medium text-amber-900">Best Sector</span>
              </div>
              <p className="text-lg font-semibold text-amber-800">
                {currentReport.analytics.best_performing_sector || 'N/A'}
              </p>
            </div>
          </div>
        )}

        {/* Trading Patterns */}
        {currentReport?.patterns && currentReport.patterns.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-600" />
              <h4 className="font-medium text-sm">Identified Trading Patterns</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentReport.patterns.map((pattern, index) => (
                <div key={index} className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-sm text-purple-900">{pattern.pattern_type}</h5>
                    <Badge 
                      variant="outline" 
                      className={cn("text-xs", getPatternConfidenceColor(pattern.confidence_score))}
                    >
                      {formatPercentage(pattern.confidence_score)} confidence
                    </Badge>
                  </div>
                  <p className="text-xs text-purple-800 mb-2">{pattern.description}</p>
                  <div className="text-xs text-muted-foreground">
                    Frequency: {pattern.frequency} occurrences
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trading Strategy Insights */}
        {currentReport?.recommendations && currentReport.recommendations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-sm">Trading Strategy Insights</h4>
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

        {/* Trade Execution Analysis */}
        {currentReport?.trades && currentReport.trades.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <h4 className="font-medium text-sm">Trade Execution Analysis</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Best Performing Trades */}
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h5 className="font-medium text-sm mb-3 text-green-900">Best Performing Trades</h5>
                <div className="space-y-2">
                  {currentReport.trades
                    .sort((a, b) => b.pnl - a.pnl)
                    .slice(0, 3)
                    .map((trade, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span className="font-medium">{trade.symbol}</span>
                      </div>
                      <span className="text-green-700 font-medium">
                        {formatCurrency(trade.pnl)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Worst Performing Trades */}
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <h5 className="font-medium text-sm mb-3 text-red-900">Worst Performing Trades</h5>
                <div className="space-y-2">
                  {currentReport.trades
                    .sort((a, b) => a.pnl - b.pnl)
                    .slice(0, 3)
                    .map((trade, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-3 w-3 text-red-600 rotate-180" />
                        <span className="font-medium">{trade.symbol}</span>
                      </div>
                      <span className="text-red-700 font-medium">
                        {formatCurrency(trade.pnl)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Trading Time Analysis */}
        {currentReport?.analytics && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-indigo-600" />
              <h4 className="font-medium text-sm">Trading Time Analysis</h4>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <p className="text-indigo-900 font-medium">Most Active Day</p>
                <p className="text-indigo-700">{currentReport.analytics.most_active_day || 'N/A'}</p>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <p className="text-indigo-900 font-medium">Most Active Hour</p>
                <p className="text-indigo-700">{currentReport.analytics.most_active_hour || 'N/A'}</p>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <p className="text-indigo-900 font-medium">Avg Trades/Day</p>
                <p className="text-indigo-700">{currentReport.analytics.average_trades_per_day?.toFixed(1) || 'N/A'}</p>
              </div>
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <p className="text-indigo-900 font-medium">Trading Frequency</p>
                <p className="text-indigo-700">{currentReport.analytics.trading_frequency || 'N/A'}</p>
              </div>
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
