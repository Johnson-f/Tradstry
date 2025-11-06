'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { marketDataService } from '@/lib/services/market-data-service';
import { useWs, useWebSocketControl } from '@/lib/websocket/provider';
import type {
  Quote,
  SimpleQuote,
  MoverItem,
  MoversResponse,
  GetQuotesRequest,
  GetHistoricalRequest,
  GetNewsRequest,
  GetIndicatorRequest,
  GetFinancialsRequest,
  GetEarningsTranscriptRequest,
  GetHoldersRequest,
  SubscribeRequest,
  UnsubscribeRequest,
  QuoteUpdate,
  LogoUrl,
} from '@/lib/types/market-data';

// =====================================================
// MARKET HEALTH & HOURS HOOKS
// =====================================================

/**
 * Hook to fetch market health status
 */
export function useMarketHealth(enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'health'],
    queryFn: () => marketDataService.getHealth(),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled,
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  return {
    health: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch market hours information
 */
export function useMarketHours(enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'hours'],
    queryFn: () => marketDataService.getHours(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  return {
    hours: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// QUOTES HOOKS
// =====================================================

/**
 * Hook to fetch quotes for symbols
 * Automatically subscribes to WebSocket updates for real-time price changes
 */
export function useQuotes(params?: GetQuotesRequest, enabled: boolean = true) {
  const symbols = params?.symbols ?? [];

  // Subscribe to WebSocket updates for these symbols
  useMarketSubscription(symbols, enabled && symbols.length > 0);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'quotes', params?.symbols],
    queryFn: () => marketDataService.getQuotes(params),
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 1 * 60 * 1000, // 1 minute
    enabled: enabled && symbols.length > 0,
    // No refetchInterval - WebSocket handles real-time updates
  });

  return {
    quotes: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch simple quotes for symbols (summary data)
 * Automatically subscribes to WebSocket updates for real-time price changes
 */
export function useSimpleQuotes(params?: GetQuotesRequest, enabled: boolean = true) {
  const symbols = params?.symbols ?? [];

  // Subscribe to WebSocket updates for these symbols
  useMarketSubscription(symbols, enabled && symbols.length > 0);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'simple-quotes', params?.symbols],
    queryFn: () => marketDataService.getSimpleQuotes(params),
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 1 * 60 * 1000, // 1 minute
    enabled: enabled && symbols.length > 0,
    // No refetchInterval - WebSocket handles real-time updates
  });

  return {
    quotes: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch similar quotes to a symbol
 * Automatically subscribes to WebSocket updates for real-time price changes
 */
export function useSimilar(symbol: string | null, enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'similar', symbol],
    queryFn: () => marketDataService.getSimilar(symbol!),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: enabled && !!symbol,
    // No refetchInterval - WebSocket handles real-time updates
  });

  const similarSymbols = data?.map((q) => q.symbol) ?? [];
  // Subscribe to WebSocket updates for similar symbols
  useMarketSubscription(similarSymbols, enabled && !!symbol && similarSymbols.length > 0);

  return {
    similar: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch a single quote
 * Automatically subscribes to WebSocket updates for real-time price changes
 */
export function useQuote(symbol: string | null, enabled: boolean = true) {
  // Subscribe to WebSocket updates for this symbol
  useMarketSubscription(symbol ? [symbol] : [], enabled && !!symbol);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'quote', symbol],
    queryFn: () => marketDataService.getQuotes({ symbols: symbol ? [symbol] : [] }),
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 1 * 60 * 1000, // 1 minute
    enabled: enabled && !!symbol,
    // No refetchInterval - WebSocket handles real-time updates
  });

  return {
    quote: data?.[0] ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch only logo URL for a symbol
 */
export function useLogo(symbol: string | null, enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'logo', symbol],
    queryFn: () => marketDataService.getLogo(symbol!),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: enabled && !!symbol,
  });

  return {
    logo: (data ?? null) as LogoUrl,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// HISTORICAL DATA HOOKS
// =====================================================

/**
 * Hook to fetch historical data for a symbol
 */
export function useHistorical(
  params: GetHistoricalRequest,
  enabled: boolean = true
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'historical', params.symbol, params.range, params.interval],
    queryFn: () => marketDataService.getHistorical(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    // Poll the backend every 1 minute for active views
    refetchInterval: enabled && !!params.symbol ? 60 * 1000 : false,
    refetchIntervalInBackground: true,
    enabled: enabled && !!params.symbol,
  });

  return {
    historical: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// MARKET MOVERS HOOKS
// =====================================================

/**
 * Hook to fetch market movers (gainers, losers, most active)
 * Automatically subscribes to WebSocket updates for real-time price changes
 */
export function useMovers(enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'movers'],
    queryFn: () => marketDataService.getMovers(),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled,
    // No refetchInterval - WebSocket handles real-time updates
  });

  // Extract all symbols from movers data
  const moverSymbols = data
    ? [...new Set([
        ...data.gainers.map((m) => m.symbol),
        ...data.losers.map((m) => m.symbol),
        ...data.mostActive.map((m) => m.symbol),
      ])]
    : [];

  // Subscribe to WebSocket updates for all mover symbols
  useMarketSubscription(moverSymbols, enabled && moverSymbols.length > 0);

  return {
    movers: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch top gainers
 * Automatically subscribes to WebSocket updates for real-time price changes
 */
export function useGainers(count?: number, enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'gainers', count],
    queryFn: () => marketDataService.getGainers(count),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled,
    // No refetchInterval - WebSocket handles real-time updates
  });

  const gainerSymbols = data?.map((m) => m.symbol) ?? [];
  // Subscribe to WebSocket updates for gainer symbols
  useMarketSubscription(gainerSymbols, enabled && gainerSymbols.length > 0);

  return {
    gainers: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch top losers
 * Automatically subscribes to WebSocket updates for real-time price changes
 */
export function useLosers(count?: number, enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'losers', count],
    queryFn: () => marketDataService.getLosers(count),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled,
    // No refetchInterval - WebSocket handles real-time updates
  });

  const loserSymbols = data?.map((m) => m.symbol) ?? [];
  // Subscribe to WebSocket updates for loser symbols
  useMarketSubscription(loserSymbols, enabled && loserSymbols.length > 0);

  return {
    losers: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

/**
 * Hook to fetch most active stocks
 * Automatically subscribes to WebSocket updates for real-time price changes
 */
export function useActives(count?: number, enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'actives', count],
    queryFn: () => marketDataService.getActives(count),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled,
    // No refetchInterval - WebSocket handles real-time updates
  });

  const activeSymbols = data?.map((m) => m.symbol) ?? [];
  // Subscribe to WebSocket updates for active symbols
  useMarketSubscription(activeSymbols, enabled && activeSymbols.length > 0);

  return {
    actives: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// NEWS HOOKS
// =====================================================

/**
 * Hook to fetch market news
 */
export function useNews(params?: GetNewsRequest, enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'news', params?.symbol, params?.limit],
    queryFn: () => marketDataService.getNews(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled,
  });

  return {
    news: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// INDICES HOOKS
// =====================================================

/**
 * Hook to fetch market indices
 */
export function useIndices(enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'indices'],
    queryFn: () => marketDataService.getIndices(),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 2 * 60 * 1000, // 2 minutes
    enabled,
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  return {
    indices: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// SECTORS HOOKS
// =====================================================

/**
 * Hook to fetch sector performance
 */
export function useSectors(enabled: boolean = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'sectors'],
    queryFn: () => marketDataService.getSectors(),
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });

  return {
    sectors: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// SEARCH HOOKS
// =====================================================

/**
 * Hook to search for symbols
 */
export function useSymbolSearch(
  query: string,
  params?: { hits?: number; yahoo?: boolean },
  enabled: boolean = true
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'search', query, params?.hits, params?.yahoo],
    queryFn: () => marketDataService.search(query, params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    enabled: enabled && query.length >= 2, // Only search if query is at least 2 characters
  });

  return {
    results: data ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// INDICATORS HOOKS
// =====================================================

/**
 * Hook to fetch indicator data for a symbol
 */
export function useIndicator(
  params: GetIndicatorRequest,
  enabled: boolean = true
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'indicator', params.symbol, params.indicator, params.interval],
    queryFn: () => marketDataService.getIndicator(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    enabled: enabled && !!params.symbol && !!params.indicator,
  });

  return {
    indicator: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// WEBSOCKET SUBSCRIPTION HOOKS
// =====================================================

/**
 * Hook to subscribe to market quote updates via WebSocket
 * This hook manages WebSocket subscriptions and provides real-time quote updates
 * Uses the shared WebSocket connection from WebSocketProvider
 */
export function useMarketSubscription(
  symbols: string[],
  enabled: boolean = true,
  onQuoteUpdate?: (update: QuoteUpdate) => void
) {
  // Use shared WebSocket connection instead of creating a new one
  const { state, send, subscribe: wsSubscribe } = useWs();
  const { enable: enableWebSocket } = useWebSocketControl();
  const queryClient = useQueryClient();
  const subscribedSymbolsRef = useRef<Set<string>>(new Set());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Normalize symbols to uppercase for consistent comparison
  const normalizedSymbols = useMemo(() =>
    symbols.map(s => s.toUpperCase().trim()).filter(Boolean),
    [symbols]
  );

  // Enable WebSocket when subscriptions are needed
  useEffect(() => {
    if (enabled && normalizedSymbols.length > 0) {
      enableWebSocket();
    }
  }, [enabled, normalizedSymbols.length, enableWebSocket]);

  // Helper function to update all price-related cache keys
  const updateAllPriceCaches = useCallback((update: QuoteUpdate) => {
    // Normalize update symbol to uppercase for consistent matching
    const updateSymbol = update.symbol.toUpperCase().trim();

    const updateData = {
      symbol: updateSymbol,
      name: update.name,
      price: update.price,
      afterHoursPrice: update.afterHoursPrice ?? null,
      change: String(update.change),
      percentChange: String(update.percentChange),
      logo: update.logo ?? null,
    };

    // Update detailed quotes cache
    queryClient.setQueryData<Quote[]>(
      ['market', 'quotes', [updateSymbol]],
      (oldData) => {
        if (!oldData) return [{ ...updateData, symbol: updateSymbol } as Quote];
        return oldData.map((quote) =>
          quote.symbol.toUpperCase().trim() === updateSymbol
            ? { ...quote, ...updateData }
            : quote
        );
      }
    );

    // Update simple quotes cache - check all possible symbol arrays
    queryClient.getQueryCache().getAll().forEach((query) => {
      const key = query.queryKey;
      if (key[0] === 'market' && key[1] === 'simple-quotes' && Array.isArray(key[2])) {
        const symbols = key[2] as string[];
        // Normalize symbols for case-insensitive comparison
        const normalizedCacheSymbols = symbols.map(s => s.toUpperCase().trim());
        if (normalizedCacheSymbols.includes(updateSymbol)) {
          queryClient.setQueryData<SimpleQuote[]>(key, (oldData) => {
            if (!oldData) return [updateData as SimpleQuote];
            return oldData.map((quote) =>
              quote.symbol.toUpperCase().trim() === updateSymbol
                ? { ...quote, ...updateData }
                : quote
            );
          });
        }
      }
    });

    // Update similar quotes cache
    queryClient.setQueryData<SimpleQuote[]>(
      ['market', 'similar', updateSymbol],
      (oldData) => {
        if (!oldData) return [];
        return oldData.map((quote) =>
          quote.symbol.toUpperCase().trim() === updateSymbol
            ? { ...quote, ...updateData }
            : quote
        );
      }
    );

    // Update single quote cache
    queryClient.setQueryData<Quote[]>(
      ['market', 'quote', updateSymbol],
      (oldData) => {
        if (!oldData) return [{ ...updateData, symbol: updateSymbol } as Quote];
        return oldData.map((quote) =>
          quote.symbol.toUpperCase().trim() === updateSymbol
            ? { ...quote, ...updateData }
            : quote
        );
      }
    );

    // Update gainers cache
    queryClient.getQueryCache().getAll().forEach((query) => {
      const key = query.queryKey;
      if (key[0] === 'market' && key[1] === 'gainers') {
        queryClient.setQueryData<MoverItem[]>(key, (oldData) => {
          if (!oldData) return [];
          return oldData.map((item) =>
            item.symbol.toUpperCase().trim() === updateSymbol
              ? {
                  ...item,
                  name: update.name,
                  price: update.price,
                  change: String(update.change),
                  percentChange: String(update.percentChange),
                }
              : item
          );
        });
      }
    });

    // Update losers cache
    queryClient.getQueryCache().getAll().forEach((query) => {
      const key = query.queryKey;
      if (key[0] === 'market' && key[1] === 'losers') {
        queryClient.setQueryData<MoverItem[]>(key, (oldData) => {
          if (!oldData) return [];
          return oldData.map((item) =>
            item.symbol.toUpperCase().trim() === updateSymbol
              ? {
                  ...item,
                  name: update.name,
                  price: update.price,
                  change: String(update.change),
                  percentChange: String(update.percentChange),
                }
              : item
          );
        });
      }
    });

    // Update actives cache
    queryClient.getQueryCache().getAll().forEach((query) => {
      const key = query.queryKey;
      if (key[0] === 'market' && key[1] === 'actives') {
        queryClient.setQueryData<MoverItem[]>(key, (oldData) => {
          if (!oldData) return [];
          return oldData.map((item) =>
            item.symbol.toUpperCase().trim() === updateSymbol
              ? {
                  ...item,
                  name: update.name,
                  price: update.price,
                  change: String(update.change),
                  percentChange: String(update.percentChange),
                }
              : item
          );
        });
      }
    });

    // Update movers cache (composite)
    queryClient.setQueryData<MoversResponse>(
      ['market', 'movers'],
      (oldData) => {
        if (!oldData) return { gainers: [], losers: [], mostActive: [] };
        const updateItem = (items: MoverItem[]) =>
          items.map((item) =>
            item.symbol.toUpperCase().trim() === updateSymbol
              ? {
                  ...item,
                  name: update.name,
                  price: update.price,
                  change: String(update.change),
                  percentChange: String(update.percentChange),
                }
              : item
          );
        return {
          gainers: updateItem(oldData.gainers),
          losers: updateItem(oldData.losers),
          mostActive: updateItem(oldData.mostActive),
        };
      }
    );
  }, [queryClient]);

  // Subscribe to websocket events
  useEffect(() => {
    if (!enabled || normalizedSymbols.length === 0 || state !== 'connected') {
      return;
    }

    console.log('📡 Setting up WebSocket handlers for symbols:', normalizedSymbols);

    // Subscribe to market:quote and market:update events
    const unsubscribeQuote = wsSubscribe('market:quote', (data: unknown) => {
      const update = data as QuoteUpdate;
      console.log('📈 Received market:quote update:', update);
      updateAllPriceCaches(update);
      onQuoteUpdate?.(update);
    });

    const unsubscribeUpdate = wsSubscribe('market:update', (data: unknown) => {
      const update = data as QuoteUpdate;
      console.log('📊 Received market:update update:', update);
      updateAllPriceCaches(update);
      onQuoteUpdate?.(update);
    });

    unsubscribeRef.current = () => {
      unsubscribeQuote();
      unsubscribeUpdate();
    };

    return () => {
      unsubscribeQuote();
      unsubscribeUpdate();
    };
  }, [enabled, normalizedSymbols, state, wsSubscribe, updateAllPriceCaches, onQuoteUpdate]);

  // Subscribe/unsubscribe via WebSocket when symbols change
  useEffect(() => {
    if (state !== 'connected' || !enabled || normalizedSymbols.length === 0) {
      // If no symbols, unsubscribe from all
      if (normalizedSymbols.length === 0 && subscribedSymbolsRef.current.size > 0) {
        const toUnsubscribe = Array.from(subscribedSymbolsRef.current);
        send({
          type: 'unsubscribe',
          symbols: toUnsubscribe,
        });
        subscribedSymbolsRef.current.clear();
      }
      return;
    }

    const currentSymbols = new Set(normalizedSymbols);
    const toSubscribe: string[] = [];
    const toUnsubscribe: string[] = [];

    // Find symbols to subscribe to
    currentSymbols.forEach((symbol) => {
      if (!subscribedSymbolsRef.current.has(symbol)) {
        toSubscribe.push(symbol);
      }
    });

    // Find symbols to unsubscribe from
    subscribedSymbolsRef.current.forEach((symbol) => {
      if (!currentSymbols.has(symbol)) {
        toUnsubscribe.push(symbol);
      }
    });

    // Send unsubscribe message FIRST (important for clean state)
    if (toUnsubscribe.length > 0) {
      console.log('🔕 Unsubscribing from symbols:', toUnsubscribe);
      const unsubMsg = {
        type: 'unsubscribe',
        symbols: toUnsubscribe,
      };
      console.log('📤 Sending unsubscribe message:', JSON.stringify(unsubMsg));
      send(unsubMsg);
      toUnsubscribe.forEach((symbol) => subscribedSymbolsRef.current.delete(symbol));
    }

    // Send subscribe message AFTER unsubscribe
    if (toSubscribe.length > 0) {
      console.log('🔔 Subscribing to symbols:', toSubscribe);
      const subMsg = {
        type: 'subscribe',
        symbols: toSubscribe,
      };
      console.log('📤 Sending subscribe message:', JSON.stringify(subMsg));
      send(subMsg);
      toSubscribe.forEach((symbol) => subscribedSymbolsRef.current.add(symbol));
    }
  }, [normalizedSymbols, state, enabled, send]);

  // Cleanup on unmount
  useEffect(() => {
    const subscribedSymbols = subscribedSymbolsRef.current;
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      // Unsubscribe from all symbols on unmount
      if (state === 'connected' && subscribedSymbols.size > 0) {
        send({
          type: 'unsubscribe',
          symbols: Array.from(subscribedSymbols),
        });
        subscribedSymbols.clear();
      }
    };
  }, [state, send]);

  return {
    isConnected: state === 'connected',
    isConnecting: state === 'connecting',
    subscribedSymbols: Array.from(subscribedSymbolsRef.current),
  };
}

