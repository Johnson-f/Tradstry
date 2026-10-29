import { GraphQLRequestError } from '../api'

export type ImportMode = 'ONE_YEAR' | 'TWO_YEARS' | 'ALL' | 'CUSTOM'

export type AccountType =
  | 'TAXABLE'
  | 'TRADITIONAL_IRA'
  | 'ROLLOVER_IRA'
  | 'SEP_IRA'
  | 'SIMPLE_IRA'
  | 'ROTH_IRA'
  | 'PLAN_401K'
  | 'ROTH_401K'
  | 'PLAN_403B'
  | 'PLAN_457B'
  | 'HSA'
  | 'PLAN_529'
  | 'CUSTODIAL'
  | 'TRUST'
  | 'CRYPTO'
  | 'UNKNOWN'

export type TaxTreatment = 'TAXABLE' | 'TAX_DEFERRED' | 'TAX_FREE' | 'UNKNOWN'
export type CashOrMargin = 'CASH' | 'MARGIN' | 'UNKNOWN'

interface AccountClassification {
  rawType: string | null
  accountType: AccountType
  taxTreatment: TaxTreatment
  cashOrMargin: CashOrMargin
}

export interface AccountChoice extends AccountClassification {
  connectionId: string
  institutionName: string
  snaptradeAccountId: string
  name: string
  maskedNumber: string | null
  isPaper: boolean
  linkedWorkspaceId: string | null
  previouslyLinked: boolean
}

export interface BrokerageAccount extends AccountClassification {
  id: string
  name: string
  maskedNumber: string | null
  isPaper: boolean
  importMode: string
  importStartDate: string | null
  initialImportCompletedAt: string | null
  unlinked: boolean
  workspaceId: string | null
}

export interface BrokerageConnection {
  id: string
  authMode: 'commercial' | 'oauth'
  institutionName: string
  disabled: boolean
  disabledAt: string | null
  newAccountsAvailable: boolean
  unlinked: boolean
  grantStatus: string | null
  checkedAt: string | null
  accounts: BrokerageAccount[]
}

/** What the Connection Portal's redirect back to Tradstry says. */
export type PortalReturn =
  | { kind: 'success'; connectionId: string }
  | { kind: 'error'; code: string | null }
  | { kind: 'abandoned' }
  | { kind: 'invalid' }

export function parsePortalReturn(search: Record<string, unknown>): PortalReturn {
  const text = (key: string) =>
    typeof search[key] === 'string' && search[key] !== '' ? (search[key] as string) : null
  switch (text('status')) {
    case 'SUCCESS': {
      const connectionId = text('connection_id')
      return connectionId ? { kind: 'success', connectionId } : { kind: 'invalid' }
    }
    case 'ERROR':
      return { kind: 'error', code: text('error_code') ?? text('status_code') }
    case 'ABANDONED':
      return { kind: 'abandoned' }
    default:
      return { kind: 'invalid' }
  }
}

export interface AuthorizationStatus {
  status: string
  errorCode: string | null
  intent: string
  expired: boolean
}

export type AuthorizationStep =
  | { kind: 'waiting' }
  | { kind: 'choose-accounts' }
  | { kind: 'reauthorized' }
  | { kind: 'failed'; message: string }

const AUTHORIZATION_FAILURES: Record<string, string> = {
  access_denied: 'You chose not to share your SnapTrade account.',
  identity_mismatch:
    'That is a different SnapTrade account from the one your linked accounts came from. Disconnect SnapTrade in Brokerage first, then connect the other account.',
  identity_in_use: 'That SnapTrade account is already connected to another Tradstry account.',
  token_exchange_failed: 'SnapTrade did not finish the authorization. Try again.',
  missing_code: 'SnapTrade did not finish the authorization. Try again.',
}

