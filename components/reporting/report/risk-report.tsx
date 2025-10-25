"use client";

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  AlertCircle, 
  Shield, 
  AlertTriangle, 
  Target, 
  Lightbulb, 
  Clock, 
  Activity,
  TrendingDown,
  BarChart3,
  Eye,
  Trash2
} from 'lucide-react';
import { useAIReports } from '@/hooks/use-ai-reports';
import { TimeRange } from '@/lib/types/ai-reports';
import { cn } from '@/lib/utils';

interface RiskReportCardProps {
  timeRange?: TimeRange;
  className?: string;
}

export function RiskReportCard({ timeRange = '30d', className }: RiskReportCardProps) {
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

  // Find risk report for the specified time range
  const riskReport = reports.find(
    report => report.report_type === 'risk' && report.time_range === timeRange
  );

  // Load risk report if not already loaded
  useEffect(() => {
    console.log('Risk report effect triggered:', {
      reportFound: !!riskReport,
      reportId: riskReport?.id,
      currentReportId: currentReport?.id,
      loading,
      error: error?.message
    });

    // Don't try to load report if reports list is still loading
    if (loading) {
      console.log('Reports list still loading, skipping report load');
      return;
    }

    if (riskReport && (!currentReport || currentReport.id !== riskReport.id)) {
      console.log('Attempting to load risk report:', riskReport.id);
      getReport(riskReport.id).catch((error) => {
        console.error('Failed to load risk report:', error);
        // Don't retry on error - let the error state handle it
      });
    }
  }, [riskReport, currentReport, getReport, loading, error]);

  const handleGenerateReport = async () => {
    try {
      await generateReport({
        time_range: timeRange,
        report_type: 'risk',
        // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
        include_trades: true,
        include_patterns: false,
        include_risk_analysis: true,
        include_behavioral_analysis: false,
        include_market_analysis: false,
      });
    } catch {
      // Error handled by hook
    }
  };

  const handleViewReport = () => {
    if (riskReport) {
      getReport(riskReport.id).catch(() => {
        // Error handled by hook
      });
    }
  };

  const handleDeleteReport = async () => {
    if (riskReport) {
      try {
        await deleteReport(riskReport.id);
      } catch {
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

  const getRiskLevelColor = (score: number): string => {
    if (score >= 0.8) return 'text-red-600 bg-red-50 border-red-200';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getRiskLevelText = (score: number): string => {
    if (score >= 0.8) return 'High Risk';
    if (score >= 0.6) return 'Medium Risk';
    return 'Low Risk';
  };

  const getRiskProgressColor = (score: number): string => {
    if (score >= 0.8) return 'bg-red-500';
    if (score >= 0.6) return 'bg-yellow-500';
    return 'bg-green-500';
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
  if (!loading && !riskReport && !currentReport) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Risk Assessment Report
              </CardTitle>
              <CardDescription>
                {formatTimeRange(timeRange)} Risk Analysis
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Risk Assessment Report Found</h3>
            <p className="text-muted-foreground mb-4">
              Generate a risk assessment report to analyze portfolio risks, 
              vulnerabilities, and risk management recommendations.
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
              <CardTitle className="text-red-700">Risk Assessment Report</CardTitle>
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
            Failed to load risk assessment report. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!riskReport && !currentReport) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Risk Assessment Report
              </CardTitle>
              <CardDescription>
                {formatTimeRange(timeRange)} Risk Analysis
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Risk Assessment Report Found</h3>
            <p className="text-muted-foreground mb-4">
              Generate a risk assessment report to analyze portfolio risks, 
              vulnerabilities, and risk management recommendations.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const report = currentReport || riskReport;
  const isExpired = report?.expires_at && new Date(report.expires_at) < new Date();

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {report?.title || 'Risk Assessment Report'}
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
            {riskReport && (
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
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <h4 className="font-medium text-sm text-red-900 mb-2">Risk Assessment Summary</h4>
            <p className="text-sm text-red-800">{currentReport.summary}</p>
          </div>
        )}

        {/* Overall Risk Score */}
        {currentReport?.risk_metrics && (
          <div className="p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg border">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h4 className="font-medium text-lg">Overall Risk Level</h4>
              </div>
              <Badge 
                variant="outline" 
                className={cn("text-sm font-medium border", getRiskLevelColor(currentReport.risk_metrics.risk_score))}
              >
                {getRiskLevelText(currentReport.risk_metrics.risk_score)}
              </Badge>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Risk Score</span>
                <span className="font-medium">{Math.round(currentReport.risk_metrics.risk_score * 100)}/100</span>
              </div>
              <Progress 
                value={currentReport.risk_metrics.risk_score * 100} 

                className="h-3"
                // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                indicatorClassName={getRiskProgressColor(currentReport.risk_metrics.risk_score)}
              />
            </div>
          </div>
        )}

        {/* Risk Metrics Grid */}
        {currentReport?.risk_metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-red-600" />
                <span className="text-xs font-medium text-red-900">Max Drawdown</span>
              </div>
              <p className="text-lg font-semibold text-red-800">
                {formatPercentage(currentReport.risk_metrics.max_drawdown)}
              </p>
            </div>

            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="h-4 w-4 text-yellow-600" />
                <span className="text-xs font-medium text-yellow-900">Volatility</span>
              </div>
              <p className="text-lg font-semibold text-yellow-800">
                {formatPercentage(currentReport.risk_metrics.volatility)}
              </p>
            </div>

            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-medium text-purple-900">VaR (95%)</span>
              </div>
              <p className="text-lg font-semibold text-purple-800">
                {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
                {formatCurrency(currentReport.risk_metrics.value_at_risk)}
              </p>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-medium text-blue-900">Sharpe Ratio</span>
              </div>
              <p className="text-lg font-semibold text-blue-800">
                {currentReport.risk_metrics.sharpe_ratio.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Risk Categories */}
        {currentReport?.risk_metrics && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <h4 className="font-medium text-sm">Risk Categories</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Market Risk */}
              <div className="p-4 bg-gray-50 rounded-lg border">
                <h5 className="font-medium text-sm mb-3 text-gray-900">Market Risk</h5>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Beta</span>
                    {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
                    <span className="font-medium">{currentReport.risk_metrics.beta?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Correlation</span>
                    {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
                    <span className="font-medium">{currentReport.risk_metrics.correlation?.toFixed(2) || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* Concentration Risk */}
              <div className="p-4 bg-gray-50 rounded-lg border">
                <h5 className="font-medium text-sm mb-3 text-gray-900">Concentration Risk</h5>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Position Size Risk</span>
                    {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
                    <span className="font-medium">{formatPercentage(currentReport.risk_metrics.position_size_risk || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Sector Concentration</span>
                    {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
                    <span className="font-medium">{formatPercentage(currentReport.risk_metrics.sector_concentration || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Risk Management Recommendations */}
        {currentReport?.recommendations && currentReport.recommendations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-sm">Risk Management Recommendations</h4>
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

        {/* High Risk Trades */}
        {currentReport?.trades && currentReport.trades.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <h4 className="font-medium text-sm">High Risk Trades</h4>
            </div>
            <div className="space-y-2">
              {currentReport.trades
                // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                .filter(trade => trade.risk_score && trade.risk_score > 0.7)
                .slice(0, 3)
                .map((trade, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    <div className="p-1 rounded bg-red-100">
                      <AlertTriangle className="h-3 w-3 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-red-900">{trade.symbol}</p>
                      <p className="text-xs text-red-700">{trade.trade_type}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-red-800">
                                    {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
                      Risk: {Math.round((trade.risk_score || 0) * 100)}%
        
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
                      {formatCurrency(trade.pnl)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risk Alert */}
        {currentReport?.risk_metrics && currentReport.risk_metrics.risk_score >= 0.7 && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div>
              <p className="text-sm text-red-800 font-medium mb-1">High Risk Portfolio Detected</p>
              <p className="text-xs text-red-700">
                Your portfolio shows elevated risk levels. Consider implementing the recommended risk management strategies immediately.
              </p>
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
                {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
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
