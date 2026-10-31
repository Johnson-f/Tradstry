import { describe, expect, test } from 'bun:test'
import { GraphQLRequestError } from '@/lib/client/api'
import { createNoteDocument } from './note-document'
import {
  type FillForm,
  compactMoney,
  fillInput,
  holdTime,
  instrumentLabel,
  issueAction,
  issueTitle,
  keySymbol,
  openingInput,
  manualFillId,
  money,
  niceTicks,
  annotationDraft,
  annotationInput,
  previewR,
  riskDollars,
  percent,
  price,
  rMultiple,
  tone,
  toLocalInput,
  tradeErrorMessage,
} from './trades-model'

test('money keeps signs readable', () => {
  expect(money('98.00')).toBe('$98.00')
  expect(money('-79.00')).toBe('−$79.00')
  expect(money('12.5', { signed: true })).toBe('+$12.50')
  expect(money(null)).toBe('—')
  expect(compactMoney(1250)).toBe('$1.3K')
  expect(compactMoney(-340)).toBe('−$340')
  expect(price('0.3467')).toBe('$0.3467')
  expect(price('29.36')).toBe('$29.36')
})

test('ratios, percents and R', () => {
  expect(percent('0.5', { ratio: true })).toBe('50%')
  expect(percent('2.5')).toBe('+2.5%')
  expect(rMultiple('1.96')).toBe('+1.96R')
  expect(rMultiple('-1')).toBe('-1.00R')
  expect(rMultiple(null)).toBe('—')
  expect(tone('-0.01')).toBe('loss')
  expect(tone('0.00')).toBe('flat')
  expect(tone(null)).toBe('flat')
})

test('hold times read like a trader says them', () => {
  expect(holdTime(45)).toBe('45s')
  expect(holdTime(25 * 60)).toBe('25m')
  expect(holdTime(2 * 3600 + 5 * 60)).toBe('2h 5m')
  expect(holdTime(3 * 86400 + 4 * 3600)).toBe('3d 4h')
  expect(holdTime(40 * 86400)).toBe('40d')
  expect(holdTime(null)).toBe('—')
})

test('instruments are labelled for people', () => {
  const base = { kind: 'single' as const, strategyLabel: null, underlying: 'IONQ' }
  expect(instrumentLabel({ ...base, symbol: 'AAPL', option: null })).toBe('AAPL')
  expect(
    instrumentLabel({
      ...base,
      symbol: 'IONQ  260508P00037000',
      option: { underlying: 'IONQ', expiry: '2026-05-08', right: 'put', strike: '37', multiplier: '100' },
    }),
  ).toBe('IONQ May 8, 2026 $37 put')
  expect(instrumentLabel({ ...base, kind: 'strategy', strategyLabel: 'Call spread', symbol: 'X', option: null })).toBe(
    'IONQ Call spread',
  )
})