/**
 * Hook to manage market subscriptions with mutations
 * Provides explicit subscribe/unsubscribe functions
 * Uses the shared WebSocket connection from WebSocketProvider
 */
export function useMarketSubscriptionMutation() {
  const queryClient = useQueryClient();
  const { state, send, subscribe: wsSubscribe } = useWs();
  const { enable: enableWebSocket } = useWebSocketControl();
  const unsubscribeHandlersRef = useRef<Map<string, () => void>>(new Map());

  // Enable WebSocket when this hook is used
  useEffect(() => {
    enableWebSocket();
  }, [enableWebSocket]);

  // Subscribe to websocket events
  useEffect(() => {
    if (state !== 'connected') {
      return;
    }

    const unsubscribeQuote = wsSubscribe('market:quote', (data: unknown) => {
      const update = data as QuoteUpdate;
      queryClient.setQueryData<Quote[]>(
        ['market', 'quotes', [update.symbol]],
        (oldData) => {
          if (!oldData) return [{ symbol: update.symbol, price: update.price, change: String(update.change), percentChange: String(update.percentChange) }];
          return oldData.map((quote) =>
            quote.symbol === update.symbol
              ? {
                  ...quote,
                  price: update.price,
                  change: String(update.change),
                  percentChange: String(update.percentChange),
                }
              : quote
          );
        }
      );
    });

    const unsubscribeUpdate = wsSubscribe('market:update', (data: unknown) => {
      const update = data as QuoteUpdate;
      queryClient.setQueryData<Quote[]>(
        ['market', 'quotes', [update.symbol]],
        (oldData) => {
          if (!oldData) return [{ symbol: update.symbol, price: update.price, change: String(update.change), percentChange: String(update.percentChange) }];
          return oldData.map((quote) =>
            quote.symbol === update.symbol
              ? {
                  ...quote,
                  price: update.price,
                  change: String(update.change),
                  percentChange: String(update.percentChange),
                }
              : quote
          );
        }
      );
    });

    unsubscribeHandlersRef.current.set('market:quote', unsubscribeQuote);
    unsubscribeHandlersRef.current.set('market:update', unsubscribeUpdate);

    return () => {
      unsubscribeQuote();
      unsubscribeUpdate();
    };
  }, [state, wsSubscribe, queryClient]);

  const subscribe = useMutation({
    mutationFn: async (params: SubscribeRequest) => {
      if (state !== 'connected') {
        throw new Error('WebSocket not connected');
      }
      send({
        type: 'subscribe',
        symbols: params.symbols,
      });
      return params;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market', 'quotes'] });
    },
  });

  const unsubscribe = useMutation({
    mutationFn: async (params: UnsubscribeRequest) => {
      if (state !== 'connected') {
        throw new Error('WebSocket not connected');
      }
      send({
        type: 'unsubscribe',
        symbols: params.symbols,
      });
      return params;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market', 'quotes'] });
    },
  });

  return {
    subscribe: subscribe.mutateAsync,
    unsubscribe: unsubscribe.mutateAsync,
    isSubscribing: subscribe.isPending,
    isUnsubscribing: unsubscribe.isPending,
    isConnected: state === 'connected',
    isConnecting: state === 'connecting',
    subscribeError: subscribe.error,
    unsubscribeError: unsubscribe.error,
  };
}

