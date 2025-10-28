'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { playbookService } from '@/lib/services/playbook-service';
import type {
  CreatePlaybookRequest,
  UpdatePlaybookRequest,
  CreateRuleRequest,
  UpdateRuleRequest,
  TagTradeRequest,
  CreateMissedTradeRequest,
  UsePlaybookReturn,
  UsePlaybookListReturn,
  UsePlaybookRulesReturn,
  UseMissedTradesReturn,
  UsePlaybookAnalyticsReturn,
  UseAllPlaybooksAnalyticsReturn,
  UseTradePlaybooksReturn,
} from '@/lib/types/playbook';

// Query keys
export const playbookKeys = {
  all: ['playbooks'] as const,
  lists: () => [...playbookKeys.all, 'list'] as const,
  list: (filters?: Record<string, unknown>) => [...playbookKeys.lists(), { filters }] as const,
  details: () => [...playbookKeys.all, 'detail'] as const,
  detail: (id: string) => [...playbookKeys.details(), id] as const,
  rules: (id: string) => [...playbookKeys.detail(id), 'rules'] as const,
  missedTrades: (id: string) => [...playbookKeys.detail(id), 'missed-trades'] as const,
  analytics: (id: string, timeRange?: string) => [...playbookKeys.detail(id), 'analytics', timeRange] as const,
  allAnalytics: (timeRange?: string) => [...playbookKeys.all, 'analytics', timeRange] as const,
  tradePlaybooks: (tradeId: number, tradeType?: string) => [...playbookKeys.all, 'trade', tradeId, tradeType] as const,
};

// ==================== QUERY HOOKS ====================

/**
 * Hook to fetch a single playbook
 */
export function usePlaybook(playbookId: string): UsePlaybookReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: playbookKeys.detail(playbookId),
    queryFn: async () => {
      const response = await playbookService.getPlaybook(playbookId);
      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch playbook');
      }
      return response.data;
    },
    enabled: !!playbookId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });

  return {
    playbook: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch list of playbooks
 */
export function usePlaybookList(query?: { search?: string; limit?: number; offset?: number; name?: string }): UsePlaybookListReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: playbookKeys.list(query),
    queryFn: async () => {
      const response = await playbookService.listPlaybooks(query);
      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch playbooks');
      }
      return response.data ?? [];
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  return {
    playbooks: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch playbook rules
 */
export function usePlaybookRules(playbookId: string): UsePlaybookRulesReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: playbookKeys.rules(playbookId),
    queryFn: async () => {
      const response = await playbookService.getRules(playbookId);
      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch rules');
      }
      return response.data ?? [];
    },
    enabled: !!playbookId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  return {
    rules: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch missed trades for a playbook
 */
export function useMissedTrades(playbookId: string): UseMissedTradesReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: playbookKeys.missedTrades(playbookId),
    queryFn: async () => {
      const response = await playbookService.getMissedTrades(playbookId);
      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch missed trades');
      }
      return response.data ?? [];
    },
    enabled: !!playbookId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  return {
    missedTrades: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch analytics for a specific playbook
 */
export function usePlaybookAnalytics(playbookId: string, timeRange?: string): UsePlaybookAnalyticsReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: playbookKeys.analytics(playbookId, timeRange),
    queryFn: async () => {
      const response = await playbookService.getPlaybookAnalytics(playbookId, timeRange);
      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch analytics');
      }
      return response.data;
    },
    enabled: !!playbookId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });

  return {
    analytics: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch analytics for all playbooks
 */
export function useAllPlaybooksAnalytics(timeRange?: string): UseAllPlaybooksAnalyticsReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: playbookKeys.allAnalytics(timeRange),
    queryFn: async () => {
      const response = await playbookService.getAllPlaybooksAnalytics(timeRange);
      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch analytics');
      }
      return response.data ?? [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });

  return {
    analytics: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch playbooks for a specific trade
 */
export function useTradePlaybooks(tradeId: number, tradeType?: 'stock' | 'option'): UseTradePlaybooksReturn {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: playbookKeys.tradePlaybooks(tradeId, tradeType),
    queryFn: async () => {
      const response = await playbookService.getTradePlaybooks(tradeId, tradeType);
      if (!response.success) {
        throw new Error(response.message || 'Failed to fetch trade playbooks');
      }
      return response.data ?? [];
    },
    enabled: !!tradeId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  return {
    playbooks: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// ==================== MUTATION HOOKS ====================

/**
 * Hook to create a new playbook
 */
export function useCreatePlaybook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreatePlaybookRequest) => {
      const response = await playbookService.createPlaybook(payload);
      if (!response.success) {
        throw new Error(response.message || 'Failed to create playbook');
      }
      return response.data!;
    },
    onSuccess: () => {
      // Invalidate playbooks list
      queryClient.invalidateQueries({ queryKey: playbookKeys.lists() });
    },
  });
}

/**
 * Hook to update a playbook
 */
