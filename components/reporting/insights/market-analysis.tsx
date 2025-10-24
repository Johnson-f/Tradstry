"use client";

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, Globe, TrendingUp, Target, Lightbulb, Clock, BarChart3, Activity, Building2 } from 'lucide-react';
import { useAIInsights } from '@/hooks/use-ai-insights';
import { InsightType, TimeRange } from '@/lib/types/ai-insights';
import { cn } from '@/lib/utils';

interface MarketAnalysisCardProps {
  timeRange?: TimeRange;
  className?: string;
}

export function MarketAnalysisCard({ timeRange = '30d', className }: MarketAnalysisCardProps) {
  const {
    insights,
    currentInsight,
    loading,
    generating,
    error,
    generateInsights,
    getInsight,
    clearError,
  } = useAIInsights();

  // Find market analysis insight for the specified time range
  const marketAnalysisInsight = insights.find(
    insight => insight.insight_type === 'market_analysis' && insight.time_range === timeRange
  );

  // Load market analysis insight if not already loaded
  useEffect(() => {
    if (marketAnalysisInsight && !currentInsight) {
      getInsight(marketAnalysisInsight.id).catch(() => {
        // Error handled by hook
      });
    }
  }, [marketAnalysisInsight, currentInsight, getInsight]);

  const handleGenerateInsights = async () => {
    try {
      await generateInsights({
        time_range: timeRange,
        insight_type: 'market_analysis',
        include_predictions: true,
        force_regenerate: false,
      });
    } catch (error) {
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

  const getMarketConditionColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getMarketConditionText = (score: number): string => {
    if (score >= 0.8) return 'Bullish Market';
    if (score >= 0.6) return 'Mixed Market';
    return 'Bearish Market';
  };

  if (loading && !marketAnalysisInsight) {
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

  if (error) {
    return (
      <Card className={cn("w-full border-red-200", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <CardTitle className="text-red-700">Market Analysis</CardTitle>
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
            Failed to load market analysis insight. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!marketAnalysisInsight && !currentInsight) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Market Analysis
              </CardTitle>
              <CardDescription>
                {formatTimeRange(timeRange)} Market Review
              </CardDescription>
            </div>
            <Button 
              onClick={handleGenerateInsights}
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
                  <Globe className="h-4 w-4" />
                  Analyze Market
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Market Analysis Found</h3>
            <p className="text-muted-foreground mb-4">
              Generate market analysis to understand current market conditions and sector performance.
            </p>
            <Button onClick={handleGenerateInsights} disabled={generating}>
              {generating ? 'Generating...' : 'Analyze Market'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const insight = currentInsight || marketAnalysisInsight;
  const isExpired = insight?.expires_at && new Date(insight.expires_at) < new Date();

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {insight?.title || 'Market Analysis'}
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
        {/* Market Condition Indicator */}
        {currentInsight?.confidence_score && (
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-sm">Market Condition</p>
                <p className={cn("text-sm font-semibold", getMarketConditionColor(currentInsight.confidence_score))}>
                  {getMarketConditionText(currentInsight.confidence_score)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Confidence Score</p>
              <p className="font-semibold">{Math.round(currentInsight.confidence_score * 100)}%</p>
            </div>
          </div>
        )}

        {/* Key Market Findings */}
        {currentInsight?.key_findings && currentInsight.key_findings.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-blue-600" />
              <h4 className="font-medium text-sm">Market Findings</h4>
            </div>
            <div className="space-y-2">
              {currentInsight.key_findings.map((finding, index) => (
                <div key={index} className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="h-2 w-2 bg-blue-600 rounded-full mt-2 flex-shrink-0" />
                  <p className="text-sm text-blue-900">{finding}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Market Recommendations */}
        {currentInsight?.recommendations && currentInsight.recommendations.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-sm">Market Recommendations</h4>
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

        {/* Market Analysis Details */}
        {currentInsight?.metadata && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-gray-600" />
              <h4 className="font-medium text-sm">Market Analysis Details</h4>
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

        {/* Bullish Market Alert */}
        {currentInsight?.confidence_score && currentInsight.confidence_score >= 0.8 && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <p className="text-sm text-green-800 font-medium">
              Bullish market conditions detected! Consider increasing exposure to growth sectors.
            </p>
          </div>
        )}

        {/* Bearish Market Alert */}
        {currentInsight?.confidence_score && currentInsight.confidence_score < 0.6 && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
            <Building2 className="h-4 w-4 text-red-600" />
            <p className="text-sm text-red-800 font-medium">
              Bearish market conditions detected. Consider defensive positioning and risk management.
            </p>
          </div>
        )}

        {/* Mixed Market Alert */}
        {currentInsight?.confidence_score && currentInsight.confidence_score >= 0.6 && currentInsight.confidence_score < 0.8 && (
          <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <BarChart3 className="h-4 w-4 text-yellow-600" />
            <p className="text-sm text-yellow-800 font-medium">
              Mixed market conditions. Focus on sector rotation and selective opportunities.
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
