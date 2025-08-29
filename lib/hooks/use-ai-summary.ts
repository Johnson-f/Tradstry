/**
 * AI Summary Hooks - React Query hooks for AI trading analysis
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiSummaryService } from '../services/ai-summary-service';
import type {
  AnalysisRequest,
  AnalysisResponse,
  ChatRequest,
  ChatResponse,
  QuickInsightsResponse,
  AIServiceStatus,
  ResetChatResponse,
  AIReportResponse,
  AIReportStats,
  SimilarReportsRequest,
  ReportSearchRequest,
  ChatHistoryItem,
  SimilarChatResponse,
  ChatStats,
  DeleteChatResponse,
  HealthCheckResponse,
} from '../types/ai-summary';

// Query Keys
export const aiSummaryKeys = {
  all: ['ai-summary'] as const,
  quickInsights: (timeRange: string) => [...aiSummaryKeys.all, 'quick-insights', timeRange] as const,
  status: () => [...aiSummaryKeys.all, 'status'] as const,
  reports: () => [...aiSummaryKeys.all, 'reports'] as const,
  reportsList: (params?: ReportSearchRequest) => [...aiSummaryKeys.reports(), 'list', params] as const,
  reportDetail: (id: string) => [...aiSummaryKeys.reports(), 'detail', id] as const,
  reportStats: (daysBack: number) => [...aiSummaryKeys.reports(), 'stats', daysBack] as const,
  chatHistory: (limit: number, offset: number) => [...aiSummaryKeys.all, 'chat', 'history', limit, offset] as const,
  chatStats: (daysBack: number) => [...aiSummaryKeys.all, 'chat', 'stats', daysBack] as const,
  health: () => [...aiSummaryKeys.all, 'health'] as const,
};

// Analysis Hooks

/**
 * Generate AI trading analysis report
 */
export function useGenerateAnalysis() {
  const queryClient = useQueryClient();

  return useMutation<AnalysisResponse, Error, AnalysisRequest>({
    mutationFn: (request: AnalysisRequest) => aiSummaryService.generateAnalysis(request),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: aiSummaryKeys.reports() });
      queryClient.invalidateQueries({ queryKey: aiSummaryKeys.status() });
    },
  });
}

/**
 * Chat with AI about trading analysis
 */
export function useChatWithAI() {
  const queryClient = useQueryClient();

  return useMutation<ChatResponse, Error, ChatRequest>({
    mutationFn: (request: ChatRequest) => aiSummaryService.chatWithAI(request),
    onSuccess: () => {
      // Invalidate chat history
      queryClient.invalidateQueries({ queryKey: [...aiSummaryKeys.all, 'chat'] });
    },
  });
}

/**
 * Get quick trading insights
 */