/** What to show for an OAuth attempt; polling continues only while waiting. */
export function authorizationStep(attempt: AuthorizationStatus | null): AuthorizationStep {
  if (!attempt) return { kind: 'failed', message: 'This authorization link is not valid.' }
  if (attempt.expired) {
    return { kind: 'failed', message: 'The authorization took too long. Start again.' }
  }
  switch (attempt.status) {
    case 'pending':
    case 'processing':
      return { kind: 'waiting' }
    case 'authorized':
      return attempt.intent === 'reauthorize' ? { kind: 'reauthorized' } : { kind: 'choose-accounts' }
    default:
      return {
        kind: 'failed',
        message:
          (attempt.errorCode && AUTHORIZATION_FAILURES[attempt.errorCode]) ??
          'SnapTrade could not complete the authorization. Try again.',
      }
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  BROKERAGE_UNAVAILABLE: 'Brokerage linking is not available right now.',
  BROKER_UNAVAILABLE: 'This broker is not available for new connections right now.',
  OAUTH_UNAVAILABLE: 'Continuing with SnapTrade is not available right now.',
  REAUTHORIZATION_REQUIRED: 'Your SnapTrade access needs to be authorized again.',
  RECONNECT_REQUIRED: 'Reconnect your brokerage to continue.',
  RATE_LIMITED: 'SnapTrade is busy. Try again in a minute.',
  REPAIR_IN_SNAPTRADE: 'Connections shared from SnapTrade are repaired in your SnapTrade dashboard.',
  TOO_SOON: 'Holdings were refreshed moments ago. Try again in a few minutes.',
  NOT_FOUND: 'That brokerage connection was not found.',
  AUTHORIZATION_INCOMPLETE: 'SnapTrade has not finished the authorization yet.',
  NOT_REGISTERED: 'Connect a brokerage first.',
}

export function brokerageErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof GraphQLRequestError) {
    if (error.code && ERROR_MESSAGES[error.code]) return ERROR_MESSAGES[error.code]
    if (error.code === 'INVALID_SELECTION' || error.code === 'INVALID_IMPORT_RANGE') {
      return error.message
    }
  }
  return fallback
}

export type ConnectionHealth =
  | { tone: 'ok'; label: string }
  | { tone: 'warning'; label: string; action: 'reconnect' | 'reauthorize' | 'repair-in-snaptrade' }
  | { tone: 'muted'; label: string }

export function connectionHealth(connection: BrokerageConnection): ConnectionHealth {
  if (connection.unlinked) return { tone: 'muted', label: 'Not syncing' }
  if (connection.authMode === 'oauth' && connection.grantStatus !== 'active') {
    return { tone: 'warning', label: 'Needs authorization', action: 'reauthorize' }
  }
  if (connection.disabled) {
    return connection.authMode === 'oauth'
      ? { tone: 'warning', label: 'Disconnected at SnapTrade', action: 'repair-in-snaptrade' }
      : { tone: 'warning', label: 'Disconnected', action: 'reconnect' }
  }
  return { tone: 'ok', label: 'Syncing' }
}

export function connectionsNeedingAttention(connections: BrokerageConnection[]): BrokerageConnection[] {
  return connections.filter((connection) => connectionHealth(connection).tone === 'warning')
}

export interface AccountSelection {
  snaptradeAccountId: string
  connectionId: string
  importMode: ImportMode
  customStartDate: string | null
}

/** The GraphQL input for the chosen accounts, or the reason it is not ready. */
export function selectionInput(
  selections: AccountSelection[],
  today: string,
): { ok: true; accounts: AccountSelection[] } | { ok: false; message: string } {
  if (selections.length === 0) return { ok: false, message: 'Choose at least one account.' }
  for (const selection of selections) {
    if (selection.importMode !== 'CUSTOM') continue
    if (!selection.customStartDate) return { ok: false, message: 'Pick a start date for a custom range.' }
    if (selection.customStartDate > today) {
      return { ok: false, message: 'The start date cannot be in the future.' }
    }
  }
  return {
    ok: true,
    accounts: selections.map((selection) => ({
      ...selection,
      customStartDate: selection.importMode === 'CUSTOM' ? selection.customStartDate : null,
    })),
  }
}

export const IMPORT_MODE_LABELS: Record<ImportMode, string> = {
  ONE_YEAR: 'Past year',
  TWO_YEARS: 'Past 2 years',
  ALL: 'All history',
  CUSTOM: 'From a date',
}

export interface PositionRow {
  symbol: string
  description: string | null
  units: number | null
  price: number | null
  averagePrice: number | null
  openPnl: number | null
  currency: string | null
}

export interface BalanceRow {
  currency: string
  cash: number | null
  buyingPower: number | null
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
/** positions/all sends decimal strings ("6.31"); balances send numbers. */
const numberOrNull = (value: unknown) => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) ? number : null
}
const stringOrNull = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

