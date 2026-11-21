import { expect, test } from 'bun:test'
import { taggedFillIndex, type TaggedFill } from './note-fill-mention'
import { formatDateTime } from '@/lib/format'
import type { TradeFill } from '@/lib/client/trades/trades'

test('a saved tag finds its execution after reordering without jumping to a different fill sharing the key', () => {
  const trim: TradeFill = {
    key: 'shared', role: 'reduce', executedAt: '2026-11-03T15:00:00Z', quantity: '20',
    price: '5.10', fee: '0', derived: false, manual: false,
  }
  const close = { ...trim, role: 'close', quantity: '50' }
  const tag: TaggedFill = {
    tradeId: 't', fillKey: 'shared', fillNumber: 1,
    text: `@Fill #1 · Trim · 20 at $5.10 · ${formatDateTime(trim.executedAt)}`,
  }
  expect(taggedFillIndex(tag, 't', [close, trim])).toBe(1)
  expect(taggedFillIndex(tag, 't', [close])).toBe(-1)
  expect(taggedFillIndex(tag, 'another-trade', [trim])).toBe(-1)
  expect(taggedFillIndex(tag, 't', [{ ...trim, price: '5.11' }])).toBe(0)
})
