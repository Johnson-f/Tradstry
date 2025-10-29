'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWs } from '@/lib/websocket/provider';
import apiConfig, { getFullUrl } from '@/lib/config/api';

async function fetchNotes() {
  const res = await fetch(getFullUrl(apiConfig.endpoints.tradeNotes.base), { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch notes');
  const json = await res.json();
  return json.data ?? [];
}

export function useNotes() {
  const queryClient = useQueryClient();
  const { subscribe } = useWs();

  const query = useQuery({
    queryKey: ['notes'],
    queryFn: fetchNotes,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const unsubCreate = subscribe('note:created', (note: any) => {
      queryClient.setQueryData<any[]>(['notes'], (prev) => prev ? [note, ...prev] : [note]);
    });
    const unsubUpdate = subscribe('note:updated', (note: any) => {
      queryClient.setQueryData<any[]>(['notes'], (prev) => prev?.map(n => n.id === note.id ? note : n) ?? [note]);
    });
    const unsubDelete = subscribe('note:deleted', (payload: any) => {
      queryClient.setQueryData<any[]>(['notes'], (prev) => prev?.filter(n => n.id !== payload.id) ?? []);
    });
    return () => { unsubCreate(); unsubUpdate(); unsubDelete(); };
  }, [subscribe, queryClient]);

  return query;
}


