import { expect, test } from 'bun:test'
import { type ChangeEvent, staleKeys } from './realtime'

const change = (topic: ChangeEvent['topic'], workspaceId: string | null = null): ChangeEvent => ({
  topic,
  workspaceId,
  resync: false,
})

test('each change refreshes the caches it can make stale, once per batch', () => {
  expect(staleKeys([change('TRADES', 'w1'), change('JOURNAL', 'w1'), change('LABELS')])).toEqual([['trades']])
  expect(staleKeys([change('PLANS', 'w1'), change('SETTINGS')])).toEqual([['plans'], ['trades'], ['settings']])
  expect(staleKeys([change('BROKERAGE')])).toEqual([['brokerage'], ['workspace'], ['planning-rule'], ['workspaces']])
  expect(staleKeys([change('WORKSPACES')])).toEqual([['workspaces'], ['planning-rule'], ['workspace']])
})

test('a resync, or a change without a topic, refreshes everything', () => {
  expect(staleKeys([change('TRADES'), { topic: null, workspaceId: null, resync: true }])).toBe('all')
  expect(staleKeys([change(null)])).toBe('all')
})