export function useQuickInsights(timeRange: string = '7d', enabled: boolean = true) {
  return useQuery<QuickInsightsResponse, Error>({
    queryKey: aiSummaryKeys.quickInsights(timeRange),
    queryFn: () => aiSummaryService.getQuickInsights(timeRange),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Get AI service status
 */
export function useAIStatus(enabled: boolean = true) {
  return useQuery<AIServiceStatus, Error>({
    queryKey: aiSummaryKeys.status(),
    queryFn: () => aiSummaryService.getStatus(),
    enabled,
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
    staleTime: 10 * 1000, // 10 seconds
  });
}

/**
 * Reset chat context
 */
export function useResetChatContext() {
  const queryClient = useQueryClient();

  return useMutation<ResetChatResponse, Error>({
    mutationFn: () => aiSummaryService.resetChatContext(),
    onSuccess: () => {
      // Invalidate chat-related queries
      queryClient.invalidateQueries({ queryKey: [...aiSummaryKeys.all, 'chat'] });
      queryClient.invalidateQueries({ queryKey: aiSummaryKeys.status() });
    },
  });
}

// Report Management Hooks

/**
 * Get user's AI reports with filtering and pagination
 */
export function useReports(params?: ReportSearchRequest, enabled: boolean = true) {
  return useQuery<AIReportResponse[], Error>({
    queryKey: aiSummaryKeys.reportsList(params),
    queryFn: () => aiSummaryService.getReports(params),
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Get AI report by ID
 */
export function useReportById(reportId: string, enabled: boolean = true) {
  return useQuery<AIReportResponse, Error>({
    queryKey: aiSummaryKeys.reportDetail(reportId),
    queryFn: () => aiSummaryService.getReportById(reportId),
    enabled: enabled && !!reportId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Search similar reports
 */
export function useSearchSimilarReports() {
  return useMutation<AIReportResponse[], Error, SimilarReportsRequest>({
    mutationFn: (request: SimilarReportsRequest) => aiSummaryService.searchSimilarReports(request),
  });
}

/**
 * Get AI report statistics
 */
export function useReportStats(daysBack: number = 30, enabled: boolean = true) {
  return useQuery<AIReportStats, Error>({
    queryKey: aiSummaryKeys.reportStats(daysBack),
    queryFn: () => aiSummaryService.getReportStats(daysBack),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Chat History Hooks

/**
 * Get chat Q&A history
 */
export function useChatHistory(limit: number = 20, offset: number = 0, enabled: boolean = true) {
  return useQuery<ChatHistoryItem[], Error>({
    queryKey: aiSummaryKeys.chatHistory(limit, offset),
    queryFn: () => aiSummaryService.getChatHistory(limit, offset),
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Search similar chat questions
 */
export function useSearchSimilarChatQuestions() {
  return useMutation<SimilarChatResponse, Error, SimilarReportsRequest>({
    mutationFn: (request: SimilarReportsRequest) => aiSummaryService.searchSimilarChatQuestions(request),
  });
}

/**
 * Get chat statistics
 */
export function useChatStats(daysBack: number = 30, enabled: boolean = true) {
  return useQuery<ChatStats, Error>({
    queryKey: aiSummaryKeys.chatStats(daysBack),
    queryFn: () => aiSummaryService.getChatStats(daysBack),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Delete chat Q&A pair
 */
export function useDeleteChatQAPair() {
  const queryClient = useQueryClient();

  return useMutation<DeleteChatResponse, Error, string>({
    mutationFn: (qaId: string) => aiSummaryService.deleteChatQAPair(qaId),
    onSuccess: () => {
      // Invalidate chat history and stats
      queryClient.invalidateQueries({ queryKey: [...aiSummaryKeys.all, 'chat'] });
    },
  });
}

/**
 * Health check
 */
export function useAIHealthCheck(enabled: boolean = true) {
  return useQuery<HealthCheckResponse, Error>({
    queryKey: aiSummaryKeys.health(),
    queryFn: () => aiSummaryService.healthCheck(),
    enabled,
    refetchInterval: 60 * 1000, // Refetch every minute
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Utility Hooks

/**
 * Prefetch quick insights for better UX
 */
export function usePrefetchQuickInsights() {
  const queryClient = useQueryClient();

  return (timeRange: string = '7d') => {
    queryClient.prefetchQuery({
      queryKey: aiSummaryKeys.quickInsights(timeRange),
      queryFn: () => aiSummaryService.getQuickInsights(timeRange),
      staleTime: 5 * 60 * 1000,
    });
  };
}

/**
 * Prefetch reports for better UX
 */
export function usePrefetchReports() {
  const queryClient = useQueryClient();

  return (params?: ReportSearchRequest) => {
    queryClient.prefetchQuery({
      queryKey: aiSummaryKeys.reportsList(params),
      queryFn: () => aiSummaryService.getReports(params),
      staleTime: 2 * 60 * 1000,
    });
  };
}

// Dynamic Routing Hooks

/**
 * Chat with AI using dynamic versioned routing
 */
export function useChatWithAIDynamic(version: string = 'v1') {
  const queryClient = useQueryClient();

  return useMutation<ChatResponse, Error, ChatRequest>({
    mutationFn: (request: ChatRequest) => aiSummaryService.chatWithAIDynamic(request, version),
    onSuccess: () => {
      // Invalidate chat history for both static and dynamic
      queryClient.invalidateQueries({ queryKey: [...aiSummaryKeys.all, 'chat'] });
    },
  });
}

/**
 * Generate analysis using dynamic versioned routing
 */
export function useGenerateAnalysisDynamic(version: string = 'v1') {
  const queryClient = useQueryClient();

  return useMutation<AnalysisResponse, Error, AnalysisRequest>({
    mutationFn: (request: AnalysisRequest) => aiSummaryService.generateAnalysisDynamic(request, version),
    onSuccess: () => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: aiSummaryKeys.reports() });
      queryClient.invalidateQueries({ queryKey: aiSummaryKeys.status() });
    },
  });
}

/**
 * Call service-based dynamic routing
 */
export function useServiceDynamic() {
  return useMutation<any, Error, { serviceType: string; action?: string; payload?: any }>({
    mutationFn: ({ serviceType, action, payload }) => 
      aiSummaryService.callServiceDynamic(serviceType, action, payload),
  });
}

/**
 * Access feature-controlled endpoints
 */
export function useFeatureAccess(featureName: string, enabled: boolean = true) {
  return useQuery<any, Error>({
    queryKey: [...aiSummaryKeys.all, 'feature', featureName],
    queryFn: () => aiSummaryService.accessFeature(featureName),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Call wildcard dynamic routing
 */
export function useDynamicPath() {
  return useMutation<any, Error, { path: string; method?: 'GET' | 'POST'; payload?: any }>({
    mutationFn: ({ path, method = 'GET', payload }) => 
      aiSummaryService.callDynamicPath(path, method, payload),
  });
}
