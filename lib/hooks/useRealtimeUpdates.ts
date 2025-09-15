'use client'

import { useEffect } from 'react'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { QueryClient } from '@tanstack/react-query'

type Callback<T> = (payload: RealtimePostgresChangesPayload<T>) => void

// Generic hook for real-time subscriptions
export function useRealtimeTable<T = any>(
  table: string, 
  queryClient: QueryClient,
  queryKey: string[]    
) {
  useEffect(() => {
    const subscription = createClient()
      .channel(`${table}_changes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        () => {
          // Invalidate the query when changes are detected
          queryClient.invalidateQueries({ queryKey })
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [table, queryClient, queryKey])
}

// Hook for stocks
export function useRealtimeStocks(queryClient: QueryClient) {
  return useRealtimeTable('stocks', queryClient, ['stocks'])
}

// Hook for options
export function useRealtimeOptions(queryClient: QueryClient) {
  return useRealtimeTable('options', queryClient, ['options'])
}

// Hook for notes
export function useRealtimeNotes(queryClient: QueryClient) {
  return useRealtimeTable('notes', queryClient, ['notes'])
}

// Hook for images
export function useRealtimeImages(queryClient: QueryClient) {
  return useRealtimeTable('images', queryClient, ['images'])
}

// Hook for watchlists
export function useRealtimeWatchlists(queryClient: QueryClient) {
  return useRealtimeTable('watchlist', queryClient, ['watchlists'])
}

// Hook for watchlist items
export function useRealtimeWatchlistItems(queryClient: QueryClient, watchlistId?: number) {
  return useRealtimeTable('watchlist_items', queryClient, watchlistId ? ['watchlist-items', watchlistId] : ['watchlist-items'])
}
