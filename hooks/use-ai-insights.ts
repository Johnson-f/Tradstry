import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { aiInsightsService } from '@/lib/services/ai-insights-service';
import type {
  AIInsight,
  AIInsightCreate,
  AIInsightUpdate,
  AIInsightGenerateRequest,
  InsightDeleteResponse,
  InsightExpireResponse,
  PriorityInsightsResponse,
  ActionableInsightsResponse
} from '@/lib/services/ai-insights-service';

// Query keys for TanStack Query
export const aiInsightsKeys = {
  all: ['ai-insights'] as const,
  insights: () => [...aiInsightsKeys.all, 'insights'] as const,
  insightsList: (params?: {
    insight_type?: string;
    priority?: string;
    actionable?: boolean;
    tags?: string[];
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  }) => [...aiInsightsKeys.insights(), 'list', params] as const,
  insight: (id: string) => [...aiInsightsKeys.insights(), id] as const,
  priorityInsights: (limit?: number) => [...aiInsightsKeys.insights(), 'priority', limit] as const,
  actionableInsights: (limit?: number) => [...aiInsightsKeys.insights(), 'actionable', limit] as const,
  searchInsights: (params: {
    query: string;
    insight_type?: string;
    limit?: number;
    similarity_threshold?: number;
  }) => [...aiInsightsKeys.insights(), 'search', params] as const,
} as const;

interface UseAIInsightsState {
  currentInsight: AIInsight | null;
  isGenerating: boolean;
}

interface UseAIInsightsReturn extends UseAIInsightsState {
  // Query states
  insights: AIInsight[];
  insightsLoading: boolean;
  insightsError: Error | null;
  
  priorityInsights: PriorityInsightsResponse[];
  priorityInsightsLoading: boolean;
  priorityInsightsError: Error | null;
  
  actionableInsights: ActionableInsightsResponse[];
  actionableInsightsLoading: boolean;
  actionableInsightsError: Error | null;
  
  searchResults: AIInsight[];
  searchLoading: boolean;
  searchError: Error | null;

  // Mutations
  createInsight: {
    mutate: (insightData: AIInsightCreate) => void;
    mutateAsync: (insightData: AIInsightCreate) => Promise<{ success: boolean; data: AIInsight }>;
    isPending: boolean;
    error: Error | null;
  };
  
  updateInsight: {
    mutate: (variables: { insightId: string; insightData: AIInsightUpdate }) => void;
    mutateAsync: (variables: { insightId: string; insightData: AIInsightUpdate }) => Promise<{ success: boolean; data: AIInsight }>;
    isPending: boolean;
    error: Error | null;
  };
  
  deleteInsight: {
    mutate: (variables: { insightId: string; softDelete?: boolean }) => void;
    mutateAsync: (variables: { insightId: string; softDelete?: boolean }) => Promise<InsightDeleteResponse>;
    isPending: boolean;
    error: Error | null;
  };
  
  expireInsight: {
    mutate: (insightId: string) => void;
    mutateAsync: (insightId: string) => Promise<InsightExpireResponse>;
    isPending: boolean;
    error: Error | null;
  };
  
  generateInsights: {
    mutate: (request: AIInsightGenerateRequest) => void;
    mutateAsync: (request: AIInsightGenerateRequest) => Promise<{ success: boolean; message: string; data: AIInsight[] }>;
    isPending: boolean;
    error: Error | null;
  };

  // Query functions
  refetchInsights: () => void;
  refetchPriorityInsights: () => void;
  refetchActionableInsights: () => void;
  searchInsights: (params: {
    query: string;
    insight_type?: string;
    limit?: number;
    similarity_threshold?: number;
  }) => void;

  // Utility
  setCurrentInsight: (insight: AIInsight | null) => void;
}

interface UseAIInsightsParams {
  insightsParams?: {
    insight_type?: string;
    priority?: string;
    actionable?: boolean;
    tags?: string[];
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  };
  priorityLimit?: number;
  actionableLimit?: number;
}

