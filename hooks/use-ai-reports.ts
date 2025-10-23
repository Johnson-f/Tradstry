import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiReportsService } from '@/lib/services/ai-reports-service';
import type {
  TradingReport,
  ReportRequest,
  ReportSummary,
  ReportListResponse,
  ReportGenerationTask,
  ReportFilters,
  UseAIReportsReturn,
} from '@/lib/types/ai-reports';
import {
  AIReportsError,
  ValidationError,
  GenerationError,
  DEFAULT_REPORT_FILTERS,
} from '@/lib/types/ai-reports';

// Query keys
const QUERY_KEYS = {
  reports: (filters?: ReportFilters) => ['ai-reports', 'reports', filters] as const,
  report: (id: string) => ['ai-reports', 'report', id] as const,
  task: (id: string) => ['ai-reports', 'task', id] as const,
} as const;

/**
 * Custom hook for AI Reports
 * Provides state management and API interactions for AI reports functionality using TanStack Query
 */
export function useAIReports(filters: ReportFilters = DEFAULT_REPORT_FILTERS): UseAIReportsReturn {
  const queryClient = useQueryClient();
  
  // Local state for current report and generating status
  const [currentReport, setCurrentReport] = useState<TradingReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [localError, setLocalError] = useState<Error | null>(null);

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
   * Handle errors with toast notifications
   */
  const handleError = useCallback((error: Error, context?: string) => {
    console.error(`AI Reports Error${context ? ` (${context})` : ''}:`, error);
    
    let message = 'An unexpected error occurred';
    
    if (error instanceof ValidationError) {
      message = `Validation Error: ${error.message}`;
    } else if (error instanceof GenerationError) {
      message = `Generation Error: ${error.message}`;
    } else if (error instanceof AIReportsError) {
      message = `AI Reports Error: ${error.message}`;
    } else if (error.message) {
      message = error.message;
    }
    
    setLocalError(error);
    toast.error(message);
  }, []);

  // Query for reports list
  const {
    data: reportsData,
    isLoading: loading,
    error: reportsError,
    refetch: refetchReports,
  } = useQuery({
    queryKey: QUERY_KEYS.reports(filters),
    queryFn: () => {
      console.log('Fetching reports with filters:', filters);
      return aiReportsService.getReports(filters);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      if (error instanceof AIReportsError && error.code === 'AUTH_ERROR') {
        return false; // Don't retry auth errors
      }
      return failureCount < 3;
    },
  });

  // Handle query success/error with useEffect
  useEffect(() => {
    if (reportsData) {
      console.log('Reports loaded successfully:', reportsData);
    }
  }, [reportsData]);

  useEffect(() => {
    if (reportsError) {
      console.error('Failed to load reports:', reportsError);
      handleError(reportsError as Error, 'fetchReports');
    }
  }, [reportsError, handleError]);

  // Generate report mutation
  const generateReportMutation = useMutation({
    mutationFn: (request: ReportRequest) => aiReportsService.generateReport(request),
    onMutate: () => {
      setGenerating(true);
      setLocalError(null);
    },
    onSuccess: (report) => {
      // Add to reports list
      const reportSummary: ReportSummary = {
        id: report.id,
        report_type: report.report_type,
        title: report.title,
        time_range: report.time_range,
        summary: report.summary,
        generated_at: report.generated_at,
        expires_at: report.expires_at,
        trade_count: report.analytics.total_trades,
        total_pnl: report.analytics.total_pnl,
        win_rate: report.analytics.win_rate,
        risk_score: report.risk_metrics.risk_score,
        sections_count: Object.keys(report).length,
      };
      
      // Update reports cache
      queryClient.setQueryData(QUERY_KEYS.reports(filters), (old: ReportListResponse | undefined) => {
        if (!old) return { reports: [reportSummary], total_count: 1, has_more: false };
        return {
          ...old,
          reports: [reportSummary, ...old.reports],
          total_count: old.total_count + 1,
        };
      });
      
      // Set as current report
      setCurrentReport(report);
      
      toast.success('Report generated successfully!');
    },
    onError: (error) => {
      handleError(error as Error, 'generateReport');
    },
    onSettled: () => {
      setGenerating(false);
    },
  });

  // Generate report async mutation
  const generateReportAsyncMutation = useMutation({
    mutationFn: (request: ReportRequest) => aiReportsService.generateReportAsync(request),
    onMutate: () => {
      setGenerating(true);
      setLocalError(null);
    },
    onSuccess: () => {
      toast.success('Report generation started!');
    },
    onError: (error) => {
      handleError(error as Error, 'generateReportAsync');
    },
    onSettled: () => {
      setGenerating(false);
    },
  });

  // Delete report mutation
  const deleteReportMutation = useMutation({
    mutationFn: (reportId: string) => aiReportsService.deleteReport(reportId),
    onSuccess: (_, reportId) => {
      // Update reports cache
      queryClient.setQueryData(QUERY_KEYS.reports(filters), (old: ReportListResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          reports: old.reports.filter(report => report.id !== reportId),
          total_count: old.total_count - 1,
        };
      });
      
      // Clear current report if it's the deleted one
      if (currentReport?.id === reportId) {
        setCurrentReport(null);
      }
      
      toast.success('Report deleted successfully');
    },
    onError: (error) => {
      handleError(error as Error, 'deleteReport');
    },
  });

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setLocalError(null);
  }, []);

  /**
   * Clear current report
   */
  const clearCurrentReport = useCallback(() => {
    setCurrentReport(null);
  }, []);

  /**
   * Generate report synchronously
   */
  const generateReport = useCallback(async (request: ReportRequest): Promise<void> => {
    try {
      await generateReportMutation.mutateAsync(request);
    } catch (error) {
      throw error;
    }
  }, [generateReportMutation]);

  /**
   * Generate report asynchronously
   */
  const generateReportAsync = useCallback(async (request: ReportRequest): Promise<string> => {
    try {
      return await generateReportAsyncMutation.mutateAsync(request);
    } catch (error) {
      throw error;
    }
  }, [generateReportAsyncMutation]);

  /**
   * Get reports with filters
   */
  const getReports = useCallback(async (newFilters: ReportFilters = DEFAULT_REPORT_FILTERS): Promise<void> => {
    try {
      await refetchReports();
    } catch (error) {
      throw error;
    }
  }, [refetchReports]);

  /**
   * Get specific report by ID
   */
  const getReport = useCallback(async (reportId: string): Promise<void> => {
    try {
      console.log('Attempting to load report:', reportId);
      setLocalError(null); // Clear any previous errors
      const report = await aiReportsService.getReport(reportId);
      setCurrentReport(report);
      console.log('Successfully loaded report:', reportId);
    } catch (error) {
      console.error('Failed to load report:', reportId, error);
      setCurrentReport(null); // Clear current report on error
      handleError(error as Error, 'getReport');
      throw error;
    }
  }, [handleError]);

  /**
   * Delete report
   */
  const deleteReport = useCallback(async (reportId: string): Promise<void> => {
    try {
      await deleteReportMutation.mutateAsync(reportId);
    } catch (error) {
      throw error;
    }
  }, [deleteReportMutation]);

  /**
   * Refresh reports list
   */
  const refreshReports = useCallback(async (): Promise<void> => {
    try {
      await refetchReports();
      toast.success('Reports refreshed');
    } catch (error) {
      // Error already handled in refetchReports
    }
  }, [refetchReports]);

  /**
   * Get task status
   */
  const getTaskStatus = useCallback(async (taskId: string): Promise<ReportGenerationTask> => {
    try {
      setLocalError(null);
      return await aiReportsService.getGenerationTask(taskId);
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
    onComplete?: (report: TradingReport) => void
  ): Promise<void> => {
    try {
      setLocalError(null);
      
      // Add to polling refs for cleanup
      pollingRefs.current.add(taskId);
      
      await aiReportsService.pollTaskStatus(
        taskId,
        (completedReport) => {
          // Add to reports list
          const reportSummary: ReportSummary = {
            id: completedReport.id,
            report_type: completedReport.report_type,
            title: completedReport.title,
            time_range: completedReport.time_range,
            summary: completedReport.summary,
            generated_at: completedReport.generated_at,
            expires_at: completedReport.expires_at,
            trade_count: completedReport.analytics.total_trades,
            total_pnl: completedReport.analytics.total_pnl,
            win_rate: completedReport.analytics.win_rate,
            risk_score: completedReport.risk_metrics.risk_score,
            sections_count: Object.keys(completedReport).length,
          };
          
          // Update reports cache
          queryClient.setQueryData(QUERY_KEYS.reports(filters), (old: ReportListResponse | undefined) => {
            if (!old) return { reports: [reportSummary], total_count: 1, has_more: false };
            return {
              ...old,
              reports: [reportSummary, ...old.reports],
              total_count: old.total_count + 1,
            };
          });
          
          // Set as current report
          setCurrentReport(completedReport);
          
          // Call completion callback
          onComplete?.(completedReport);
          
          toast.success('Report generation completed!');
        },
        (error) => {
          handleError(error, 'pollTaskStatus');
        },
        (progress) => {
          // Could emit progress updates here if needed
          console.log(`Report generation progress: ${progress}%`);
        }
      );
      
    } catch (error) {
      handleError(error as Error, 'pollTaskStatus');
      throw error;
    } finally {
      // Remove from polling refs
      pollingRefs.current.delete(taskId);
    }
  }, [handleError, queryClient, filters]);

  // Combine errors
  const error = localError || reportsError;

  // Debug logging
  useEffect(() => {
    console.log('useAIReports hook state:', {
      loading,
      reportsCount: reportsData?.reports?.length || 0,
      reports: reportsData?.reports || [],
      error: error?.message,
      filters
    });
  }, [loading, reportsData, error, filters]);

  return {
    // State
    reports: reportsData?.reports || [],
    currentReport,
    loading,
    generating,
    error,
    
    // Actions
    generateReport,
    generateReportAsync,
    getReports,
    getReport,
    deleteReport,
    refreshReports,
    
    // Task management
    getTaskStatus,
    pollTaskStatus,
    
    // Utilities
    clearError,
    clearCurrentReport,
  };
}

