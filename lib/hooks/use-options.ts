import useSWR from "swr";
import { useState, useCallback, useMemo } from "react";
import { optionService } from "@/lib/services/options-service";
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
  const key = filters ? ["options", filters] : "options";

  const { data, error, isLoading, mutate } = useSWR(
    key,
    () => optionService.getOptions(filters),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60000, // 1 minute
    }
  );

  return {
    options: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for fetching a single option
export function useOption(optionId: number | null) {
  const { data, error, isLoading, mutate } = useSWR(
    optionId ? `options/${optionId}` : null,
    () => optionService.getOption(optionId!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  );

  return {
    option: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for fetching open positions
export function useOpenOptionPositions() {
  const { data, error, isLoading, mutate } = useSWR(
    "options/open",
    () => optionService.getOpenPositions(),
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: true,
    }
  );

  return {
    openPositions: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for fetching closed positions
export function useClosedOptionPositions() {
  const { data, error, isLoading, mutate } = useSWR(
    "options/closed",
    () => optionService.getClosedPositions(),
    {
      revalidateOnFocus: false,
    }
  );

  return {
    closedPositions: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for fetching positions by symbol
export function useOptionsBySymbol(symbol: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    symbol ? `options/symbol/${symbol}` : null,
    () => optionService.getPositionsBySymbol(symbol!),
    {
      revalidateOnFocus: false,
    }
  );

  return {
    positions: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for fetching positions by strategy
export function useOptionsByStrategy(strategy: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    strategy ? `options/strategy/${strategy}` : null,
    () => optionService.getPositionsByStrategy(strategy!),
    {
      revalidateOnFocus: false,
    }
  );

  return {
    positions: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for fetching positions by option type
export function useOptionsByType(optionType: OptionType | null) {
  const { data, error, isLoading, mutate } = useSWR(
    optionType ? `options/type/${optionType}` : null,
    () => optionService.getPositionsByOptionType(optionType!),
    {
      revalidateOnFocus: false,
    }
  );

  return {
    positions: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for fetching positions by expiration date
export function useOptionsByExpiration(expirationDate: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    expirationDate ? `options/expiration/${expirationDate}` : null,
    () => optionService.getPositionsByExpiration(expirationDate!),
    {
      revalidateOnFocus: false,
    }
  );

  return {
    positions: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for fetching options expiring within X days
export function useOptionsExpiringWithin(days: number | null) {
  const { data, error, isLoading, mutate } = useSWR(
    days !== null ? `options/expiring/${days}` : null,
    () => optionService.getOptionsExpiringWithin(days!),
    {
      refreshInterval: 3600000, // Refresh every hour
      revalidateOnFocus: true,
    }
  );

  return {
    expiringOptions: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for option trading statistics
export function useOptionTradingStats() {
  const { data, error, isLoading, mutate } = useSWR(
    "options/stats",
    () => optionService.getTradingStats(),
    {
      revalidateOnFocus: false,
      refreshInterval: 300000, // Refresh every 5 minutes
    }
  );

  return {
    stats: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for statistics by strategy
export function useOptionStatsByStrategy() {
  const { data, error, isLoading, mutate } = useSWR(
    "options/stats/strategy",
    () => optionService.getStatsByStrategy(),
    {
      revalidateOnFocus: false,
      refreshInterval: 300000, // Refresh every 5 minutes
    }
  );

  return {
    statsByStrategy: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for option mutations (create, update, delete)
export function useOptionMutations() {
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const createOption = useCallback(async (optionData: OptionCreate) => {
    setIsCreating(true);
    try {
      const newOption = await optionService.createOption(optionData);
      // Revalidate relevant SWR caches
      await Promise.all([mutateOptions(), mutateOpenPositions()]);
      return newOption;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const updateOption = useCallback(
    async (optionId: number, updateData: OptionUpdate) => {
      setIsUpdating(true);
      try {
        const updatedOption = await optionService.updateOption(
          optionId,
          updateData
        );
        // Revalidate relevant SWR caches
        await Promise.all([
          mutateOptions(),
          mutateOption(optionId),
          mutateOpenPositions(),
          mutateClosedPositions(),
        ]);
        return updatedOption;
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  const deleteOption = useCallback(async (optionId: number) => {
    setIsDeleting(true);
    try {
      await optionService.deleteOption(optionId);
      // Revalidate relevant SWR caches
      await Promise.all([
        mutateOptions(),
        mutateOpenPositions(),
        mutateClosedPositions(),
      ]);
    } finally {
      setIsDeleting(false);
    }
  }, []);

  const closePosition = useCallback(
    async (optionId: number, exitPrice: number, exitDate?: string) => {
      setIsUpdating(true);
      try {
        const closedOption = await optionService.closePosition(
          optionId,
          exitPrice,
          exitDate
        );
        // Revalidate relevant SWR caches
        await Promise.all([
          mutateOptions(),
          mutateOption(optionId),
          mutateOpenPositions(),
          mutateClosedPositions(),
          mutateStats(),
          mutateStatsByStrategy(),
        ]);
        return closedOption;
      } finally {
        setIsUpdating(false);
      }
    },
    []
  );

  return {
    createOption,
    updateOption,
    deleteOption,
    closePosition,
    isCreating,
    isUpdating,
    isDeleting,
  };
}

// Helper functions to mutate SWR caches
function mutateOptions() {
  return mutate(
    (key) => Array.isArray(key) && key[0] === "options",
    undefined,
    { revalidate: true }
  );
}

function mutateOption(optionId: number) {
  return mutate(`options/${optionId}`, undefined, { revalidate: true });
}

function mutateOpenPositions() {
  return mutate("options/open", undefined, { revalidate: true });
}

function mutateClosedPositions() {
  return mutate("options/closed", undefined, { revalidate: true });
}

function mutateStats() {
  return mutate("options/stats", undefined, { revalidate: true });
}

function mutateStatsByStrategy() {
  return mutate("options/stats/strategy", undefined, { revalidate: true });
}

// Helper function to mutate all option-related caches
export function mutateAllOptionCaches() {
  return Promise.all([
    mutateOptions(),
    mutateOpenPositions(),
    mutateClosedPositions(),
    mutateStats(),
    mutateStatsByStrategy(),
  ]);
}

// Hook for calculating option metrics
export function useOptionMetrics(option: OptionInDB | null) {
  const metrics = useMemo(() => {
    if (!option) return null;

    return {
      profitLoss: optionService.calculateProfitLoss(option),
      profitLossPercentage: optionService.calculateProfitLossPercentage(option),
      maxProfit: optionService.calculateMaxProfit(option),
      maxLoss: optionService.calculateMaxLoss(option),
      daysToExpiration: optionService.calculateDaysToExpiration(option),
      isInTheMoney: optionService.isInTheMoney(option),
      intrinsicValue: optionService.calculateIntrinsicValue(option),
      timeValue: optionService.calculateTimeValue(option),
    };
  }, [option]);

  return metrics;
}
