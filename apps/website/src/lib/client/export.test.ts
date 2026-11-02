import { expect, test } from 'bun:test'
import { createNoteDocument } from '@/lib/client/trades/note-document'
import type { TradeSummary } from '@/lib/client/trades/trades-model'
import { csvField, tradesCsv } from './export'

const trade = {
  id: 't1', kind: 'single', workspaceId: 'w', parentId: null, children: [], instrumentKey: 'stock:AAPL',
  assetClass: 'stock', symbol: 'AAPL', underlying: 'AAPL', option: null, direction: 'long', status: 'closed',
  openedAt: '2026-01-02T15:00:00Z', closedAt: '2026-01-05T15:00:00Z', maxQuantity: '10', openQuantity: '0',
  avgEntry: '100', avgExit: '110', gross: '100', fees: '2', net: '98.00', income: '0', returnPct: '9.8',
  holdingSeconds: 3600, fillCount: 2, nonEconomic: false, related: [], strategyLabel: null, issues: [],
  rMultiple: '1.96', mark: null, unrealized: null,
  annotation: {
    id: 'a1', tradeId: 't1', notes: createNoteDocument('Took it early, "too" early'), initialStop: '95', plannedRisk: null,
    edges: [{ id: 'e', kind: 'EDGE', name: 'Gap, and go', color: null, archived: false }],
    entryTactics: [], tags: [], mistakes: [], version: 1, updatedAt: '', orphaned: false,
    behavior: {
      conviction: 4, ruleAdherence: null, marketRegime: 'CHOPPY', plannedPreMarket: false, revengeTrade: true,
      brokeThirtyMinuteRule: null,
    },
  },
} as unknown as TradeSummary

test('cells with commas, quotes or line breaks are quoted', () => {
  expect(csvField('plain')).toBe('plain')
  expect(csvField('a, b')).toBe('"a, b"')
  expect(csvField('say "hi"')).toBe('"say ""hi"""')
  expect(csvField('two\nlines')).toBe('"two\nlines"')
  expect(csvField(null)).toBe('')
})

test('one row per trade with labels, behavior and plain-text notes', () => {
  const [header, row, end] = tradesCsv([{ workspace: 'Paper', trade }]).split('\r\n')
  expect(header.startsWith('Workspace,Symbol,Underlying')).toBe(true)
  expect(row).toContain('Paper,AAPL,AAPL,stock,,long,closed,2026-01-02T15:00:00Z')
  expect(row).toContain(',98.00,9.8,1.96,"Gap, and go",,,,95,,4,,Choppy,no,yes,,"Took it early, ""too"" early"')
  expect(end).toBe('')
})