// =====================================================
// FINANCIALS HOOKS
// =====================================================

/**
 * Hook to fetch financial statements for a symbol
 */
export function useFinancials(
  params: GetFinancialsRequest,
  enabled: boolean = true
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'financials', params.symbol, params.statement, params.frequency],
    queryFn: () => marketDataService.getFinancials(params),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: enabled && !!params.symbol,
  });

  return {
    financials: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// EARNINGS TRANSCRIPT HOOKS
// =====================================================

/**
 * Hook to fetch earnings transcript for a symbol
 */
export function useEarningsTranscript(
  params: GetEarningsTranscriptRequest,
  enabled: boolean = true
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'earnings-transcript', params.symbol, params.quarter, params.year],
    queryFn: () => marketDataService.getEarningsTranscript(params),
    staleTime: 60 * 60 * 1000, // 1 hour
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    enabled: enabled && !!params.symbol,
  });

  return {
    transcript: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

// =====================================================
// HOLDERS HOOKS
// =====================================================

/**
 * Hook to fetch holders data for a symbol
 */
export function useHolders(
  params: GetHoldersRequest,
  enabled: boolean = true
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['market', 'holders', params.symbol, params.holder_type],
    queryFn: () => marketDataService.getHolders(params),
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 4 * 60 * 60 * 1000, // 4 hours
    enabled: enabled && !!params.symbol,
  });

  return {
    holders: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
