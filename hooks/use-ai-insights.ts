import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { aiInsightsService } from '@/lib/services/ai-insights-service';
import type {
  Insight,
  InsightRequest,
  InsightSummary,
  InsightListResponse,
  InsightGenerationTask,
  InsightFilters,
  UseAIInsightsReturn,
} from '@/lib/types/ai-insights';
import {
  AIInsightsError,
  ValidationError,
  GenerationError,
  DEFAULT_INSIGHT_FILTERS,
} from '@/lib/types/ai-insights';

/**
 * Custom hook for AI Insights
 * Provides state management and API interactions for AI insights functionality
 */
export function useAIInsights(): UseAIInsightsReturn {
  // State
  const [insights, setInsights] = useState<InsightSummary[]>([]);
  const [currentInsight, setCurrentInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for cleanup
  const pollingRefs = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any ongoing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Clear polling refs
      pollingRefs.current.clear();
    };
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Clear current insight
   */
  const clearCurrentInsight = useCallback(() => {
    setCurrentInsight(null);
  }, []);

  /**
   * Handle errors with toast notifications
   */
  const handleError = useCallback((error: Error, context?: string) => {
    console.error(`AI Insights Error${context ? ` (${context})` : ''}:`, error);
    
    let message = 'An unexpected error occurred';
    
    if (error instanceof ValidationError) {
      message = `Validation Error: ${error.message}`;
    } else if (error instanceof GenerationError) {
      message = `Generation Error: ${error.message}`;
    } else if (error instanceof AIInsightsError) {
      message = `AI Insights Error: ${error.message}`;
    } else if (error.message) {
      message = error.message;
    }
    
    setError(error);
    toast.error(message);
  }, []);

  /**
   * Generate insights synchronously
   */
  const generateInsights = useCallback(async (request: InsightRequest): Promise<void> => {
    try {
      setGenerating(true);
      setError(null);
      
      const insight = await aiInsightsService.generateInsights(request);
      
      // Add to insights list
      const insightSummary: InsightSummary = {
        id: insight.id,
        insight_type: insight.insight_type,
        title: insight.title,
        time_range: insight.time_range,
        confidence_score: insight.confidence_score,
        generated_at: insight.generated_at,
        expires_at: insight.expires_at,
        key_findings_count: insight.key_findings.length,
        recommendations_count: insight.recommendations.length,
      };
      
      setInsights(prev => [insightSummary, ...prev]);
      
      // Set as current insight
      setCurrentInsight(insight);
      
      toast.success('Insights generated successfully!');
      
    } catch (error) {
      handleError(error as Error, 'generateInsights');
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [handleError]);

  /**
   * Generate insights asynchronously
   */
  const generateInsightsAsync = useCallback(async (request: InsightRequest): Promise<string> => {
    try {
      setGenerating(true);
      setError(null);
      
      const taskId = await aiInsightsService.generateInsightsAsync(request);
      
      toast.success('Insight generation started!');
      
      return taskId;
      
    } catch (error) {
      handleError(error as Error, 'generateInsightsAsync');
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [handleError]);

  /**
   * Get insights with filters
   */
  const getInsights = useCallback(async (filters: InsightFilters = DEFAULT_INSIGHT_FILTERS): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await aiInsightsService.getInsights(filters);
      
      setInsights(response.insights);
      
    } catch (error) {
      handleError(error as Error, 'getInsights');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  /**
   * Get specific insight by ID
   */
  const getInsight = useCallback(async (insightId: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      const insight = await aiInsightsService.getInsight(insightId);
      
      setCurrentInsight(insight);
      
    } catch (error) {
      handleError(error as Error, 'getInsight');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  /**
   * Delete insight
   */
  const deleteInsight = useCallback(async (insightId: string): Promise<void> => {
    try {
      setError(null);
      
      await aiInsightsService.deleteInsight(insightId);
      
      // Remove from insights list
      setInsights(prev => prev.filter(insight => insight.id !== insightId));
      
      // Clear current insight if it's the deleted one
      if (currentInsight?.id === insightId) {
        setCurrentInsight(null);
      }
      
      toast.success('Insight deleted successfully');
      
    } catch (error) {
      handleError(error as Error, 'deleteInsight');
      throw error;
    }
  }, [currentInsight, handleError]);

  /**
   * Refresh insights list
   */
  const refreshInsights = useCallback(async (): Promise<void> => {
    try {
      await getInsights();
      toast.success('Insights refreshed');
    } catch (error) {
      // Error already handled in getInsights
    }
  }, [getInsights]);

  /**
   * Get task status
   */
  const getTaskStatus = useCallback(async (taskId: string): Promise<InsightGenerationTask> => {
    try {
      setError(null);
      
      const task = await aiInsightsService.getGenerationTask(taskId);
      
      return task;
      
    } catch (error) {
      handleError(error as Error, 'getTaskStatus');
      throw error;
    }
  }, [handleError]);

  /**
   * Poll task status until completion
   */
  const pollTaskStatus = useCallback(async (
    taskId: string,
    onComplete?: (insight: Insight) => void
  ): Promise<void> => {
    try {
      setError(null);
      
      // Add to polling refs for cleanup
      pollingRefs.current.add(taskId);
      
      const insight = await aiInsightsService.pollTaskStatus(
        taskId,
        (completedInsight) => {
          // Add to insights list
          const insightSummary: InsightSummary = {
            id: completedInsight.id,
            insight_type: completedInsight.insight_type,
            title: completedInsight.title,
            time_range: completedInsight.time_range,
            confidence_score: completedInsight.confidence_score,
            generated_at: completedInsight.generated_at,
            expires_at: completedInsight.expires_at,
            key_findings_count: completedInsight.key_findings.length,
            recommendations_count: completedInsight.recommendations.length,
          };
          
          setInsights(prev => [insightSummary, ...prev]);
          
          // Set as current insight
          setCurrentInsight(completedInsight);
          
          // Call completion callback
          onComplete?.(completedInsight);
          
          toast.success('Insight generation completed!');
        },
        (error) => {
          handleError(error, 'pollTaskStatus');
        }
      );
      
    } catch (error) {
      handleError(error as Error, 'pollTaskStatus');
      throw error;
    } finally {
      // Remove from polling refs
      pollingRefs.current.delete(taskId);
    }
  }, [handleError]);

  /**
   * Load initial insights on mount
   */
  useEffect(() => {
    getInsights().catch(() => {
      // Error already handled in getInsights
    });
  }, [getInsights]);

  return {
    // State
    insights,
    currentInsight,
    loading,
    generating,
    error,
    
    // Actions
    generateInsights,
    generateInsightsAsync,
    getInsights,
    getInsight,
    deleteInsight,
    refreshInsights,
    
    // Task management
    getTaskStatus,
    pollTaskStatus,
    
    // Utilities
    clearError,
    clearCurrentInsight,
  };
}

/**
 * Hook for managing insight generation with polling
 * Useful for components that need to track async generation
 */
export function useInsightGeneration() {
  const [isPolling, setIsPolling] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const { pollTaskStatus, getTaskStatus } = useAIInsights();

  const startGeneration = useCallback(async (
    request: InsightRequest,
    onComplete?: (insight: Insight) => void
  ): Promise<string> => {
    try {
      setIsPolling(true);
      
      // Start async generation
      const { generateInsightsAsync } = useAIInsights();
      const taskId = await generateInsightsAsync(request);
      
      setCurrentTaskId(taskId);
      
      // Start polling
      await pollTaskStatus(taskId, onComplete);
      
      return taskId;
      
    } catch (error) {
      setIsPolling(false);
      setCurrentTaskId(null);
      throw error;
    } finally {
      setIsPolling(false);
      setCurrentTaskId(null);
    }
  }, [pollTaskStatus]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    setCurrentTaskId(null);
  }, []);

  return {
    isPolling,
    currentTaskId,
    startGeneration,
    stopPolling,
    getTaskStatus,
  };
}

/**
 * Hook for insight analytics and statistics
 */
export function useInsightAnalytics() {
  const { insights } = useAIInsights();
  
  const analytics = useCallback(() => {
    const totalInsights = insights.length;
    const insightsByType = insights.reduce((acc, insight) => {
      acc[insight.insight_type] = (acc[insight.insight_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const avgConfidenceScore = insights.length > 0 
      ? insights.reduce((sum, insight) => sum + insight.confidence_score, 0) / insights.length
      : 0;
    
    const recentInsights = insights.filter(insight => {
      const generatedAt = new Date(insight.generated_at);
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return generatedAt > oneWeekAgo;
    });
    
    const generationFrequency = recentInsights.length / 7; // insights per day
    
    return {
      totalInsights,
      insightsByType,
      avgConfidenceScore,
      generationFrequency,
      recentInsightsCount: recentInsights.length,
    };
  }, [insights]);
  
  return analytics();
}
