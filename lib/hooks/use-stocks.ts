import useSWR from 'swr';
import { useState, useCallback } from 'react';
import { stockService } from '@/lib/services/stock-service';
import {
  StockInDB,
  StockCreate,
  StockUpdate,
  StockFilters,
  TradingStats,
} from '@/lib/types/trading';

// Hook for fetching all stocks with optional filters
export function useStocks(filters?: StockFilters) {
  const key = filters ? ['stocks', filters] : 'stocks';

  const { data, error, isLoading, mutate } = useSWR(
    key,
    () => stockService.getStocks(filters),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 60000, // 1 minute
    }
  );

  return {
    stocks: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for fetching a single stock
export function useStock(stockId: number | null) {
  const { data, error, isLoading, mutate } = useSWR(
    stockId ? `stocks/${stockId}` : null,
    () => stockService.getStock(stockId!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  );

  return {
    stock: data,
    isLoading,
    error,
    mutate,
  };
}

// Hook for fetching open positions
export function useOpenStockPositions() {
  const { data, error, isLoading, mutate } = useSWR(
    'stocks/open',
    () => stockService.getOpenPositions(),
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
export function useClosedStockPositions() {
  const { data, error, isLoading, mutate } = useSWR(
    'stocks/closed',
    () => stockService.getClosedPositions(),
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
export function useStocksBySymbol(symbol: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    symbol ? `stocks/symbol/${symbol}` : null,
    () => stockService.getPositionsBySymbol(symbol!),
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

// Hook for stock trading statistics
export function useStockTradingStats() {
  const { data, error, isLoading, mutate } = useSWR(
    'stocks/stats',
    () => stockService.getTradingStats(),
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

// Hook for stock mutations (create, update, delete)
export function useStockMutations() {
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const createStock = useCallback(async (stockData: StockCreate) => {
    setIsCreating(true);
    try {
      const newStock = await stockService.createStock(stockData);
      // Revalidate relevant SWR caches
      await Promise.all([
        mutateStocks(),
        mutateOpenPositions(),
      ]);
      return newStock;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const updateStock = useCallback(async (stockId: number, updateData: StockUpdate) => {
    setIsUpdating(true);
    try {
      const updatedStock = await stockService.updateStock(stockId, updateData);
      // Revalidate relevant SWR caches
      await Promise.all([
        mutateStocks(),
        mutateStock(stockId),
        mutateOpenPositions(),
        mutateClosedPositions(),
      ]);
      return updatedStock;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const deleteStock = useCallback(async (stockId: number) => {
    setIsDeleting(true);
    try {
      await stockService.deleteStock(stockId);
      // Revalidate relevant SWR caches
      await Promise.all([
        mutateStocks(),
        mutateOpenPositions(),
        mutateClosedPositions(),
      ]);
    } finally {
      setIsDeleting(false);
    }
  }, []);

  const closePosition = useCallback(async (
    stockId: number,
    exitPrice: number,
    exitDate?: string
  ) => {
    setIsUpdating(true);
    try {
      const closedStock = await stockService.closePosition(stockId, exitPrice, exitDate);
      // Revalidate relevant SWR caches
      await Promise.all([
        mutateStocks(),
        mutateStock(stockId),
        mutateOpenPositions(),
        mutateClosedPositions(),
        mutateStats(),
      ]);
      return closedStock;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  return {
    createStock,
    updateStock,
    deleteStock,
    closePosition,
    isCreating,
    isUpdating,
    isDeleting,
  };
}

// Helper functions to mutate SWR caches
function mutateStocks() {
  return mutate(
    (key) => Array.isArray(key) && key[0] === 'stocks',
    undefined,
    { revalidate: true }
  );
}

function mutateStock(stockId: number) {
  return mutate(`stocks/${stockId}`, undefined, { revalidate: true });
}

function mutateOpenPositions() {
  return mutate('stocks/open', undefined, { revalidate: true });
}

function mutateClosedPositions() {
  return mutate('stocks/closed', undefined, { revalidate: true });
}

function mutateStats() {
  return mutate('stocks/stats', undefined, { revalidate: true });
}

// Helper function to mutate all stock-related caches
export function mutateAllStockCaches() {
  return Promise.all([
    mutateStocks(),
    mutateOpenPositions(),
    mutateClosedPositions(),
    mutateStats(),
  ]);
}