/** Follows nested objects to a string, e.g. a currency's `code`. */
function textAt(value: unknown, ...paths: string[][]): string | null {
  for (const path of paths) {
    let current = value
    for (const key of path) current = isObject(current) ? current[key] : undefined
    const text = stringOrNull(current)
    if (text) return text
  }
  return null
}

/**
 * Snapshot rows straight from SnapTrade. Positions are either the
 * `{ results }` envelope of positions/all or a bare list, and a position's
 * symbol is nested differently by instrument kind, so read them loosely.
 * positions/all reports a per-share `cost_basis` and no P&L, so open P&L is
 * worked out from it; that also gives shorts (negative units) the right sign.
 */
export function positionRows(positions: unknown): PositionRow[] {
  const items = isObject(positions) ? positions.results : positions
  if (!Array.isArray(items)) return []
  return items.filter(isObject).map((item) => {
    const units = numberOrNull(item.units)
    const price = numberOrNull(item.price)
    const averagePrice = numberOrNull(item.average_purchase_price) ?? numberOrNull(item.cost_basis)
    const reportedPnl = numberOrNull(item.open_pnl)
    const openPnl =
      reportedPnl ?? (units !== null && price !== null && averagePrice !== null ? (price - averagePrice) * units : null)
    return {
      symbol:
        textAt(
          item,
          ['instrument', 'symbol'],
          ['symbol', 'symbol', 'symbol'],
          ['symbol', 'symbol'],
          ['symbol', 'option_symbol', 'ticker'],
          ['symbol'],
        ) ?? 'Unknown',
      description: textAt(item, ['instrument', 'description'], ['symbol', 'symbol', 'description'], ['symbol', 'description']),
      units,
      price,
      averagePrice,
      openPnl,
      currency: textAt(item, ['currency', 'code'], ['currency'], ['symbol', 'symbol', 'currency', 'code']),
    }
  })
}

export function balanceRows(balances: unknown): BalanceRow[] {
  if (!Array.isArray(balances)) return []
  return balances.filter(isObject).map((item) => ({
    currency: textAt(item, ['currency', 'code'], ['currency']) ?? '—',
    cash: numberOrNull(item.cash),
    buyingPower: numberOrNull(item.buying_power),
  }))
}

/** Labels the backend's stored mode, which is the enum in snake_case. */
export function importModeLabel(stored: string): string {
  return IMPORT_MODE_LABELS[stored.toUpperCase() as ImportMode] ?? stored
}

const ACCOUNT_TYPE_LABELS: Record<Exclude<AccountType, 'UNKNOWN'>, string> = {
  TAXABLE: 'Taxable brokerage',
  TRADITIONAL_IRA: 'Traditional IRA',
  ROLLOVER_IRA: 'Rollover IRA',
  SEP_IRA: 'SEP IRA',
  SIMPLE_IRA: 'SIMPLE IRA',
  ROTH_IRA: 'Roth IRA',
  PLAN_401K: '401(k)',
  ROTH_401K: 'Roth 401(k)',
  PLAN_403B: '403(b)',
  PLAN_457B: '457(b)',
  HSA: 'HSA',
  PLAN_529: '529 plan',
  CUSTODIAL: 'Custodial (UTMA/UGMA)',
  TRUST: 'Trust',
  CRYPTO: 'Crypto',
}

const TAX_TREATMENT_LABELS: Record<TaxTreatment, string | null> = {
  TAXABLE: 'Taxable',
  TAX_DEFERRED: 'Tax-deferred',
  TAX_FREE: 'Tax-free',
  UNKNOWN: null,
}

/** The standard type, or what the brokerage calls it when Tradstry cannot tell. */
export function accountTypeLabel(account: AccountClassification): string | null {
  return account.accountType === 'UNKNOWN' ? account.rawType : ACCOUNT_TYPE_LABELS[account.accountType]
}

export function taxTreatmentLabel(account: AccountClassification): string | null {
  return TAX_TREATMENT_LABELS[account.taxTreatment]
}

/** e.g. "Roth IRA · Cash"; cash or margin is left out when SnapTrade does not know. */
export function accountSummary(account: AccountClassification): string {
  const margin = account.cashOrMargin === 'CASH' ? 'Cash' : account.cashOrMargin === 'MARGIN' ? 'Margin' : null
  return [accountTypeLabel(account), margin].filter(Boolean).join(' · ')
}
