import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { stockService } from "@/lib/services/stock-service";
import { useRealtimeStocks } from "./useRealtimeUpdates";
import {
  StockInDB,
  StockCreate,
  StockUpdate,
  StockFilters,
  TradingStats,
} from "@/lib/types/trading";

// Hook for fetching all stocks with optional filters
export function useStocks(filters?: StockFilters) {
  const queryKey = filters ? ["stocks", filters] : ["stocks"];
  const queryClient = useQueryClient();

  // Set up real-time updates
  useRealtimeStocks(queryClient);

  const { data, error, isLoading } = useQuery({
    queryKey,
    queryFn: () => stockService.getStocks(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    stocks: data,
    isLoading,
    error,
  };
}

// Hook for fetching a single stock
export function useStock(stockId: number | null) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["stocks", stockId],
    queryFn: () => stockService.getStock(stockId!),
    enabled: !!stockId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    stock: data,
    isLoading,
    error,
  };
}

// Hook for fetching open positions
export function useOpenStockPositions() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["stocks", "open"],
    queryFn: () => stockService.getOpenPositions(),
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
export function useClosedStockPositions() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["stocks", "closed"],
    queryFn: () => stockService.getClosedPositions(),
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
export function useStocksBySymbol(symbol: string | null) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["stocks", "symbol", symbol],
    queryFn: () => stockService.getPositionsBySymbol(symbol!),
    enabled: !!symbol,
    refetchOnWindowFocus: false,
  });

  return {
    positions: data,
    isLoading,
    error,
  };
}

// Hook for stock trading statistics
export function useStockTradingStats() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["stocks", "stats"],
    queryFn: () => stockService.getTradingStats(),
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    stats: data,
    isLoading,
    error,
  };
}

// Hook for stock mutations (create, update, delete)
export function useStockMutations() {
  const queryClient = useQueryClient();

  const createStock = useMutation({
    mutationFn: (data: StockCreate) => stockService.createStock(data),
    onSuccess: () => {
      // Invalidate all stock-related queries
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "open"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "closed"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "stats"] });
    },
  });

  const updateStock = useMutation({
    mutationFn: ({ id, data }: { id: number; data: StockUpdate }) =>
      stockService.updateStock(id, data),
    onSuccess: (_, { id }) => {
      // Invalidate specific stock and all relevant queries
      queryClient.invalidateQueries({ queryKey: ["stocks", id] });
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "open"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "closed"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "stats"] });
    },
  });

  const deleteStock = useMutation({
    mutationFn: (id: number) => stockService.deleteStock(id),
    onSuccess: () => {
      // Invalidate all stock-related queries
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "open"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "closed"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "stats"] });
    },
  });

  const closePosition = useMutation({
    mutationFn: ({
      id,
      exitPrice,
      exitDate,
    }: {
      id: number;
      exitPrice: number;
      exitDate?: string;
    }) => stockService.closePosition(id, exitPrice, exitDate),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "open"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "closed"] });
      queryClient.invalidateQueries({ queryKey: ["stocks", "stats"] });
    },
  });

  return {
    createStock: createStock.mutateAsync,
    updateStock: (id: number, data: StockUpdate) =>
      updateStock.mutateAsync({ id, data }),
    deleteStock: deleteStock.mutateAsync,
    closePosition: closePosition.mutateAsync,
    isCreating: createStock.isLoading,
    isUpdating: updateStock.isLoading,
    isDeleting: deleteStock.isLoading,
    isClosing: closePosition.isLoading,
  };
}

// Helper functions to manually invalidate caches (if needed outside of mutations)
export function useStockCacheUtils() {
  const queryClient = useQueryClient();

  const invalidateAllStocks = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["stocks"] });
  }, [queryClient]);

  const invalidateStock = useCallback(
    (stockId: number) => {
      return queryClient.invalidateQueries({ queryKey: ["stocks", stockId] });
    },
    [queryClient]
  );

  const invalidateOpenPositions = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["stocks", "open"] });
  }, [queryClient]);

  const invalidateClosedPositions = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["stocks", "closed"] });
  }, [queryClient]);

  const invalidateStats = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["stocks", "stats"] });
  }, [queryClient]);

  const invalidateAllStockCaches = useCallback(async () => {
    await Promise.all([
      invalidateAllStocks(),
      invalidateOpenPositions(),
      invalidateClosedPositions(),
      invalidateStats(),
    ]);
  }, [
    invalidateAllStocks,
    invalidateOpenPositions,
    invalidateClosedPositions,
    invalidateStats,
  ]);

  return {
    invalidateAllStocks,
    invalidateStock,
    invalidateOpenPositions,
    invalidateClosedPositions,
    invalidateStats,
    invalidateAllStockCaches,
  };
}
