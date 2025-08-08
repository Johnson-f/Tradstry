import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo } from "react";
import { optionService } from "@/lib/services/options-service";
import { useRealtimeOptions } from "./useRealtimeUpdates";
import {
  OptionInDB,
  OptionCreate,
  OptionUpdate,
  OptionFilters,
  TradingStats,
  OptionType,
  TradeDirection,
} from "@/lib/types/trading";

// Hook for fetching all options with optional filters
export function useOptions(filters?: OptionFilters) {
  const queryKey = filters ? ["options", filters] : ["options"];
  const queryClient = useQueryClient();
  
  // Set up real-time updates for options
  useRealtimeOptions(queryClient);
  
  const { data, error, isLoading } = useQuery({
    queryKey,
    queryFn: () => optionService.getOptions(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    options: data,
    isLoading,
    error,
  };
}

// Hook for fetching a single option
export function useOption(optionId: number | null) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["options", optionId],
    queryFn: () => optionService.getOption(optionId!),
    enabled: !!optionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    option: data,
    isLoading,
    error,
  };
}

// Hook for fetching open positions
export function useOpenOptionPositions() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["options", "open"],
    queryFn: () => optionService.getOpenPositions(),
    refetchInterval: 30000, // Refresh every 30 seconds
    refetchOnWindowFocus: true,
    staleTime: 0, // Always consider data stale to ensure fresh data
  });

  return {
    openPositions: data,
    isLoading,
    error,
  };
}

// Hook for fetching closed positions
export function useClosedOptionPositions() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["options", "closed"],
    queryFn: () => optionService.getClosedPositions(),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    closedPositions: data,
    isLoading,
    error,
  };
}

// Hook for fetching positions by symbol
export function useOptionsBySymbol(symbol: string | null) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["options", "symbol", symbol],
    queryFn: () => optionService.getPositionsBySymbol(symbol!),
    enabled: !!symbol,
    refetchOnWindowFocus: false,
  });

  return {
    options: data,
    isLoading,
    error,
  };
}

// Hook for fetching positions by strategy
export function useOptionsByStrategy(strategy: string | null) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["options", "strategy", strategy],
    queryFn: () => optionService.getPositionsByStrategy(strategy!),
    enabled: !!strategy,
    refetchOnWindowFocus: false,
  });

  return {
    options: data,
    isLoading,
    error,
  };
}

// Hook for fetching positions by option type
export function useOptionsByType(optionType: OptionType | null) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["options", "type", optionType],
    queryFn: () => optionService.getPositionsByType(optionType!),
    enabled: !!optionType,
    refetchOnWindowFocus: false,
  });

  return {
    options: data,
    isLoading,
    error,
  };
}

// Hook for fetching positions by expiration date
export function useOptionsByExpiration(expirationDate: string | null) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["options", "expiration", expirationDate],
    queryFn: () => optionService.getPositionsByExpiration(expirationDate!),
    enabled: !!expirationDate,
    refetchOnWindowFocus: false,
  });

  return {
    options: data,
    isLoading,
    error,
  };
}

// Hook for fetching options expiring within X days
export function useOptionsExpiringWithin(days: number | null) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["options", "expiring", days],
    queryFn: () => optionService.getOptionsExpiringWithin(days!),
    enabled: days !== null,
    refetchOnWindowFocus: false,
  });

  return {
    options: data,
    isLoading,
    error,
  };
}

// Hook for option trading statistics
export function useOptionTradingStats() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["options", "stats"],
    queryFn: () => optionService.getTradingStats(),
    refetchOnWindowFocus: false,
  });

  return {
    stats: data,
    isLoading,
    error,
  };
}

// Hook for statistics by strategy
export function useOptionStatsByStrategy() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["options", "stats", "strategy"],
    queryFn: () => optionService.getStatsByStrategy(),
    refetchOnWindowFocus: false,
  });

  return {
    statsByStrategy: data,
    isLoading,
    error,
  };
}