test('errors become plain messages', () => {
  expect(tradeErrorMessage(new GraphQLRequestError('split_at_first_fill', 'DECISION_REJECTED'), 'x')).toContain('later entry')
  expect(tradeErrorMessage(new GraphQLRequestError('changed', 'CONFLICT'), 'x')).toContain('another device')
  expect(tradeErrorMessage(new GraphQLRequestError('Quantity must be above zero', 'INVALID_QUANTITY'), 'x')).toBe(
    'Quantity must be above zero',
  )
  expect(tradeErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
})

test('issues name what to do about them', () => {
  expect(issueAction({ code: 'position_mismatch' })).toBe('opening-position')
  expect(issueAction({ code: 'dust_residual' })).toBeNull()
  expect(issueTitle('position_mismatch')).toBe('Position differs from your brokerage')
  expect(issueTitle('something_new')).toBe('Something new')
})

test('fill keys', () => {
  expect(manualFillId('manual:abc')).toBe('abc')
  expect(manualFillId('snaptrade:abc')).toBeNull()
})

describe('journal entries', () => {
  const orb = { id: 'e1', kind: 'EDGE' as const, name: 'ORB', color: null, archived: false }
  const gap = { id: 't1', kind: 'TAG' as const, name: 'gap up', color: '#2563eb', archived: false }

  test('a draft holds label IDs and round-trips into the save input', () => {
    const draft = annotationDraft({
      id: 'a1', tradeId: 'tr', notes: createNoteDocument('n'), edges: [orb], entryTactics: [], tags: [gap], mistakes: [],
      initialStop: '9.5', plannedRisk: null, version: 1, updatedAt: '', orphaned: false,
    })
    expect(draft).toEqual({
      notes: createNoteDocument('n'), edgeIds: ['e1'], entryTacticIds: [], tagIds: ['t1'], mistakeIds: [], initialStop: '9.5', plannedRisk: '',
    })
    expect(annotationInput(draft)).toEqual({
      ok: true,
      input: { notes: createNoteDocument('n'), edgeIds: ['e1'], entryTacticIds: [], tagIds: ['t1'], mistakeIds: [], initialStop: '9.5', plannedRisk: null },
    })
  })

  test('stops and risk must be above zero; a dollar sign is fine', () => {
    const draft = annotationDraft(null)
    expect(annotationInput({ ...draft, initialStop: '0' })).toEqual({ ok: false, message: 'The initial stop must be a price above zero.' })
    expect(annotationInput({ ...draft, plannedRisk: 'abc' }).ok).toBe(false)
    expect(annotationInput({ ...draft, plannedRisk: ' $1,250 ' })).toMatchObject({ ok: true, input: { plannedRisk: '1250' } })
  })

  test('risk prefers the planned amount, else the stop distance times size and multiplier', () => {
    const stock = { avgEntry: '10', maxQuantity: '10', option: null }
    expect(riskDollars(stock, { initialStop: '9.5', plannedRisk: '' })).toBe(5)
    expect(riskDollars(stock, { initialStop: '9.5', plannedRisk: '4' })).toBe(4)
    expect(riskDollars(stock, { initialStop: '', plannedRisk: '' })).toBeNull()
    expect(riskDollars(stock, { initialStop: '10', plannedRisk: '' })).toBeNull()
    const option = { avgEntry: '1.68', maxQuantity: '2', option: { underlying: 'IONQ', expiry: '', right: 'put' as const, strike: '37', multiplier: '100' } }
    expect(riskDollars(option, { initialStop: '1.18', plannedRisk: '' })).toBeCloseTo(100)
    expect(previewR('10', 5)).toBe(2)
    expect(previewR(null, 5)).toBeNull()
    expect(previewR('10', null)).toBeNull()
  })
})

describe('fillInput', () => {
  const form = (overrides: Partial<FillForm> = {}): FillForm => ({
    assetClass: 'STOCK',
    symbol: ' aapl ',
    expiry: '',
    right: 'PUT',
    strike: '',
    side: 'BUY',
    quantity: '10',
    price: '190.5',
    fee: '',
    executedAt: '2026-01-02T10:30',
    closing: false,
    ...overrides,
  })
  const now = new Date('2026-10-29T12:00:00Z')

  test('builds the input', () => {
    const result = fillInput(form(), now)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.input).toMatchObject({
        instrument: { assetClass: 'STOCK', symbol: 'AAPL' },
        side: 'BUY',
        quantity: '10',
        price: '190.5',
        fee: '0',
        intent: null,
      })
    }
  })

  test('options need contract details and a close is marked', () => {
    expect(fillInput(form({ assetClass: 'OPTION' }), now).ok).toBe(false)
    const result = fillInput(form({ assetClass: 'OPTION', expiry: '2026-05-08', strike: '37', closing: true }), now)
    expect(result.ok && result.input.instrument).toMatchObject({ expiry: '2026-05-08', right: 'PUT', strike: '37' })
    expect(result.ok && result.input.intent).toBe('CLOSE')
  })

  test('refuses what the backend would', () => {
    expect(fillInput(form({ quantity: '0' }), now)).toEqual({ ok: false, message: 'Quantity must be above zero.' })
    expect(fillInput(form({ symbol: 'not a ticker' }), now).ok).toBe(false)
    expect(fillInput(form({ fee: '-1' }), now).ok).toBe(false)
    expect(fillInput(form({ executedAt: '2027-01-01T00:00' }), now)).toEqual({
      ok: false,
      message: 'A fill cannot be in the future.',
    })
  })
})

test('times round-trip through datetime-local inputs', () => {
  const local = toLocalInput('2026-01-02T15:30:00Z')
  expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  expect(new Date(local).toISOString()).toBe('2026-01-02T15:30:00.000Z')
  expect(toLocalInput('nope')).toBe('')
})

test('opening positions validate and sign shorts', () => {
  const form = {
    assetClass: 'STOCK' as const,
    symbol: 'irbt',
    expiry: '',
    right: 'CALL' as const,
    strike: '',
    direction: 'SHORT' as const,
    quantity: '150',
    costPerUnit: '0.58',
    acquiredOn: '2025-12-01',
    asOf: '2026-01-01',
  }
  const result = openingInput(form)
  expect(result.ok && result.input).toMatchObject({ instrument: { symbol: 'IRBT' }, quantity: '-150', costPerUnit: '0.58' })
  expect(openingInput({ ...form, acquiredOn: '2026-02-01' }).ok).toBe(false)
  expect(openingInput({ ...form, quantity: '' }).ok).toBe(false)
  expect(keySymbol('stock:IRBT')).toBe('IRBT')
  expect(keySymbol('option:IONQ:2026-05-08:P:37:100')).toBe('IONQ')
})

test('axis ticks are round and include zero', () => {
  expect(niceTicks(0, 467.61)).toEqual([0, 200, 400, 600])
  expect(niceTicks(-286.7, 180)).toEqual([-400, -200, 0, 200])
  expect(niceTicks(0, 0)).toEqual([0])
  expect(niceTicks(1200, 4800)).toEqual([0, 2000, 4000, 6000])
})
