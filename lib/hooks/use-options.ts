'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWs } from '@/lib/websocket/provider';
import apiConfig, { getFullUrl } from '@/lib/config/api';
import { createClient } from '@/lib/supabase/client';
import type { OptionTrade } from '@/lib/types/options';

async function fetchOptions(): Promise<OptionTrade[]> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('User not authenticated');
  }

  const res = await fetch(getFullUrl(apiConfig.endpoints.options.base), {
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
    throw new Error('Failed to fetch options');
  }

  const json = await res.json();
  return (json.data ?? []) as OptionTrade[];
}

export function useOptions() {
  const queryClient = useQueryClient();
  const { subscribe } = useWs();

  const query = useQuery<OptionTrade[]>({
    queryKey: ['options'],
    queryFn: fetchOptions,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const unsubCreate = subscribe('option:created', (data) => {
      const option = data as OptionTrade;
      queryClient.setQueryData<OptionTrade[]>(['options'], (prev) => prev ? [option, ...prev] : [option]);
    });
    const unsubUpdate = subscribe('option:updated', (data) => {
      const option = data as OptionTrade;
      queryClient.setQueryData<OptionTrade[]>(['options'], (prev) => prev?.map(o => o.id === option.id ? option : o) ?? [option]);
    });
    const unsubDelete = subscribe('option:deleted', (data) => {
      const payload = data as { id: number };
      queryClient.setQueryData<OptionTrade[]>(['options'], (prev) => prev?.filter(o => o.id !== payload.id) ?? []);
    });
    return () => { unsubCreate(); unsubUpdate(); unsubDelete(); };
  }, [subscribe, queryClient]);

  return query;
}


