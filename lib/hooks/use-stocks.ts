'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useWs } from '@/lib/websocket/provider';
import apiConfig, { getFullUrl } from '@/lib/config/api';
import { createClient } from '@/lib/supabase/client';
import type { Stock, CreateStockRequest, UpdateStockRequest } from '@/lib/types/stocks';

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


async function authHeader() {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('User not authenticated');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } as const;
}

export function useCreateStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateStockRequest) => {
      const headers = await authHeader();
      const res = await fetch(getFullUrl(apiConfig.endpoints.stocks.base), {
        method: 'POST', headers, body: JSON.stringify(payload), credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to create stock');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
    },
  });
}

export function useUpdateStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: UpdateStockRequest }) => {
      const headers = await authHeader();
      const res = await fetch(getFullUrl(apiConfig.endpoints.stocks.byId(id)), {
        method: 'PUT', headers, body: JSON.stringify(updates), credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to update stock');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
    },
  });
}

export function useDeleteStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const headers = await authHeader();
      const res = await fetch(getFullUrl(apiConfig.endpoints.stocks.byId(id)), {
        method: 'DELETE', headers, credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete stock');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
    },
  });
}


