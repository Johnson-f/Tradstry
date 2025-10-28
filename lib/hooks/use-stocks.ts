'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWs } from '@/lib/websocket/provider';
import apiConfig, { getFullUrl } from '@/lib/config/api';
import { createClient } from '@/lib/supabase/client';
import type { Stock } from '@/lib/types/stocks';

async function fetchStocks(): Promise<Stock[]> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('User not authenticated');
  }

  const res = await fetch(getFullUrl(apiConfig.endpoints.stocks.base), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Authentication failed');
    }
    throw new Error('Failed to fetch stocks');
  }

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
    const unsubCreate = subscribe('stock:created', (data) => {
      const stock = data as Stock;
      queryClient.setQueryData<Stock[]>(['stocks'], (prev) => prev ? [stock, ...prev] : [stock]);
    });
    const unsubUpdate = subscribe('stock:updated', (data) => {
      const stock = data as Stock;
      queryClient.setQueryData<Stock[]>(['stocks'], (prev) => prev?.map(s => s.id === stock.id ? stock : s) ?? [stock]);
    });
    const unsubDelete = subscribe('stock:deleted', (data) => {
      const payload = data as { id: number };
      queryClient.setQueryData<Stock[]>(['stocks'], (prev) => prev?.filter(s => s.id !== payload.id) ?? []);
    });
    return () => { unsubCreate(); unsubUpdate(); unsubDelete(); };
  }, [subscribe, queryClient]);

  return query;
}