export function useUpdatePlaybook(playbookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdatePlaybookRequest) => {
      const response = await playbookService.updatePlaybook(playbookId, payload);
      if (!response.success) {
        throw new Error(response.message || 'Failed to update playbook');
      }
      return response.data!;
    },
    onSuccess: () => {
      // Invalidate specific playbook and list
      queryClient.invalidateQueries({ queryKey: playbookKeys.detail(playbookId) });
      queryClient.invalidateQueries({ queryKey: playbookKeys.lists() });
      // Invalidate analytics
      queryClient.invalidateQueries({ queryKey: playbookKeys.analytics(playbookId) });
    },
  });
}

/**
 * Hook to delete a playbook
 */
export function useDeletePlaybook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playbookId: string) => {
      const response = await playbookService.deletePlaybook(playbookId);
      if (!response.success) {
        throw new Error(response.message || 'Failed to delete playbook');
      }
      return response;
    },
    onSuccess: () => {
      // Invalidate all playbooks queries
      queryClient.invalidateQueries({ queryKey: playbookKeys.all });
      // Invalidate analytics
      queryClient.invalidateQueries({ queryKey: playbookKeys.allAnalytics() });
    },
  });
}

/**
 * Hook to tag a trade with a playbook
 */
export function useTagTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: TagTradeRequest) => {
      const response = await playbookService.tagTrade(payload);
      if (!response.success) {
        throw new Error(response.message || 'Failed to tag trade');
      }
      return response;
    },
    onSuccess: () => {
      // Invalidate playbook details and trades queries
      queryClient.invalidateQueries({ queryKey: playbookKeys.all });
    },
  });
}

/**
 * Hook to untag a trade from a playbook
 */
export function useUntagTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: TagTradeRequest) => {
      const response = await playbookService.untagTrade(payload);
      if (!response.success) {
        throw new Error(response.message || 'Failed to untag trade');
      }
      return response;
    },
    onSuccess: () => {
      // Invalidate playbook details and trades queries
      queryClient.invalidateQueries({ queryKey: playbookKeys.all });
    },
  });
}

/**
 * Hook to create a playbook rule
 */
export function useCreateRule(playbookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateRuleRequest) => {
      const response = await playbookService.createRule(playbookId, payload);
      if (!response.success) {
        throw new Error(response.message || 'Failed to create rule');
      }
      return response.data!;
    },
    onSuccess: () => {
      // Invalidate rules query for this playbook
      queryClient.invalidateQueries({ queryKey: playbookKeys.rules(playbookId) });
      // Invalidate playbook detail
      queryClient.invalidateQueries({ queryKey: playbookKeys.detail(playbookId) });
    },
  });
}

/**
 * Hook to update a playbook rule
 */
export function useUpdateRule(playbookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ruleId, ...payload }: { ruleId: string } & UpdateRuleRequest) => {
      const response = await playbookService.updateRule(playbookId, ruleId, payload);
      if (!response.success) {
        throw new Error(response.message || 'Failed to update rule');
      }
      return response.data!;
    },
    onSuccess: () => {
      // Invalidate rules query for this playbook
      queryClient.invalidateQueries({ queryKey: playbookKeys.rules(playbookId) });
    },
  });
}

/**
 * Hook to delete a playbook rule
 */
export function useDeleteRule(playbookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string) => {
      const response = await playbookService.deleteRule(playbookId, ruleId);
      if (!response.success) {
        throw new Error(response.message || 'Failed to delete rule');
      }
      return response;
    },
    onSuccess: () => {
      // Invalidate rules query for this playbook
      queryClient.invalidateQueries({ queryKey: playbookKeys.rules(playbookId) });
      // Invalidate playbook detail
      queryClient.invalidateQueries({ queryKey: playbookKeys.detail(playbookId) });
    },
  });
}

/**
 * Hook to create a missed trade
 */
export function useCreateMissedTrade(playbookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateMissedTradeRequest) => {
      const response = await playbookService.createMissedTrade(playbookId, payload);
      if (!response.success) {
        throw new Error(response.message || 'Failed to create missed trade');
      }
      return response.data!;
    },
    onSuccess: () => {
      // Invalidate missed trades query for this playbook
      queryClient.invalidateQueries({ queryKey: playbookKeys.missedTrades(playbookId) });
      // Invalidate analytics
      queryClient.invalidateQueries({ queryKey: playbookKeys.analytics(playbookId) });
      queryClient.invalidateQueries({ queryKey: playbookKeys.allAnalytics() });
    },
  });
}

/**
 * Hook to delete a missed trade
 */
export function useDeleteMissedTrade(playbookId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (missedId: string) => {
      const response = await playbookService.deleteMissedTrade(playbookId, missedId);
      if (!response.success) {
        throw new Error(response.message || 'Failed to delete missed trade');
      }
      return response;
    },
    onSuccess: () => {
      // Invalidate missed trades query for this playbook
      queryClient.invalidateQueries({ queryKey: playbookKeys.missedTrades(playbookId) });
      // Invalidate analytics
      queryClient.invalidateQueries({ queryKey: playbookKeys.analytics(playbookId) });
      queryClient.invalidateQueries({ queryKey: playbookKeys.allAnalytics() });
    },
  });
}

// Direct access to service for advanced use cases
export { playbookService };
