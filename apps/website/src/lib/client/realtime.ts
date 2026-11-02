import { type QueryClient, type QueryKey, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { subscriptions } from '@/lib/client/backend'
import { TRADES_KEY } from '@/lib/client/trades/trades'
import { SETTINGS_KEY } from '@/lib/client/settings'
import { WORKSPACES_KEY } from '@/lib/client/workspaces'

export type ChangeTopic = 'TRADES' | 'JOURNAL' | 'LABELS' | 'PLANS' | 'SETTINGS' | 'WORKSPACES' | 'BROKERAGE'

export interface ChangeEvent {
  topic: ChangeTopic | null
  workspaceId: string | null
  /** Changes may have been missed: refetch everything. */
  resync: boolean
}

/** Changes arriving this close together are applied as one refresh. */
export const BATCH_MS = 120

const CHANGES = 'subscription Changes { changes { topic workspaceId resync } }'

/**
 * The cached queries each topic can make stale. Statistics, journal entries
 * and label names all live under the trades key, so most topics refresh it.
 */
const TOPIC_KEYS: Record<ChangeTopic, QueryKey[]> = {
  TRADES: [TRADES_KEY],
  JOURNAL: [TRADES_KEY],
  LABELS: [TRADES_KEY],
  PLANS: [['plans'], TRADES_KEY],
  SETTINGS: [SETTINGS_KEY, TRADES_KEY],
  WORKSPACES: [WORKSPACES_KEY, ['planning-rule'], ['workspace']],
  BROKERAGE: [['brokerage'], ['workspace'], ['planning-rule'], WORKSPACES_KEY],
}

/** The query keys to refresh for a batch of changes, or 'all' when one asks for a resync. */
export function staleKeys(events: ChangeEvent[]): QueryKey[] | 'all' {
  if (events.some((event) => event.resync || event.topic === null)) return 'all'
  const keys = new Map<string, QueryKey>()
  for (const event of events) {
    for (const key of TOPIC_KEYS[event.topic as ChangeTopic]) keys.set(JSON.stringify(key), key)
  }
  return [...keys.values()]
}

async function refresh(client: QueryClient, events: ChangeEvent[]) {
  const keys = staleKeys(events)
  if (keys === 'all') return client.invalidateQueries()
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })))
}

/**
 * Keeps every open query current: the server pushes a change whenever the
 * user's data changes, from this device, another one, an import or a rebuild.
 * A reconnect refreshes everything, since changes may have been missed while
 * the socket was down.
 */
export function useRealtimeUpdates() {
  const client = useQueryClient()
  useEffect(() => {
    let pending: ChangeEvent[] = []
    let timer: ReturnType<typeof setTimeout> | null = null
    const queue = (event: ChangeEvent) => {
      pending.push(event)
      timer ??= setTimeout(() => {
        const batch = pending
        pending = []
        timer = null
        void refresh(client, batch)
      }, BATCH_MS)
    }
    const stopListening = subscriptions.on('connected', (_socket, _payload, wasRetry) => {
      if (wasRetry) queue({ topic: null, workspaceId: null, resync: true })
    })
    const unsubscribe = subscriptions.subscribe<{ changes: ChangeEvent }>(
      { query: CHANGES },
      {
        next: (result) => {
          if (result.data?.changes) queue(result.data.changes)
        },
        error: () => {},
        complete: () => {},
      },
    )
    return () => {
      unsubscribe()
      stopListening()
      if (timer) clearTimeout(timer)
    }
  }, [client])
}