export function useAIInsights(params: UseAIInsightsParams = {}): UseAIInsightsReturn {
  const { insightsParams, priorityLimit, actionableLimit } = params;
  const queryClient = useQueryClient();
  
  const [localState, setLocalState] = useState<UseAIInsightsState>({
    currentInsight: null,
    isGenerating: false,
  });

  const setCurrentInsight = useCallback((insight: AIInsight | null) => {
    setLocalState(prev => ({ ...prev, currentInsight: insight }));
  }, []);

  // Queries
  const {
    data: insights = [],
    isLoading: insightsLoading,
    error: insightsError,
    refetch: refetchInsights,
  } = useQuery({
    queryKey: aiInsightsKeys.insightsList(insightsParams),
    queryFn: () => aiInsightsService.getInsights(insightsParams),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const {
    data: priorityInsights = [],
    isLoading: priorityInsightsLoading,
    error: priorityInsightsError,
    refetch: refetchPriorityInsights,
  } = useQuery({
    queryKey: aiInsightsKeys.priorityInsights(priorityLimit),
    queryFn: () => aiInsightsService.getPriorityInsights(priorityLimit),
    staleTime: 3 * 60 * 1000, // 3 minutes
  });

  const {
    data: actionableInsights = [],
    isLoading: actionableInsightsLoading,
    error: actionableInsightsError,
    refetch: refetchActionableInsights,
  } = useQuery({
    queryKey: aiInsightsKeys.actionableInsights(actionableLimit),
    queryFn: () => aiInsightsService.getActionableInsights(actionableLimit),
    staleTime: 3 * 60 * 1000, // 3 minutes
  });

  const [searchParams, setSearchParams] = useState<{
    query: string;
    insight_type?: string;
    limit?: number;
    similarity_threshold?: number;
  } | null>(null);

  const {
    data: searchResults = [],
    isLoading: searchLoading,
    error: searchError,
  } = useQuery({
    queryKey: aiInsightsKeys.searchInsights(searchParams!),
    queryFn: () => aiInsightsService.searchInsights(searchParams!),
    enabled: !!searchParams,
    staleTime: 1 * 60 * 1000, // 1 minute
  });

  // Mutations
  const createInsightMutation = useMutation({
    mutationFn: (insightData: AIInsightCreate) => aiInsightsService.createInsight(insightData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiInsightsKeys.insights() });
    },
  });

  const updateInsightMutation = useMutation({
    mutationFn: ({ insightId, insightData }: { insightId: string; insightData: AIInsightUpdate }) =>
      aiInsightsService.updateInsight(insightId, insightData),
    onSuccess: (_, { insightId }) => {
      queryClient.invalidateQueries({ queryKey: aiInsightsKeys.insights() });
      queryClient.invalidateQueries({ queryKey: aiInsightsKeys.insight(insightId) });
    },
  });

  const deleteInsightMutation = useMutation({
    mutationFn: ({ insightId, softDelete }: { insightId: string; softDelete?: boolean }) =>
      aiInsightsService.deleteInsight(insightId, softDelete),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiInsightsKeys.insights() });
    },
  });

  const expireInsightMutation = useMutation({
    mutationFn: (insightId: string) => aiInsightsService.expireInsight(insightId),
    onSuccess: (_, insightId) => {
      queryClient.invalidateQueries({ queryKey: aiInsightsKeys.insights() });
      queryClient.invalidateQueries({ queryKey: aiInsightsKeys.insight(insightId) });
    },
  });

  const generateInsightsMutation = useMutation({
    mutationFn: (request: AIInsightGenerateRequest) => {
      setLocalState(prev => ({ ...prev, isGenerating: true }));
      return aiInsightsService.generateInsights(request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiInsightsKeys.insights() });
    },
    onSettled: () => {
      setLocalState(prev => ({ ...prev, isGenerating: false }));
    },
  });

  const searchInsights = useCallback((params: {
    query: string;
    insight_type?: string;
    limit?: number;
    similarity_threshold?: number;
  }) => {
    setSearchParams(params);
  }, []);

  return {
    ...localState,
    // Query states
    insights,
    insightsLoading,
    insightsError,
    priorityInsights,
    priorityInsightsLoading,
    priorityInsightsError,
    actionableInsights,
    actionableInsightsLoading,
    actionableInsightsError,
    searchResults,
    searchLoading,
    searchError,
    // Mutations
    createInsight: {
      mutate: createInsightMutation.mutate,
      mutateAsync: createInsightMutation.mutateAsync,
      isPending: createInsightMutation.isPending,
      error: createInsightMutation.error,
    },
    updateInsight: {
      mutate: updateInsightMutation.mutate,
      mutateAsync: updateInsightMutation.mutateAsync,
      isPending: updateInsightMutation.isPending,
      error: updateInsightMutation.error,
    },
    deleteInsight: {
      mutate: deleteInsightMutation.mutate,
      mutateAsync: deleteInsightMutation.mutateAsync,
      isPending: deleteInsightMutation.isPending,
      error: deleteInsightMutation.error,
    },
    expireInsight: {
      mutate: expireInsightMutation.mutate,
      mutateAsync: expireInsightMutation.mutateAsync,
      isPending: expireInsightMutation.isPending,
      error: expireInsightMutation.error,
    },
    generateInsights: {
      mutate: generateInsightsMutation.mutate,
      mutateAsync: generateInsightsMutation.mutateAsync,
      isPending: generateInsightsMutation.isPending,
      error: generateInsightsMutation.error,
    },
    // Query functions
    refetchInsights,
    refetchPriorityInsights,
    refetchActionableInsights,
    searchInsights,
    // Utility
    setCurrentInsight,
  };
}
