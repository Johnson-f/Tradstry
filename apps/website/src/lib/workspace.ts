import type { BrokerageConnection } from '@/lib/client/brokerage-model'

const LAST_WORKSPACE_KEY = 'tradstry.lastWorkspace'

export function rememberWorkspace(id: string, storage: Storage = localStorage) {
  storage.setItem(LAST_WORKSPACE_KEY, id)
}

export function rememberedWorkspace(storage: Storage = localStorage): string | null {
  return storage.getItem(LAST_WORKSPACE_KEY)
}

/** The workspace `/` opens: the last one used if it still exists, else the oldest. */
export function pickWorkspace(workspaces: Array<{ id: string }>, remembered: string | null): string | null {
  return workspaces.find((workspace) => workspace.id === remembered)?.id ?? workspaces[0]?.id ?? null
}

export type WorkspaceSource =
  | { kind: 'brokerage'; institutionName: string; maskedNumber: string | null; unlinked: boolean }
  | { kind: 'manual' }
  | { kind: 'unknown' }

/**
 * Where each workspace's data comes from. Without connections (brokerage off,
 * or not loaded yet) nothing can be called manual, so it stays unknown.
 */
export function workspaceSources(
  workspaceIds: string[],
  connections: BrokerageConnection[] | undefined,
): Record<string, WorkspaceSource> {
  const linked = new Map<string, WorkspaceSource>()
  for (const connection of connections ?? []) {
    for (const account of connection.accounts) {
      if (!account.workspaceId) continue
      linked.set(account.workspaceId, {
        kind: 'brokerage',
        institutionName: connection.institutionName,
        maskedNumber: account.maskedNumber,
        unlinked: account.unlinked || connection.unlinked,
      })
    }
  }
  return Object.fromEntries(
    workspaceIds.map((id) => [id, linked.get(id) ?? (connections ? { kind: 'manual' } : { kind: 'unknown' })]),
  )
}

export function describeSource(source: WorkspaceSource | undefined): string | null {
  if (!source || source.kind === 'unknown') return null
  if (source.kind === 'manual') return 'Manual'
  return [source.institutionName, source.maskedNumber, source.unlinked ? 'not syncing' : null]
    .filter(Boolean)
    .join(' · ')
}
