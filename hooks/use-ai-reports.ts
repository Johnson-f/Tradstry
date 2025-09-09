import { useState, useCallback } from 'react';
import { aiReportsService } from '@/lib/services/ai-reports-service';
import type {
  AIReport,
  AIReportCreate,
  AIReportUpdate,
  AIReportGenerateRequest,
  DeleteResponse
} from '@/lib/services/ai-reports-service';

interface UseAIReportsState {
  reports: AIReport[];
  currentReport: AIReport | null;
  tradingContext: any | null;
  loading: boolean;
  error: string | null;
  isGenerating: boolean;
}

interface UseAIReportsActions {
  // Report operations
  createReport: (reportData: AIReportCreate) => Promise<{ success: boolean; data: AIReport }>;
  updateReport: (reportId: string, reportData: AIReportUpdate) => Promise<{ success: boolean; data: AIReport }>;
  deleteReport: (reportId: string, softDelete?: boolean) => Promise<DeleteResponse>;

  // Retrieval operations
  getReports: (params?: {
    report_type?: string;
    status?: string;
    date_range_start?: string;
    date_range_end?: string;
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  }) => Promise<void>;
  getReport: (reportId: string) => Promise<void>;

  // Generation operations
  generateReport: (request: AIReportGenerateRequest) => Promise<{ success: boolean; message: string; data: AIReport }>;
  getTradingContext: (params?: {
    time_range?: string;
    custom_start_date?: string;
    custom_end_date?: string;
  }) => Promise<void>;

  // Utility
  clearError: () => void;
  setCurrentReport: (report: AIReport | null) => void;
}

type UseAIReportsReturn = UseAIReportsState & UseAIReportsActions;

export function useAIReports(): UseAIReportsReturn {
  const [state, setState] = useState<UseAIReportsState>({
    reports: [],
    currentReport: null,
    tradingContext: null,
    loading: false,
    error: null,
    isGenerating: false,
  });

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error, loading: false, isGenerating: false }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  }, []);

  const setGenerating = useCallback((isGenerating: boolean) => {
    setState(prev => ({ ...prev, isGenerating }));
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  const setCurrentReport = useCallback((report: AIReport | null) => {
    setState(prev => ({ ...prev, currentReport: report }));
  }, []);

  // Report operations
  const createReport = useCallback(async (reportData: AIReportCreate): Promise<{ success: boolean; data: AIReport }> => {
    setLoading(true);
    try {
      const result = await aiReportsService.createReport(reportData);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to create report';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const updateReport = useCallback(async (reportId: string, reportData: AIReportUpdate): Promise<{ success: boolean; data: AIReport }> => {
    setLoading(true);
    try {
      const result = await aiReportsService.updateReport(reportId, reportData);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to update report';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const deleteReport = useCallback(async (reportId: string, softDelete?: boolean): Promise<DeleteResponse> => {
    setLoading(true);
    try {
      const result = await aiReportsService.deleteReport(reportId, softDelete);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to delete report';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  // Retrieval operations
  const getReports = useCallback(async (params?: {
    report_type?: string;
    status?: string;
    date_range_start?: string;
    date_range_end?: string;
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  }): Promise<void> => {
    setLoading(true);
    try {
      const reports = await aiReportsService.getReports(params);
      setState(prev => ({ ...prev, reports, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load reports';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const getReport = useCallback(async (reportId: string): Promise<void> => {
    setLoading(true);
    try {
      const report = await aiReportsService.getReport(reportId);
      setState(prev => ({ ...prev, currentReport: report, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load report';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  // Generation operations
  const generateReport = useCallback(async (request: AIReportGenerateRequest): Promise<{ success: boolean; message: string; data: AIReport }> => {
    setGenerating(true);
    try {
      const result = await aiReportsService.generateReport(request);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to generate report';
      setError(errorMessage);
      throw err;
    } finally {
      setGenerating(false);
    }
  }, [setGenerating, setError]);

  const getTradingContext = useCallback(async (params?: {
    time_range?: string;
    custom_start_date?: string;
    custom_end_date?: string;
  }): Promise<void> => {
    setLoading(true);
    try {
      const context = await aiReportsService.getTradingContext(params);
      setState(prev => ({ ...prev, tradingContext: context.data, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load trading context';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  return {
    ...state,
    createReport,
    updateReport,
    deleteReport,
    getReports,
    getReport,
    generateReport,
    getTradingContext,
    clearError,
    setCurrentReport,
  };
}
