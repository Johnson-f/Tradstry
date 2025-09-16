import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiReportsService } from '@/lib/services/ai-reports-service';
import type {
  AIReport,
  AIReportCreate,
  AIReportUpdate,
  AIReportGenerateRequest,
  DeleteResponse
} from '@/lib/services/ai-reports-service';

// Query keys for TanStack Query
export const aiReportsKeys = {
  all: ['ai-reports'] as const,
  reports: () => [...aiReportsKeys.all, 'reports'] as const,
  reportsList: (params?: {
    report_type?: string;
    status?: string;
    date_range_start?: string;
    date_range_end?: string;
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  }) => [...aiReportsKeys.reports(), 'list', params] as const,
  report: (id: string) => [...aiReportsKeys.reports(), id] as const,
  tradingContext: (params?: {
    time_range?: string;
    custom_start_date?: string;
    custom_end_date?: string;
  }) => [...aiReportsKeys.all, 'trading-context', params] as const,
} as const;

interface UseAIReportsState {
  currentReport: AIReport | null;
  isGenerating: boolean;
}

interface UseAIReportsReturn extends UseAIReportsState {
  // Query states
  reports: AIReport[];
  reportsLoading: boolean;
  reportsError: Error | null;
  
  tradingContext: any | null;
  tradingContextLoading: boolean;
  tradingContextError: Error | null;

  // Mutations
  createReport: {
    mutate: (reportData: AIReportCreate) => void;
    mutateAsync: (reportData: AIReportCreate) => Promise<{ success: boolean; data: AIReport }>;
    isPending: boolean;
    error: Error | null;
  };
  
  updateReport: {
    mutate: (variables: { reportId: string; reportData: AIReportUpdate }) => void;
    mutateAsync: (variables: { reportId: string; reportData: AIReportUpdate }) => Promise<{ success: boolean; data: AIReport }>;
    isPending: boolean;
    error: Error | null;
  };
  
  deleteReport: {
    mutate: (variables: { reportId: string; softDelete?: boolean }) => void;
    mutateAsync: (variables: { reportId: string; softDelete?: boolean }) => Promise<DeleteResponse>;
    isPending: boolean;
    error: Error | null;
  };
  
  generateReport: {
    mutate: (request: AIReportGenerateRequest) => void;
    mutateAsync: (request: AIReportGenerateRequest) => Promise<{ success: boolean; message: string; data: AIReport }>;
    isPending: boolean;
    error: Error | null;
  };

  // Query functions
  refetchReports: () => void;
  refetchTradingContext: () => void;

  // Utility
  setCurrentReport: (report: AIReport | null) => void;
}

interface UseAIReportsParams {
  reportsParams?: {
    report_type?: string;
    status?: string;
    date_range_start?: string;
    date_range_end?: string;
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  };
  tradingContextParams?: {
    time_range?: string;
    custom_start_date?: string;
    custom_end_date?: string;
  };
}

export function useAIReports(params: UseAIReportsParams = {}): UseAIReportsReturn {
  const { reportsParams, tradingContextParams } = params;
  const queryClient = useQueryClient();
  
  const [localState, setLocalState] = useState<UseAIReportsState>({
    currentReport: null,
    isGenerating: false,
  });

  const setCurrentReport = useCallback((report: AIReport | null) => {
    setLocalState(prev => ({ ...prev, currentReport: report }));
  }, []);

  // Queries
  const {
    data: reports = [],
    isLoading: reportsLoading,
    error: reportsError,
    refetch: refetchReports,
  } = useQuery({
    queryKey: aiReportsKeys.reportsList(reportsParams),
    queryFn: () => aiReportsService.getReports(reportsParams),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const {
    data: tradingContextData,
    isLoading: tradingContextLoading,
    error: tradingContextError,
    refetch: refetchTradingContext,
  } = useQuery({
    queryKey: aiReportsKeys.tradingContext(tradingContextParams),
    queryFn: () => aiReportsService.getTradingContext(tradingContextParams),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const tradingContext = tradingContextData?.data || null;

  // Mutations
  const createReportMutation = useMutation({
    mutationFn: (reportData: AIReportCreate) => aiReportsService.createReport(reportData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiReportsKeys.reports() });
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: ({ reportId, reportData }: { reportId: string; reportData: AIReportUpdate }) =>
      aiReportsService.updateReport(reportId, reportData),
    onSuccess: (_, { reportId }) => {
      queryClient.invalidateQueries({ queryKey: aiReportsKeys.reports() });
      queryClient.invalidateQueries({ queryKey: aiReportsKeys.report(reportId) });
    },
  });

  const deleteReportMutation = useMutation({
    mutationFn: ({ reportId, softDelete }: { reportId: string; softDelete?: boolean }) =>
      aiReportsService.deleteReport(reportId, softDelete),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiReportsKeys.reports() });
    },
  });

  const generateReportMutation = useMutation({
    mutationFn: (request: AIReportGenerateRequest) => {
      setLocalState(prev => ({ ...prev, isGenerating: true }));
      return aiReportsService.generateReport(request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiReportsKeys.reports() });
    },
    onSettled: () => {
      setLocalState(prev => ({ ...prev, isGenerating: false }));
    },
  });

  return {
    ...localState,
    // Query states
    reports,
    reportsLoading,
    reportsError,
    tradingContext,
    tradingContextLoading,
    tradingContextError,
    // Mutations
    createReport: {
      mutate: createReportMutation.mutate,
      mutateAsync: createReportMutation.mutateAsync,
      isPending: createReportMutation.isPending,
      error: createReportMutation.error,
    },
    updateReport: {
      mutate: updateReportMutation.mutate,
      mutateAsync: updateReportMutation.mutateAsync,
      isPending: updateReportMutation.isPending,
      error: updateReportMutation.error,
    },
    deleteReport: {
      mutate: deleteReportMutation.mutate,
      mutateAsync: deleteReportMutation.mutateAsync,
      isPending: deleteReportMutation.isPending,
      error: deleteReportMutation.error,
    },
    generateReport: {
      mutate: generateReportMutation.mutate,
      mutateAsync: generateReportMutation.mutateAsync,
      isPending: generateReportMutation.isPending,
      error: generateReportMutation.error,
    },
    // Query functions
    refetchReports,
    refetchTradingContext,
    // Utility
    setCurrentReport,
  };
}
