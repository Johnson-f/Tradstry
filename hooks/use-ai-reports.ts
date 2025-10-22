import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
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

/**
 * Custom hook for AI Reports
 * Provides state management and API interactions for AI reports functionality
 */
export function useAIReports(): UseAIReportsReturn {
  // State
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [currentReport, setCurrentReport] = useState<TradingReport | null>(null);
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
   * Clear current report
   */
  const clearCurrentReport = useCallback(() => {
    setCurrentReport(null);
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
    
    setError(error);
    toast.error(message);
  }, []);

  /**
   * Generate report synchronously
   */
  const generateReport = useCallback(async (request: ReportRequest): Promise<void> => {
    try {
      setGenerating(true);
      setError(null);
      
      const report = await aiReportsService.generateReport(request);
      
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
      
      setReports(prev => [reportSummary, ...prev]);
      
      // Set as current report
      setCurrentReport(report);
      
      toast.success('Report generated successfully!');
      
    } catch (error) {
      handleError(error as Error, 'generateReport');
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [handleError]);

  /**
   * Generate report asynchronously
   */
  const generateReportAsync = useCallback(async (request: ReportRequest): Promise<string> => {
    try {
      setGenerating(true);
      setError(null);
      
      const taskId = await aiReportsService.generateReportAsync(request);
      
      toast.success('Report generation started!');
      
      return taskId;
      
    } catch (error) {
      handleError(error as Error, 'generateReportAsync');
      throw error;
    } finally {
      setGenerating(false);
    }
  }, [handleError]);

  /**
   * Get reports with filters
   */
  const getReports = useCallback(async (filters: ReportFilters = DEFAULT_REPORT_FILTERS): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await aiReportsService.getReports(filters);
      
      setReports(response.reports);
      
    } catch (error) {
      handleError(error as Error, 'getReports');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  /**
   * Get specific report by ID
   */
  const getReport = useCallback(async (reportId: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      const report = await aiReportsService.getReport(reportId);
      
      setCurrentReport(report);
      
    } catch (error) {
      handleError(error as Error, 'getReport');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  /**
   * Delete report
   */
  const deleteReport = useCallback(async (reportId: string): Promise<void> => {
    try {
      setError(null);
      
      await aiReportsService.deleteReport(reportId);
      
      // Remove from reports list
      setReports(prev => prev.filter(report => report.id !== reportId));
      
      // Clear current report if it's the deleted one
      if (currentReport?.id === reportId) {
        setCurrentReport(null);
      }
      
      toast.success('Report deleted successfully');
      
    } catch (error) {
      handleError(error as Error, 'deleteReport');
      throw error;
    }
  }, [currentReport, handleError]);

  /**
   * Refresh reports list
   */
  const refreshReports = useCallback(async (): Promise<void> => {
    try {
      await getReports();
      toast.success('Reports refreshed');
    } catch (error) {
      // Error already handled in getReports
    }
  }, [getReports]);

  /**
   * Get task status
   */
  const getTaskStatus = useCallback(async (taskId: string): Promise<ReportGenerationTask> => {
    try {
      setError(null);
      
      const task = await aiReportsService.getGenerationTask(taskId);
      
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
    onComplete?: (report: TradingReport) => void
  ): Promise<void> => {
    try {
      setError(null);
      
      // Add to polling refs for cleanup
      pollingRefs.current.add(taskId);
      
      const report = await aiReportsService.pollTaskStatus(
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
          
          setReports(prev => [reportSummary, ...prev]);
          
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
  }, [handleError]);

  /**
   * Load initial reports on mount
   */
  useEffect(() => {
    getReports().catch(() => {
      // Error already handled in getReports
    });
  }, [getReports]);

  return {
    // State
    reports,
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
  const { pollTaskStatus, getTaskStatus } = useAIReports();

  const startGeneration = useCallback(async (
    request: ReportRequest,
    onComplete?: (report: TradingReport) => void
  ): Promise<string> => {
    try {
      setIsPolling(true);
      setProgress(0);
      
      // Start async generation
      const { generateReportAsync } = useAIReports();
      const taskId = await generateReportAsync(request);
      
      setCurrentTaskId(taskId);
      
      // Start polling with progress updates
      await pollTaskStatus(taskId, onComplete);
      
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
  }, [pollTaskStatus]);

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
    getTaskStatus,
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

