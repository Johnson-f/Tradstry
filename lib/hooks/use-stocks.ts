'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWs } from '@/lib/websocket/provider';
import apiConfig, { getFullUrl } from '@/lib/config/api';
import type { Stock } from '@/lib/types/stocks';

async function fetchStocks(): Promise<Stock[]> {
  const res = await fetch(getFullUrl(apiConfig.endpoints.stocks.base), { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch stocks');
  const json = await res.json();
  return (json.data ?? []) as Stock[];
}

export function useStocks() {
  const queryClient = useQueryClient();
  const { subscribe } = useWs();

  const query = useQuery<Stock[]>({
    queryKey: ['stocks'],
    queryFn: fetchStocks,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const unsubCreate = subscribe('stock:created', (stock: Stock) => {
      queryClient.setQueryData<Stock[]>(['stocks'], (prev) => prev ? [stock, ...prev] : [stock]);
    });
    const unsubUpdate = subscribe('stock:updated', (stock: Stock) => {
      queryClient.setQueryData<Stock[]>(['stocks'], (prev) => prev?.map(s => s.id === stock.id ? stock : s) ?? [stock]);
    });
    const unsubDelete = subscribe('stock:deleted', (payload: { id: number }) => {
      queryClient.setQueryData<Stock[]>(['stocks'], (prev) => prev?.filter(s => s.id !== payload.id) ?? []);
    });
    return () => { unsubCreate(); unsubUpdate(); unsubDelete(); };
  }, [subscribe, queryClient]);

  return query;
}


