import { describe, expect, test } from 'bun:test'
import { GraphQLRequestError } from '../api'
import {
  type AccountType,
  type BrokerageConnection,
  accountSummary,
  accountTypeLabel,
  authorizationStep,
  balanceRows,
  brokerageErrorMessage,
  connectionHealth,
  connectionsNeedingAttention,
  importModeLabel,
  parsePortalReturn,
  positionRows,
  selectionInput,
  taxTreatmentLabel,
} from './brokerage-model'

describe('parsePortalReturn', () => {
  test('reads the Connection Portal redirect', () => {
    expect(parsePortalReturn({ status: 'SUCCESS', connection_id: 'conn-1' })).toEqual({
      kind: 'success',
      connectionId: 'conn-1',
    })
    expect(parsePortalReturn({ status: 'ERROR', status_code: '500', error_code: 'INVALID_CREDENTIALS' })).toEqual({
      kind: 'error',
      code: 'INVALID_CREDENTIALS',
    })
    expect(parsePortalReturn({ status: 'ABANDONED' })).toEqual({ kind: 'abandoned' })
  })

  test('anything else is invalid', () => {
    expect(parsePortalReturn({ status: 'SUCCESS' })).toEqual({ kind: 'invalid' })
    expect(parsePortalReturn({})).toEqual({ kind: 'invalid' })
    expect(parsePortalReturn({ status: 42 })).toEqual({ kind: 'invalid' })
  })
})

describe('authorizationStep', () => {
  const attempt = (status: string, extra: Partial<{ errorCode: string; intent: string; expired: boolean }> = {}) => ({
    status,
    errorCode: extra.errorCode ?? null,
    intent: extra.intent ?? 'connect',
    expired: extra.expired ?? false,
  })

  test('waits until the attempt is final', () => {
    expect(authorizationStep(attempt('pending'))).toEqual({ kind: 'waiting' })
    expect(authorizationStep(attempt('processing'))).toEqual({ kind: 'waiting' })
  })

  test('success depends on the intent', () => {
    expect(authorizationStep(attempt('authorized'))).toEqual({ kind: 'choose-accounts' })
    expect(authorizationStep(attempt('authorized', { intent: 'reauthorize' }))).toEqual({ kind: 'reauthorized' })
  })

  test('failures explain themselves', () => {
    const mismatch = authorizationStep(attempt('failed', { errorCode: 'identity_mismatch' }))
    expect(mismatch.kind).toBe('failed')
    expect((mismatch as { message: string }).message).toContain('different SnapTrade account')
    expect(authorizationStep(attempt('pending', { expired: true })).kind).toBe('failed')
    expect(authorizationStep(null).kind).toBe('failed')
    expect(authorizationStep(attempt('failed', { errorCode: 'something_new' })).kind).toBe('failed')
  })
})

describe('connectionHealth', () => {
  const connection = (overrides: Partial<BrokerageConnection>): BrokerageConnection => ({
    id: 'c',
    authMode: 'commercial',
    institutionName: 'Sandbox',
    disabled: false,
    disabledAt: null,
    newAccountsAvailable: false,
    unlinked: false,
    grantStatus: null,
    checkedAt: null,
    accounts: [],
    ...overrides,
  })

  test('maps state to an action the user can take', () => {
    expect(connectionHealth(connection({}))).toEqual({ tone: 'ok', label: 'Syncing' })
    expect(connectionHealth(connection({ disabled: true }))).toMatchObject({ action: 'reconnect' })
    expect(connectionHealth(connection({ authMode: 'oauth', grantStatus: 'active', disabled: true }))).toMatchObject({
      action: 'repair-in-snaptrade',
    })
    expect(connectionHealth(connection({ authMode: 'oauth', grantStatus: 'reauthorization_required' }))).toMatchObject({
      action: 'reauthorize',
    })
    expect(connectionHealth(connection({ unlinked: true, disabled: true }))).toEqual({
      tone: 'muted',
      label: 'Not syncing',
    })
  })

  test('only fixable connections need attention', () => {
    const broken = connection({ id: 'broken', disabled: true })
    const gone = connection({ id: 'gone', disabled: true, unlinked: true })
    expect(connectionsNeedingAttention([connection({}), broken, gone])).toEqual([broken])
  })
})

describe('selectionInput', () => {
  const pick = (importMode: 'ONE_YEAR' | 'CUSTOM', customStartDate: string | null = null) => ({
    snaptradeAccountId: 'acct-1',
    connectionId: 'conn-1',
    importMode,
    customStartDate,
  })

  test('requires an account and a valid custom date', () => {
    expect(selectionInput([], '2026-10-27')).toEqual({ ok: false, message: 'Choose at least one account.' })
    expect(selectionInput([pick('CUSTOM')], '2026-10-27').ok).toBe(false)
    expect(selectionInput([pick('CUSTOM', '2026-10-28')], '2026-10-27').ok).toBe(false)
  })

  test('drops dates that only a custom range uses', () => {
    const result = selectionInput([pick('ONE_YEAR', '2020-01-01'), pick('CUSTOM', '2020-01-01')], '2026-10-27')
    expect(result).toEqual({
      ok: true,
      accounts: [pick('ONE_YEAR', null), pick('CUSTOM', '2020-01-01')],
    })
  })
})

