import { describe, expect, test } from 'bun:test'
import type { BrokerageConnection } from '@/lib/client/brokerage-model'
import { describeSource, pickWorkspace, rememberWorkspace, rememberedWorkspace, workspaceSources } from './workspace'

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  }
}

describe('pickWorkspace', () => {
  const workspaces = [{ id: 'main' }, { id: 'ira' }]

  test('reopens the last workspace while it exists', () => {
    const storage = memoryStorage()
    rememberWorkspace('ira', storage)
    expect(pickWorkspace(workspaces, rememberedWorkspace(storage))).toBe('ira')
  })

  test('falls back to the first workspace', () => {
    expect(pickWorkspace(workspaces, 'deleted')).toBe('main')
    expect(pickWorkspace(workspaces, null)).toBe('main')
    expect(pickWorkspace([], 'main')).toBeNull()
  })
})

describe('workspaceSources', () => {
  const connection = {
    id: 'c',
    authMode: 'commercial',
    institutionName: 'Fidelity',
    disabled: false,
    disabledAt: null,
    newAccountsAvailable: false,
    unlinked: false,
    grantStatus: null,
    checkedAt: null,
    accounts: [
      {
        id: 'a',
        name: 'Roth IRA',
        maskedNumber: '••9876',
        rawType: null,
        isPaper: false,
        importMode: 'one_year',
        importStartDate: null,
        initialImportCompletedAt: null,
        unlinked: false,
        workspaceId: 'ira',
      },
    ],
  } satisfies BrokerageConnection

  test('labels brokerage and manual workspaces', () => {
    const sources = workspaceSources(['ira', 'main'], [connection])
    expect(describeSource(sources.ira)).toBe('Fidelity · ••9876')
    expect(describeSource(sources.main)).toBe('Manual')
  })

  test('says nothing when connections are unavailable', () => {
    expect(describeSource(workspaceSources(['ira'], undefined).ira)).toBeNull()
  })

  test('flags accounts that stopped syncing', () => {
    const unlinked = { ...connection, unlinked: true }
    expect(describeSource(workspaceSources(['ira'], [unlinked]).ira)).toBe('Fidelity · ••9876 · not syncing')
  })
})
