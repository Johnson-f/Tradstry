"use client";

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertCircle, 
  Brain, 
  Target, 
  Lightbulb, 
  Clock, 
  Activity,
  Heart,
  Users,
  Eye,
  Trash2
} from 'lucide-react';
import { useAIReports } from '@/hooks/use-ai-reports';
import { TimeRange } from '@/lib/types/ai-reports';
import { cn } from '@/lib/utils';

interface BehavioralReportCardProps {
  timeRange?: TimeRange;
  className?: string;
}

export function BehavioralReportCard({ timeRange = '30d', className }: BehavioralReportCardProps) {
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

  // Find behavioral report for the specified time range
  const behavioralReport = reports.find(
    report => report.report_type === 'behavioral' && report.time_range === timeRange
  );

  // Load behavioral report if not already loaded
  useEffect(() => {
    console.log('Behavioral report effect triggered:', {
      reportFound: !!behavioralReport,
      reportId: behavioralReport?.id,
      currentReportId: currentReport?.id,
      loading,
      error: error?.message
    });

    // Don't try to load report if reports list is still loading
    if (loading) {
      console.log('Reports list still loading, skipping report load');
      return;
    }

    if (behavioralReport && (!currentReport || currentReport.id !== behavioralReport.id)) {
      console.log('Attempting to load behavioral report:', behavioralReport.id);
      getReport(behavioralReport.id).catch((error) => {
        console.error('Failed to load behavioral report:', error);
        // Don't retry on error - let the error state handle it
      });
    }
  }, [behavioralReport, currentReport, getReport, loading, error]);

  const handleGenerateReport = async () => {
    try {
      await generateReport({
        time_range: timeRange,
        report_type: 'behavioral',
        include_trades: true,
        include_patterns: true,
        include_risk_analysis: false,
        include_behavioral_analysis: true,
        include_market_analysis: false,
      });
    } catch {
      // Error handled by hook
    }
  };

  const handleViewReport = () => {
    if (behavioralReport) {
      console.log('Viewing behavioral report:', behavioralReport.id);
      getReport(behavioralReport.id).catch((error) => {
        console.error('Failed to view behavioral report:', error);
      });
    }
  };

  const handleDeleteReport = async () => {
    if (behavioralReport) {
      try {
        await deleteReport(behavioralReport.id);
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

  const formatPercentage = (value: number): string => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const getBehavioralScoreColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getBehavioralScoreText = (score: number): string => {
    if (score >= 0.8) return 'Excellent Discipline';
    if (score >= 0.6) return 'Good Discipline';
    return 'Needs Improvement';
  };

  const getEmotionalStateColor = (state: string): string => {
    switch (state.toLowerCase()) {
      case 'confident':
      case 'disciplined':
        return 'text-green-600 bg-green-50';
      case 'neutral':
      case 'cautious':
        return 'text-blue-600 bg-blue-50';
      case 'fearful':
      case 'greedy':
      case 'impulsive':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
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
  if (!loading && !behavioralReport && !currentReport) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Behavioral Analysis Report
              </CardTitle>
              <CardDescription>
                {formatTimeRange(timeRange)} Psychology Analysis
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Behavioral Analysis Report Found</h3>
            <p className="text-muted-foreground mb-4">
              Generate a behavioral analysis report to understand your trading psychology, 
              emotional patterns, and decision-making processes.
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
              <CardTitle className="text-red-700">Behavioral Analysis Report</CardTitle>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                clearError();
                // Optionally retry loading the report
                if (behavioralReport) {
                  getReport(behavioralReport.id);
                }
              }}
            >
              Retry
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-red-600 text-sm">
            Failed to load behavioral analysis report. {error.message || 'Please try again.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const report = currentReport || behavioralReport;
  const isExpired = report?.expires_at && new Date(report.expires_at) < new Date();

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              {report?.title || 'Behavioral Analysis Report'}
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
            {behavioralReport && (
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
          <div className="p-4 bg-pink-50 rounded-lg border border-pink-200">
            <h4 className="font-medium text-sm text-pink-900 mb-2">Behavioral Analysis Summary</h4>
            <p className="text-sm text-pink-800">{currentReport.summary}</p>
          </div>
        )}

        {/* Behavioral Health Score */}
        {currentReport?.behavioral_insights && currentReport.behavioral_insights.length > 0 && (
          <div className="p-6 bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg border border-pink-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Heart className="h-5 w-5 text-pink-600" />
                <h4 className="font-medium text-lg">Trading Psychology Health</h4>
              </div>
              <Badge 
                variant="outline" 
                className={cn("text-sm font-medium border", getBehavioralScoreColor(currentReport.behavioral_insights[0]?.confidence_score || 0))}
              >
                {getBehavioralScoreText(currentReport.behavioral_insights[0]?.confidence_score || 0)}
              </Badge>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Discipline Score</span>
                <span className="font-medium">{Math.round((currentReport.behavioral_insights[0]?.confidence_score || 0) * 100)}/100</span>
              </div>
            </div>
          </div>
        )}

        {/* Behavioral Insights */}
        {currentReport?.behavioral_insights && currentReport.behavioral_insights.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-pink-600" />
              <h4 className="font-medium text-sm">Behavioral Insights</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentReport.behavioral_insights.map((insight, index) => (
                <div key={index} className="p-4 bg-pink-50 rounded-lg border border-pink-200">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-sm text-pink-900">{insight.insight_type}</h5>
                    <Badge 
                      variant="outline" 
                      className={cn("text-xs", getBehavioralScoreColor(insight.confidence_score))}
                    >
                      {formatPercentage(insight.confidence_score)}
                    </Badge>
                  </div>
                  <p className="text-xs text-pink-800 mb-2">{insight.description}</p>
                  {insight.emotional_state && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-muted-foreground">Emotional State:</span>
                      <Badge 
                        variant="outline" 
                        className={cn("text-xs", getEmotionalStateColor(insight.emotional_state))}
                      >
                        {insight.emotional_state}
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Behavioral Patterns */}
        {currentReport?.patterns && currentReport.patterns.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-600" />
              <h4 className="font-medium text-sm">Behavioral Patterns</h4>
            </div>
            <div className="space-y-2">
              {currentReport.patterns
                .filter(pattern => pattern.pattern_type.toLowerCase().includes('behavioral') || 
                                 pattern.pattern_type.toLowerCase().includes('emotional'))
                .map((pattern, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="h-2 w-2 bg-purple-600 rounded-full mt-2 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-purple-900">{pattern.pattern_type}</span>
                      <Badge variant="outline" className="text-xs">
                        {formatPercentage(pattern.confidence_score)}
                      </Badge>
                    </div>
                    <p className="text-xs text-purple-800">{pattern.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Emotional Trading Analysis */}
        {currentReport?.behavioral_insights && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-red-600" />
              <h4 className="font-medium text-sm">Emotional Trading Analysis</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Fear & Greed Index */}
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <h5 className="font-medium text-sm mb-3 text-red-900">Fear & Greed Indicators</h5>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">FOMO Trades</span>
                    <span className="font-medium text-red-700">
                      {currentReport.behavioral_insights.filter(i => i.insight_type.toLowerCase().includes('fomo')).length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Panic Sells</span>
                    <span className="font-medium text-red-700">
                      {currentReport.behavioral_insights.filter(i => i.insight_type.toLowerCase().includes('panic')).length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Discipline Metrics */}
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h5 className="font-medium text-sm mb-3 text-green-900">Discipline Metrics</h5>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Plan Adherence</span>
                    <span className="font-medium text-green-700">
                      {formatPercentage(currentReport.behavioral_insights[0]?.confidence_score || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Stop Loss Usage</span>
                    <span className="font-medium text-green-700">
                      {currentReport.behavioral_insights.filter(i => i.insight_type.toLowerCase().includes('stop')).length > 0 ? 'Good' : 'Poor'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cognitive Biases */}
              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <h5 className="font-medium text-sm mb-3 text-yellow-900">Cognitive Biases</h5>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Confirmation Bias</span>
                    <span className="font-medium text-yellow-700">
                      {currentReport.behavioral_insights.filter(i => i.insight_type.toLowerCase().includes('confirmation')).length > 0 ? 'Detected' : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Overconfidence</span>
                    <span className="font-medium text-yellow-700">
                      {currentReport.behavioral_insights.filter(i => i.insight_type.toLowerCase().includes('overconfidence')).length > 0 ? 'Detected' : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Behavioral Recommendations */}
        {currentReport?.recommendations && currentReport.recommendations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-sm">Behavioral Improvement Recommendations</h4>
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

        {/* Psychological Health Alert */}
        {currentReport?.behavioral_insights && 
         currentReport.behavioral_insights.some(insight => insight.confidence_score < 0.6) && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <Brain className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-800 font-medium mb-1">Psychological Health Alert</p>
              <p className="text-xs text-red-700">
                Your behavioral analysis indicates potential emotional trading patterns. 
                Consider implementing the recommended psychological strategies to improve trading discipline.
              </p>
            </div>
          </div>
        )}

        {/* Positive Behavioral Feedback */}
        {currentReport?.behavioral_insights && 
         currentReport.behavioral_insights.some(insight => insight.confidence_score >= 0.8) && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <Users className="h-4 w-4 text-green-600" />
            <p className="text-sm text-green-800 font-medium">
              Excellent psychological discipline detected! You&apos;re maintaining rational, disciplined trading behavior.
            </p>
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