test('brokerage errors become plain messages', () => {
  expect(brokerageErrorMessage(new GraphQLRequestError('x', 'RATE_LIMITED'), 'fallback')).toContain('busy')
  expect(brokerageErrorMessage(new GraphQLRequestError('Pick a date', 'INVALID_IMPORT_RANGE'), 'fallback')).toBe(
    'Pick a date',
  )
  expect(brokerageErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
})

describe('snapshot rows', () => {
  test('reads positions from the positions/all envelope and from a bare list', () => {
    const stock = {
      symbol: { symbol: { symbol: 'AAPL', description: 'Apple Inc.', currency: { code: 'USD' } } },
      units: 10,
      price: 190.5,
      average_purchase_price: 150,
      open_pnl: 405,
    }
    expect(positionRows({ results: [stock], data_freshness: {} })).toEqual([
      {
        symbol: 'AAPL',
        description: 'Apple Inc.',
        units: 10,
        price: 190.5,
        averagePrice: 150,
        openPnl: 405,
        currency: 'USD',
      },
    ])
    expect(positionRows([{ instrument: { symbol: 'BTC' }, units: 'x', price: '', currency: { code: 'CAD' } }])).toEqual([
      {
        symbol: 'BTC',
        description: null,
        units: null,
        price: null,
        averagePrice: null,
        openPnl: null,
        currency: 'CAD',
      },
    ])
  })

  test('reads positions/all as SnapTrade returns it for Webull', () => {
    const rows = positionRows({
      results: [
        { instrument: { symbol: 'AEYE', description: 'AudioEye' }, units: '2', price: '11.91', cost_basis: '10', currency: 'USD' },
        { instrument: { symbol: 'EVMN' }, units: '-1', price: '6.31', cost_basis: '6.32', currency: 'USD' },
      ],
    })
    expect(rows.map(({ symbol, units, price, averagePrice }) => ({ symbol, units, price, averagePrice }))).toEqual([
      { symbol: 'AEYE', units: 2, price: 11.91, averagePrice: 10 },
      { symbol: 'EVMN', units: -1, price: 6.31, averagePrice: 6.32 },
    ])
    expect(rows[0].openPnl).toBeCloseTo(3.82)
    expect(rows[1].openPnl).toBeCloseTo(0.01, 5)
  })

  test('tolerates shapes it does not know', () => {
    expect(positionRows(null)).toEqual([])
    expect(positionRows({ results: 'nope' })).toEqual([])
    expect(positionRows([42, {}])).toEqual([
      {
        symbol: 'Unknown',
        description: null,
        units: null,
        price: null,
        averagePrice: null,
        openPnl: null,
        currency: null,
      },
    ])
    expect(balanceRows([{ currency: { code: 'USD' }, cash: 1000, buying_power: 900 }])).toEqual([
      { currency: 'USD', cash: 1000, buyingPower: 900 },
    ])
    expect(balanceRows({})).toEqual([])
  })
})

test('stored import modes get the picker labels', () => {
  expect(importModeLabel('two_years')).toBe('Past 2 years')
  expect(importModeLabel('all')).toBe('All history')
  expect(importModeLabel('mystery')).toBe('mystery')
})

describe('account types', () => {
  const classified = (
    accountType: AccountType,
    cashOrMargin: 'CASH' | 'MARGIN' | 'UNKNOWN',
    rawType: string | null = null,
  ) => ({ rawType, accountType, taxTreatment: 'UNKNOWN' as const, cashOrMargin })

  test('labels the standard type with cash or margin', () => {
    expect(accountSummary(classified('ROTH_IRA', 'CASH'))).toBe('Roth IRA · Cash')
    expect(accountSummary(classified('TAXABLE', 'MARGIN'))).toBe('Taxable brokerage · Margin')
    expect(accountSummary(classified('PLAN_401K', 'UNKNOWN'))).toBe('401(k)')
  })

  test('falls back to the brokerage label when the type is unknown', () => {
    expect(accountTypeLabel(classified('UNKNOWN', 'UNKNOWN', 'RO'))).toBe('RO')
    expect(accountSummary(classified('UNKNOWN', 'UNKNOWN'))).toBe('')
  })

  test('names the tax treatment', () => {
    expect(taxTreatmentLabel({ ...classified('ROTH_IRA', 'CASH'), taxTreatment: 'TAX_FREE' })).toBe('Tax-free')
    expect(taxTreatmentLabel(classified('UNKNOWN', 'UNKNOWN'))).toBeNull()
  })
})
