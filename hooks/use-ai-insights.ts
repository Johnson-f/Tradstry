import { useState, useCallback } from 'react';
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

interface UseAIInsightsState {
  insights: AIInsight[];
  priorityInsights: PriorityInsightsResponse[];
  actionableInsights: ActionableInsightsResponse[];
  currentInsight: AIInsight | null;
  loading: boolean;
  error: string | null;
  isGenerating: boolean;
}

interface UseAIInsightsActions {
  // Insight operations
  createInsight: (insightData: AIInsightCreate) => Promise<{ success: boolean; data: AIInsight }>;
  updateInsight: (insightId: string, insightData: AIInsightUpdate) => Promise<{ success: boolean; data: AIInsight }>;
  deleteInsight: (insightId: string, softDelete?: boolean) => Promise<InsightDeleteResponse>;
  expireInsight: (insightId: string) => Promise<InsightExpireResponse>;

  // Retrieval operations
  getInsights: (params?: {
    insight_type?: string;
    priority?: string;
    actionable?: boolean;
    tags?: string[];
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  }) => Promise<void>;
  getPriorityInsights: (limit?: number) => Promise<void>;
  getActionableInsights: (limit?: number) => Promise<void>;
  getInsight: (insightId: string) => Promise<void>;

  // Generation operations
  generateInsights: (request: AIInsightGenerateRequest) => Promise<{ success: boolean; message: string; data: AIInsight[] }>;
  searchInsights: (params: {
    query: string;
    insight_type?: string;
    limit?: number;
    similarity_threshold?: number;
  }) => Promise<void>;

  // Utility
  clearError: () => void;
  setCurrentInsight: (insight: AIInsight | null) => void;
}

type UseAIInsightsReturn = UseAIInsightsState & UseAIInsightsActions;

export function useAIInsights(): UseAIInsightsReturn {
  const [state, setState] = useState<UseAIInsightsState>({
    insights: [],
    priorityInsights: [],
    actionableInsights: [],
    currentInsight: null,
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

  const setCurrentInsight = useCallback((insight: AIInsight | null) => {
    setState(prev => ({ ...prev, currentInsight: insight }));
  }, []);

  // Insight operations
  const createInsight = useCallback(async (insightData: AIInsightCreate): Promise<{ success: boolean; data: AIInsight }> => {
    setLoading(true);
    try {
      const result = await aiInsightsService.createInsight(insightData);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to create insight';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const updateInsight = useCallback(async (insightId: string, insightData: AIInsightUpdate): Promise<{ success: boolean; data: AIInsight }> => {
    setLoading(true);
    try {
      const result = await aiInsightsService.updateInsight(insightId, insightData);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to update insight';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const deleteInsight = useCallback(async (insightId: string, softDelete?: boolean): Promise<InsightDeleteResponse> => {
    setLoading(true);
    try {
      const result = await aiInsightsService.deleteInsight(insightId, softDelete);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to delete insight';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const expireInsight = useCallback(async (insightId: string): Promise<InsightExpireResponse> => {
    setLoading(true);
    try {
      const result = await aiInsightsService.expireInsight(insightId);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to expire insight';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  // Retrieval operations
  const getInsights = useCallback(async (params?: {
    insight_type?: string;
    priority?: string;
    actionable?: boolean;
    tags?: string[];
    search_query?: string;
    limit?: number;
    offset?: number;
    order_by?: string;
    order_direction?: 'ASC' | 'DESC';
  }): Promise<void> => {
    setLoading(true);
    try {
      const insights = await aiInsightsService.getInsights(params);
      setState(prev => ({ ...prev, insights, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load insights';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const getPriorityInsights = useCallback(async (limit?: number): Promise<void> => {
    setLoading(true);
    try {
      const priorityInsights = await aiInsightsService.getPriorityInsights(limit);
      setState(prev => ({ ...prev, priorityInsights, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load priority insights';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const getActionableInsights = useCallback(async (limit?: number): Promise<void> => {
    setLoading(true);
    try {
      const actionableInsights = await aiInsightsService.getActionableInsights(limit);
      setState(prev => ({ ...prev, actionableInsights, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load actionable insights';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const getInsight = useCallback(async (insightId: string): Promise<void> => {
    setLoading(true);
    try {
      const insight = await aiInsightsService.getInsight(insightId);
      setState(prev => ({ ...prev, currentInsight: insight, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to load insight';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  // Generation operations
  const generateInsights = useCallback(async (request: AIInsightGenerateRequest): Promise<{ success: boolean; message: string; data: AIInsight[] }> => {
    setGenerating(true);
    try {
      const result = await aiInsightsService.generateInsights(request);
      setError(null);
      return result;
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to generate insights';
      setError(errorMessage);
      throw err;
    } finally {
      setGenerating(false);
    }
  }, [setGenerating, setError]);

  const searchInsights = useCallback(async (params: {
    query: string;
    insight_type?: string;
    limit?: number;
    similarity_threshold?: number;
  }): Promise<void> => {
    setLoading(true);
    try {
      const insights = await aiInsightsService.searchInsights(params);
      setState(prev => ({ ...prev, insights, error: null }));
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to search insights';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  return {
    ...state,
    createInsight,
    updateInsight,
    deleteInsight,
    expireInsight,
    getInsights,
    getPriorityInsights,
    getActionableInsights,
    getInsight,
    generateInsights,
    searchInsights,
    clearError,
    setCurrentInsight,
  };
}
