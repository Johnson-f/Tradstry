import { expect, test } from 'bun:test'
import { loadAllTrades } from './trade-list'
import type { TradeSummary } from './trades-model'

function trade(id: number): TradeSummary {
  return {
    id: String(id), kind: 'single', workspaceId: 'workspace', parentId: null, children: [],
    instrumentKey: 'stock:AAPL', assetClass: 'stock', symbol: 'AAPL', underlying: 'AAPL',
    option: null, direction: 'long', status: 'closed',
    openedAt: '2026-10-29T12:00:00Z', closedAt: '2026-10-29T13:00:00Z',
    maxQuantity: '1', openQuantity: '0', avgEntry: '100', avgExit: '101',
    gross: '1', fees: '0', net: '1', income: '0', returnPct: '1', holdingSeconds: 3600,
    fillCount: 2, nonEconomic: false, related: [], strategyLabel: null, issues: [],
    annotation: null, rMultiple: null, mark: null, unrealized: null,
  }
}

test.each([0, 50, 123, 200, 450])('loads all %i matching trades without truncating or reordering', async (total) => {
  const items = Array.from({ length: total }, (_, i) => trade(i))
  let requests = 0
  const result = await loadAllTrades(async (offset, limit) => {
    requests += 1
    expect(limit).toBeLessThanOrEqual(200)
    return { total, items: items.slice(offset, offset + limit) }
  })
  expect(result).toEqual({ total, items })
  expect(requests).toBe(Math.max(1, Math.ceil(total / 200)))
})

test('continues from the number actually returned when a batch is shorter', async () => {
  const items = Array.from({ length: 250 }, (_, i) => trade(i))
  const result = await loadAllTrades(async (offset) => ({
    total: items.length,
    items: items.slice(offset, offset + 75),
  }))
  expect(result.items).toEqual(items)
})

test('reports a later request failure instead of presenting a partial list', async () => {
  const failure = new Error('Connection lost')
  await expect(loadAllTrades(async (offset) => {
    if (offset > 0) throw failure
    return { total: 2, items: [trade(0)] }
  })).rejects.toBe(failure)
})

test('fails instead of looping if the server stops before the reported total', async () => {
  await expect(loadAllTrades(async () => ({ total: 1, items: [] })))
    .rejects.toThrow('Could not load the complete trade list.')
})