/**
 * Hook for managing report generation with polling
 * Useful for components that need to track async generation
 */
export function useReportGeneration() {
  const [isPolling, setIsPolling] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const aiReports = useAIReports();

  const startGeneration = useCallback(async (
    request: ReportRequest,
    onComplete?: (report: TradingReport) => void
  ): Promise<string> => {
    try {
      setIsPolling(true);
      setProgress(0);
      
      // Start async generation
      const taskId = await aiReports.generateReportAsync(request);
      
      setCurrentTaskId(taskId);
      
      // Start polling with progress updates
      await aiReports.pollTaskStatus(taskId, onComplete);
      
      return taskId;
      
    } catch (error) {
      setIsPolling(false);
      setCurrentTaskId(null);
      setProgress(0);
      throw error;
    } finally {
      setIsPolling(false);
      setCurrentTaskId(null);
      setProgress(0);
    }
  }, [aiReports]);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    setCurrentTaskId(null);
    setProgress(0);
  }, []);

  return {
    isPolling,
    currentTaskId,
    progress,
    startGeneration,
    stopPolling,
    getTaskStatus: aiReports.getTaskStatus,
  };
}

/**
 * Hook for report analytics and statistics
 */
export function useReportAnalytics() {
  const { reports } = useAIReports();
  
  const analytics = useCallback(() => {
    const totalReports = reports.length;
    const reportsByType = reports.reduce((acc, report) => {
      acc[report.report_type] = (acc[report.report_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const avgRiskScore = reports.length > 0 
      ? reports.reduce((sum, report) => sum + report.risk_score, 0) / reports.length
      : 0;
    
    const avgWinRate = reports.length > 0 
      ? reports.reduce((sum, report) => sum + report.win_rate, 0) / reports.length
      : 0;
    
    const totalPnl = reports.reduce((sum, report) => sum + report.total_pnl, 0);
    
    const recentReports = reports.filter(report => {
      const generatedAt = new Date(report.generated_at);
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return generatedAt > oneWeekAgo;
    });
    
    const generationFrequency = recentReports.length / 7; // reports per day
    
    return {
      totalReports,
      reportsByType,
      avgRiskScore,
      avgWinRate,
      totalPnl,
      generationFrequency,
      recentReportsCount: recentReports.length,
    };
  }, [reports]);
  
  return analytics();
}

/**
 * Hook for getting a specific report by ID with caching
 */
export function useReport(reportId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.report(reportId),
    queryFn: () => aiReportsService.getReport(reportId),
    enabled: !!reportId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      if (error instanceof AIReportsError && error.code === 'NOT_FOUND') {
        return false; // Don't retry if report not found
      }
      return failureCount < 3;
    },
  });
}

/**
 * Hook for getting task status with polling
 */
export function useTaskStatus(taskId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: QUERY_KEYS.task(taskId),
    queryFn: () => aiReportsService.getGenerationTask(taskId),
    enabled: enabled && !!taskId,
    refetchInterval: (query) => {
      // Poll every 2 seconds if task is pending or processing
      const data = query.state.data as ReportGenerationTask | undefined;
      if (data?.status === 'pending' || data?.status === 'processing') {
        return 2000;
      }
      return false; // Stop polling if completed, failed, or expired
    },
    staleTime: 0, // Always consider stale for real-time updates
  });
}

/**
 * Hook for reports with filters using TanStack Query
 */
export function useReports(filters: ReportFilters = DEFAULT_REPORT_FILTERS) {
  return useQuery({
    queryKey: QUERY_KEYS.reports(filters),
    queryFn: () => aiReportsService.getReports(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      if (error instanceof AIReportsError && error.code === 'AUTH_ERROR') {
        return false; // Don't retry auth errors
      }
      return failureCount < 3;
    },
  });
}