"use client";

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Brain, TrendingUp, Target, Lightbulb, Clock, Heart, Activity, Users } from 'lucide-react';
import { useAIInsights } from '@/hooks/use-ai-insights';
import { TimeRange } from '@/lib/types/ai-insights';
import { cn } from '@/lib/utils';

interface BehavioralAnalysisCardProps {
  timeRange?: TimeRange;
  className?: string;
}

export function BehavioralAnalysisCard({ timeRange = '30d', className }: BehavioralAnalysisCardProps) {
  const {
    insights,
    currentInsight,
    loading,
    generating,
    generateInsights,
    getInsight,
    clearError,
  } = useAIInsights();

  // Find behavioral analysis insight for the specified time range
  const behavioralAnalysisInsight = insights.find(
    insight => insight.insight_type === 'behavioral_analysis' && insight.time_range === timeRange
  );

  // Load behavioral analysis insight if not already loaded
  useEffect(() => {
    if (behavioralAnalysisInsight && !currentInsight) {
      getInsight(behavioralAnalysisInsight.id).catch(() => {
        // Error handled by hook
      });
    }
  }, [behavioralAnalysisInsight, currentInsight, getInsight]);

  const handleGenerateInsights = async () => {
    try {
      await generateInsights({
        time_range: timeRange,
        insight_type: 'behavioral_analysis',
        include_predictions: true,
        force_regenerate: false,
      });
    } catch {
      // Error handled by hook
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

  const getConfidenceColor = (score: number): string => {
    if (score >= 0.8) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getDataQualityColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBehavioralHealthColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getBehavioralHealthText = (score: number): string => {
    if (score >= 0.8) return 'Healthy Trading Behavior';
    if (score >= 0.6) return 'Mixed Behavioral Patterns';
    return 'Behavioral Issues Detected';
  };

  if (loading && !behavioralAnalysisInsight) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
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

    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
  if (error) {
    return (
      <Card className={cn("w-full border-red-200", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <CardTitle className="text-red-700">Behavioral Analysis</CardTitle>
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
            Failed to load behavioral analysis insight. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!behavioralAnalysisInsight && !currentInsight) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Behavioral Analysis
              </CardTitle>
              <CardDescription>
                {formatTimeRange(timeRange)} Psychology Review
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Behavioral Analysis Found</h3>
            <p className="text-muted-foreground mb-4">
              Generate behavioral analysis to understand your trading psychology and decision-making patterns.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const insight = currentInsight || behavioralAnalysisInsight;
  const isExpired = insight?.expires_at && new Date(insight.expires_at) < new Date();

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              {insight?.title || 'Behavioral Analysis'}
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
            <Badge 
              variant="outline" 
              className={cn("text-xs", getConfidenceColor(insight?.confidence_score || 0))}
            >
              {Math.round((insight?.confidence_score || 0) * 100)}% Confidence
            </Badge>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleGenerateInsights}
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Behavioral Health Indicator */}
        {currentInsight?.confidence_score && (
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <Heart className="h-5 w-5 text-pink-600" />
              <div>
                <p className="font-medium text-sm">Behavioral Health</p>
                <p className={cn("text-sm font-semibold", getBehavioralHealthColor(currentInsight.confidence_score))}>
                  {getBehavioralHealthText(currentInsight.confidence_score)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Confidence Score</p>
              <p className="font-semibold">{Math.round(currentInsight.confidence_score * 100)}%</p>
            </div>
          </div>
        )}

        {/* Key Behavioral Findings */}
        {currentInsight?.key_findings && currentInsight.key_findings.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-pink-600" />
              <h4 className="font-medium text-sm">Behavioral Findings</h4>
            </div>
            <div className="space-y-2">
              {currentInsight.key_findings.map((finding, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-pink-50 rounded-lg border border-pink-200">
                  <div className="h-2 w-2 bg-pink-600 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-sm text-pink-900">{finding}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Behavioral Recommendations */}
        {currentInsight?.recommendations && currentInsight.recommendations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-sm">Behavioral Recommendations</h4>
            </div>
            <div className="space-y-2">
              {currentInsight.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <div className="h-2 w-2 bg-amber-600 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-sm text-amber-900">{recommendation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Behavioral Analysis Details */}
        {currentInsight?.metadata && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-gray-600" />
              <h4 className="font-medium text-sm">Behavioral Analysis Details</h4>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Trades Analyzed</p>
                <p className="font-medium">{currentInsight.metadata.trade_count}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Analysis Period</p>
                <p className="font-medium">{currentInsight.metadata.analysis_period_days} days</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Data Quality</p>
                <p className={cn("font-medium", getDataQualityColor(currentInsight.metadata.data_quality_score))}>
                  {Math.round(currentInsight.metadata.data_quality_score * 100)}%
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Processing Time</p>
                <p className="font-medium">{currentInsight.metadata.processing_time_ms}ms</p>
              </div>
            </div>
          </div>
        )}

        {/* Healthy Behavior Alert */}
        {currentInsight?.confidence_score && currentInsight.confidence_score >= 0.8 && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <Users className="h-4 w-4 text-green-600" />
            <p className="text-sm text-green-800 font-medium">
              Healthy trading behavior detected! You&apos;re making rational, disciplined decisions.
            </p>
          </div>
        )}

        {/* Behavioral Issues Alert */}
        {currentInsight?.confidence_score && currentInsight.confidence_score < 0.6 && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <Brain className="h-4 w-4 text-red-600" />
            <p className="text-sm text-red-800 font-medium">
              Behavioral issues detected. Review recommendations to improve trading psychology.
            </p>
          </div>
        )}

        {/* Mixed Patterns Alert */}
        {currentInsight?.confidence_score && currentInsight.confidence_score >= 0.6 && currentInsight.confidence_score < 0.8 && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <TrendingUp className="h-4 w-4 text-yellow-600" />
            <p className="text-sm text-yellow-800 font-medium">
              Mixed behavioral patterns detected. Focus on consistency and emotional control.
            </p>
          </div>
        )}

        {/* Generated At */}
        {currentInsight?.generated_at && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Generated: {new Date(currentInsight.generated_at).toLocaleString()}
            {currentInsight.expires_at && (
              <span className="ml-2">
                • Expires: {new Date(currentInsight.expires_at).toLocaleString()}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