// Hook for option mutations (create, update, delete)
export function useOptionMutations() {
  const queryClient = useQueryClient();

  const createOption = useMutation({
    mutationFn: (data: OptionCreate) => optionService.createOption(data),
    onSuccess: () => {
      // Invalidate all option-related queries
      queryClient.invalidateQueries({ queryKey: ["options"] });
      queryClient.invalidateQueries({ queryKey: ["options", "open"] });
      queryClient.invalidateQueries({ queryKey: ["options", "closed"] });
      queryClient.invalidateQueries({ queryKey: ["options", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["options", "stats", "strategy"] });
    },
  });

  const updateOption = useMutation({
    mutationFn: ({ id, data }: { id: number; data: OptionUpdate }) =>
      optionService.updateOption(id, data),
    onSuccess: (_, { id }) => {
      // Invalidate specific option and all relevant queries
      queryClient.invalidateQueries({ queryKey: ["options", id] });
      queryClient.invalidateQueries({ queryKey: ["options"] });
      queryClient.invalidateQueries({ queryKey: ["options", "open"] });
      queryClient.invalidateQueries({ queryKey: ["options", "closed"] });
      queryClient.invalidateQueries({ queryKey: ["options", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["options", "stats", "strategy"] });
    },
  });

  const deleteOption = useMutation({
    mutationFn: (id: number) => optionService.deleteOption(id),
    onSuccess: () => {
      // Invalidate all option-related queries
      queryClient.invalidateQueries({ queryKey: ["options"] });
      queryClient.invalidateQueries({ queryKey: ["options", "open"] });
      queryClient.invalidateQueries({ queryKey: ["options", "closed"] });
      queryClient.invalidateQueries({ queryKey: ["options", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["options", "stats", "strategy"] });
    },
  });

  const closePosition = useMutation({
    mutationFn: (id: number) => optionService.closePosition(id),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["options"] });
      queryClient.invalidateQueries({ queryKey: ["options", "open"] });
      queryClient.invalidateQueries({ queryKey: ["options", "closed"] });
      queryClient.invalidateQueries({ queryKey: ["options", "stats"] });
      queryClient.invalidateQueries({ queryKey: ["options", "stats", "strategy"] });
    },
  });

  return {
    createOption: createOption.mutateAsync,
    updateOption: updateOption.mutateAsync,
    deleteOption: deleteOption.mutateAsync,
    closePosition: closePosition.mutateAsync,
    isCreating: createOption.isPending,
    isUpdating: updateOption.isPending,
    isDeleting: deleteOption.isPending,
    isClosing: closePosition.isPending,
  };
}

// Helper functions to manually invalidate caches (if needed outside of mutations)
function useOptionCacheUtils() {
  const queryClient = useQueryClient();

  const invalidateAllOptions = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["options"] });
  }, [queryClient]);

  const invalidateOption = useCallback((optionId: number) => {
    return queryClient.invalidateQueries({ queryKey: ["options", optionId] });
  }, [queryClient]);

  const invalidateOpenPositions = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["options", "open"] });
  }, [queryClient]);

  const invalidateClosedPositions = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["options", "closed"] });
  }, [queryClient]);

  const invalidateStats = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["options", "stats"] });
  }, [queryClient]);

  const invalidateStatsByStrategy = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["options", "stats", "strategy"] });
  }, [queryClient]);

  const invalidateAllOptionCaches = useCallback(async () => {
    await Promise.all([
      invalidateAllOptions(),
      invalidateOpenPositions(),
      invalidateClosedPositions(),
      invalidateStats(),
      invalidateStatsByStrategy(),
    ]);
  }, [
    invalidateAllOptions,
    invalidateOpenPositions,
    invalidateClosedPositions,
    invalidateStats,
    invalidateStatsByStrategy,
  ]);

  return {
    invalidateAllOptions,
    invalidateOption,
    invalidateOpenPositions,
    invalidateClosedPositions,
    invalidateStats,
    invalidateStatsByStrategy,
    invalidateAllOptionCaches,
  };
}

// Hook for calculating option metrics
export function useOptionMetrics(option: OptionInDB | null) {
  return useMemo(() => {
    if (!option) {
      return {
        profitLoss: 0,
        profitLossPercent: 0,
        riskRewardRatio: null,
      };
    }

    // Calculate metrics
    const entryCost = option.entry_price * option.quantity * 100;
    const exitCost = option.exit_price ? option.exit_price * option.quantity * 100 : 0;
    const commissions = option.commissions || 0;
    const profitLoss = exitCost - entryCost - commissions;
    const profitLossPercent = entryCost > 0 ? (profitLoss / entryCost) * 100 : 0;

    // Calculate risk/reward ratio if stop loss and take profit are set
    let riskRewardRatio = null;
    if (option.stop_loss && option.take_profit) {
      const risk = Math.abs(option.entry_price - option.stop_loss);
      const reward = Math.abs(option.take_profit - option.entry_price);
      riskRewardRatio = risk > 0 ? reward / risk : null;
    }

    return {
      profitLoss,
      profitLossPercent,
      riskRewardRatio,
    };
  }, [option]);
}
