import { GraphQLRequestError } from '@/lib/client/api'
import { createNoteDocument, type NoteDocument } from './note-document'

/** Decimals arrive as strings so no precision is lost; parse only to display. */
export type Decimal = string

export interface OptionDetail {
  underlying: string
  expiry: string
  right: 'call' | 'put'
  strike: Decimal
  multiplier: Decimal
}

export interface TradeIssue {
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
  instrumentKey: string | null
  fillKey: string | null
  tradeId: string | null
}

export type LabelKind = 'EDGE' | 'ENTRY_TACTIC' | 'TAG' | 'MISTAKE'

/** A journal label as it appears on a trade or in a statistic. */
export interface LabelRef {
  id: string
  kind: LabelKind
  name: string
  color: string | null
  archived: boolean
}

export type MarketRegime = 'TRENDING' | 'CHOPPY' | 'RANGING' | 'VOLATILE'

export const MARKET_REGIMES: Array<{ value: MarketRegime; label: string }> = [
  { value: 'TRENDING', label: 'Trending' },
  { value: 'CHOPPY', label: 'Choppy' },
  { value: 'RANGING', label: 'Ranging' },
  { value: 'VOLATILE', label: 'Volatile' },
]

/** How the trader felt and behaved on a trade. Null means not recorded, not "no". */
export interface TradeBehavior {
  /** 1 to 5. */
  conviction: number | null
  marketRegime: MarketRegime | null
  plannedPreMarket: boolean | null
  revengeTrade: boolean | null
  brokeThirtyMinuteRule: boolean | null
  /** 1 to 5. */
  ruleAdherence: number | null
}

export const EMPTY_BEHAVIOR: TradeBehavior = {
  conviction: null,
  marketRegime: null,
  plannedPreMarket: null,
  revengeTrade: null,
  brokeThirtyMinuteRule: null,
  ruleAdherence: null,
}

export function hasBehavior(behavior: TradeBehavior): boolean {
  return Object.values(behavior).some((value) => value !== null)
}

/** Short chips for what was recorded; a "no" that is the good habit is left out. */
export function behaviorChips(behavior: TradeBehavior): string[] {
  const regime = MARKET_REGIMES.find((option) => option.value === behavior.marketRegime)
  return [
    behavior.conviction !== null && `Conviction ${behavior.conviction}/5`,
    behavior.ruleAdherence !== null && `Rules ${behavior.ruleAdherence}/5`,
    regime?.label,
    behavior.plannedPreMarket === true && 'Planned pre-market',
    behavior.plannedPreMarket === false && 'Unplanned',
    behavior.revengeTrade === true && 'Revenge trade',
    behavior.brokeThirtyMinuteRule === true && 'Broke 30-minute rule',
  ].filter((chip): chip is string => typeof chip === 'string')
}

export interface TradeAnnotation {
  id: string
  tradeId: string
  notes: NoteDocument
  edges: LabelRef[]
  entryTactics: LabelRef[]
  tags: LabelRef[]
  mistakes: LabelRef[]
  initialStop: Decimal | null
  plannedRisk: Decimal | null
  behavior: TradeBehavior
  version: number
  updatedAt: string
  orphaned: boolean
}

export type TradeStatus = 'open' | 'closed' | 'incomplete'

export interface TradeSummary {
  id: string
  kind: 'single' | 'strategy'
  workspaceId: string
  parentId: string | null
  children: string[]
  instrumentKey: string
  assetClass: 'stock' | 'option' | 'crypto'
  symbol: string
  underlying: string
  option: OptionDetail | null
  direction: 'long' | 'short' | null
  status: TradeStatus
  openedAt: string
  closedAt: string | null
  maxQuantity: Decimal
  openQuantity: Decimal
  avgEntry: Decimal | null
  avgExit: Decimal | null
  gross: Decimal
  fees: Decimal
  net: Decimal | null
  income: Decimal
  returnPct: Decimal | null
  holdingSeconds: number | null
  fillCount: number
  nonEconomic: boolean
  related: string[]
  strategyLabel: string | null
  issues: TradeIssue[]
  annotation: TradeAnnotation | null
  rMultiple: Decimal | null
  mark: Decimal | null
  unrealized: Decimal | null
}

export function toNumber(value: Decimal | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function money(value: Decimal | null | undefined, options: { signed?: boolean } = {}): string {
  const number = toNumber(value)
  if (number === null) return '—'
  const text = Math.abs(number).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  if (number < 0) return `−${text}`
  return options.signed && number > 0 ? `+${text}` : text
}

/** Compact for axes and tiles: $1.2K, −$340. */
export function compactMoney(value: number): string {
  const text = Math.abs(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: Math.abs(value) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: Math.abs(value) >= 1000 ? 1 : 0,
  })
  return value < 0 ? `−${text}` : text
}

export function quantity(value: Decimal | null | undefined): string {
  const number = toNumber(value)
  return number === null ? '—' : number.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export function price(value: Decimal | null | undefined): string {
  const number = toNumber(value)
  if (number === null) return '—'
  return number.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(number) < 1 ? 4 : 2,
  })
}

export function percent(value: Decimal | null | undefined, options: { ratio?: boolean } = {}): string {
  const number = toNumber(value)
  if (number === null) return '—'
  const scaled = options.ratio ? number * 100 : number
  return `${scaled > 0 && !options.ratio ? '+' : ''}${scaled.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
}

export function rMultiple(value: Decimal | null | undefined): string {
  const number = toNumber(value)
  return number === null ? '—' : `${number > 0 ? '+' : ''}${number.toFixed(2)}R`
}

export type Tone = 'gain' | 'loss' | 'flat'

export function tone(value: Decimal | null | undefined): Tone {
  const number = toNumber(value)
  if (number === null || number === 0) return 'flat'
  return number > 0 ? 'gain' : 'loss'
}

export const TONE_CLASS: Record<Tone, string> = {
  gain: 'text-emerald-700 dark:text-emerald-400',
  loss: 'text-destructive',
  flat: '',
}

export function holdTime(seconds: number | null): string {
  if (seconds === null) return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  return hours % 24 && days < 7 ? `${days}d ${hours % 24}h` : `${days}d`
}

/** e.g. "IONQ 8 May 2026 $37 put" for an option, the ticker otherwise. */
export function instrumentLabel(trade: Pick<TradeSummary, 'symbol' | 'option' | 'kind' | 'strategyLabel' | 'underlying'>): string {
  if (trade.kind === 'strategy') return `${trade.underlying} ${trade.strategyLabel ?? 'strategy'}`
  if (!trade.option) return trade.symbol
  const expiry = new Date(`${trade.option.expiry}T00:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const mini = trade.option.multiplier === '10' ? ' mini' : ''
  return `${trade.option.underlying} ${expiry} $${Number(trade.option.strike)} ${trade.option.right}${mini}`
}

export function directionLabel(direction: TradeSummary['direction']): string {
  return direction === 'long' ? 'Long' : direction === 'short' ? 'Short' : 'Strategy'
}

export const STATUS_LABEL: Record<TradeStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  incomplete: 'Missing history',
}

const DECISION_MESSAGES: Record<string, string> = {
  needs_two_trades: 'Choose at least two trades.',
  duplicate_trade: 'A trade was chosen twice.',
  wrong_workspace: 'Those trades are in another workspace.',
  trade_already_regrouped: 'One of those trades was already merged or split. Refresh and try again.',
  trade_missing: 'One of those trades no longer exists. Refresh and try again.',
  trades_not_compatible: 'Only trades on the same instrument and in the same direction can be merged.',
  trade_not_splittable: 'This trade cannot be split.',
  fill_missing: 'That fill is no longer in the trade. Refresh and try again.',
  split_at_first_fill: 'Choose a later entry to split at; the first fill starts the trade.',
  split_not_at_entry: 'A trade can only be split at a fill that added to the position.',
  legs_not_compatible: 'Legs of a strategy must share an underlying and not already be in a strategy.',
}

const ERROR_MESSAGES: Record<string, string> = {
  CONFLICT: 'This changed on another device. Reload to see the latest, then try again.',
  NOT_FOUND: 'That trade is no longer here. It may have been regrouped.',
  SESSION_REQUIRED: 'Sign in on the web to change trades.',
  LABEL_EXISTS: 'A label with that name already exists.',
}

export function tradeErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof GraphQLRequestError)) return fallback
  if (error.code === 'DECISION_REJECTED') return DECISION_MESSAGES[error.message] ?? fallback
  if (error.code && ERROR_MESSAGES[error.code]) return ERROR_MESSAGES[error.code]
  // Validation codes carry a message written for people.
  return error.code && /^[A-Z_]+$/.test(error.code) && error.message ? error.message : fallback
}

export function decisionMessage(code: string | null): string {
  return (code && DECISION_MESSAGES[code]) ?? 'That change no longer applies.'
}

/** Issues the user can act on name the action; the rest are informational. */
export function issueAction(issue: Pick<TradeIssue, 'code'>): 'opening-position' | null {
  return ['missing_opening_history', 'position_mismatch', 'transfer_in_without_cost'].includes(issue.code)
    ? 'opening-position'
    : null
}

export const ISSUE_TITLE: Record<string, string> = {
  missing_opening_history: 'Opening missing from history',
  position_mismatch: 'Position differs from your brokerage',
  transfer_in_without_cost: 'Transferred in without a cost',
  dust_residual: 'Leftover fraction closed',
  possible_option_wash_sale: 'Possible wash sale through options',
  assignment_stock_leg_derived: 'Stock leg added for an assignment',
  amount_mismatch: 'Amount differs from quantity × price',
  unknown_activity_type: 'Activity Tradstry does not recognise',
  fills_before_opening_ignored: 'Fills before your opening position were left out',
}

export function issueTitle(code: string): string {
  return ISSUE_TITLE[code] ?? code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

export interface AnnotationDraft {
  notes: NoteDocument
  edgeIds: string[]
  entryTacticIds: string[]
  tagIds: string[]
  mistakeIds: string[]
  initialStop: string
  plannedRisk: string
  behavior: TradeBehavior
}

export function annotationDraft(annotation: TradeAnnotation | null): AnnotationDraft {
  return {
    notes: annotation?.notes ?? createNoteDocument(),
    edgeIds: annotation?.edges.map((e) => e.id) ?? [],
    entryTacticIds: annotation?.entryTactics.map((t) => t.id) ?? [],
    tagIds: annotation?.tags.map((t) => t.id) ?? [],
    mistakeIds: annotation?.mistakes.map((m) => m.id) ?? [],
    initialStop: annotation?.initialStop ?? '',
    plannedRisk: annotation?.plannedRisk ?? '',
    behavior: annotation?.behavior ?? EMPTY_BEHAVIOR,
  }
}

/** The GraphQL input for a journal entry, or the first problem with it. */
export function annotationInput(
  draft: AnnotationDraft,
): { ok: true; input: Record<string, unknown> } | { ok: false; message: string } {
  const amount = (value: string) => (value.trim() === '' ? null : value.trim())
  const stop = amount(draft.initialStop)
  const risk = amount(draft.plannedRisk.replace(/[$,]/g, ''))
  if (stop !== null && !(Number(stop) > 0)) return { ok: false, message: 'The initial stop must be a price above zero.' }
  if (risk !== null && !(Number(risk) > 0)) return { ok: false, message: 'Planned risk must be a dollar amount above zero.' }
  return {
    ok: true,
    input: {
      notes: draft.notes,
      edgeIds: draft.edgeIds,
      entryTacticIds: draft.entryTacticIds,
      tagIds: draft.tagIds,
      mistakeIds: draft.mistakeIds,
      initialStop: stop,
      plannedRisk: risk,
      behavior: draft.behavior,
    },
  }
}

/**
 * Dollars at risk, as the backend computes it: the planned risk when given,
 * otherwise |avg entry − stop| × size × multiplier.
 */
export function riskDollars(
  trade: Pick<TradeSummary, 'avgEntry' | 'maxQuantity' | 'option'>,
  draft: Pick<AnnotationDraft, 'initialStop' | 'plannedRisk'>,
): number | null {
  const planned = toNumber(draft.plannedRisk.replace(/[$,]/g, ''))
  if (planned !== null) return planned > 0 ? planned : null
  const stop = toNumber(draft.initialStop)
  const entry = toNumber(trade.avgEntry)
  const size = toNumber(trade.maxQuantity)
  if (stop === null || stop <= 0 || entry === null || size === null) return null
  const risk = Math.abs(entry - stop) * Math.abs(size) * (toNumber(trade.option?.multiplier) ?? 1)
  return risk > 0 ? risk : null
}

export function previewR(net: Decimal | null, risk: number | null): number | null {
  const value = toNumber(net)
  return risk === null || value === null ? null : value / risk
}

/** Label colours offered in the catalog, as stored (`#rrggbb`). */
export const LABEL_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#9333ea', '#0891b2', '#db2777', '#525252']

export interface FillForm {
  assetClass: 'STOCK' | 'OPTION' | 'CRYPTO'
  symbol: string
  expiry: string
  right: 'CALL' | 'PUT'
  strike: string
  side: 'BUY' | 'SELL'
  quantity: string
  price: string
  fee: string
  executedAt: string
  closing: boolean
}

const positive = (value: string) => value.trim() !== '' && Number(value) > 0
const nonNegative = (value: string) => value.trim() === '' || Number(value) >= 0

/** The GraphQL input for a manual fill, or the first problem with the form. */
export function fillInput(form: FillForm, now = new Date()): { ok: true; input: Record<string, unknown> } | { ok: false; message: string } {
  if (!/^[A-Za-z0-9.\-/]{1,24}$/.test(form.symbol.trim())) return { ok: false, message: 'Enter a ticker such as AAPL.' }
  if (!positive(form.quantity)) return { ok: false, message: 'Quantity must be above zero.' }
  if (form.price.trim() === '' || !nonNegative(form.price)) return { ok: false, message: 'Enter the price per share or contract.' }
  if (!nonNegative(form.fee)) return { ok: false, message: 'Fees cannot be negative.' }
  const executedAt = new Date(form.executedAt)
  if (Number.isNaN(executedAt.getTime())) return { ok: false, message: 'Enter when the fill happened.' }
  if (executedAt.getTime() > now.getTime() + 5 * 60_000) return { ok: false, message: 'A fill cannot be in the future.' }
  const instrument: Record<string, unknown> = { assetClass: form.assetClass, symbol: form.symbol.trim().toUpperCase() }
  if (form.assetClass === 'OPTION') {
    if (!form.expiry) return { ok: false, message: 'Enter the option’s expiry.' }
    if (!positive(form.strike)) return { ok: false, message: 'Enter the option’s strike.' }
    Object.assign(instrument, { expiry: form.expiry, right: form.right, strike: form.strike.trim() })
  }
  return {
    ok: true,
    input: {
      instrument,
      side: form.side,
      quantity: form.quantity.trim(),
      price: form.price.trim(),
      fee: form.fee.trim() || '0',
      intent: form.closing ? 'CLOSE' : null,
      executedAt: executedAt.toISOString(),
    },
  }
}

/** A manual fill's ID from its fill key (`manual:{id}`). */
export function manualFillId(fillKey: string): string | null {
  return fillKey.startsWith('manual:') ? fillKey.slice('manual:'.length) : null
}

export const FILL_ROLE_LABEL: Record<string, string> = {
  open: 'Open',
  add: 'Add',
  reduce: 'Trim',
  close: 'Close',
  flip_close: 'Close (flip)',
  flip_open: 'Open (flip)',
  expire: 'Expired',
  assign: 'Assigned',
  exercise: 'Exercised',
  split: 'Split',
  stock_dividend: 'Stock dividend',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  orphan: 'No opening',
}

/** An ISO time as a `datetime-local` value in the browser's zone. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export interface OpeningForm {
  assetClass: FillForm['assetClass']
  symbol: string
  expiry: string
  right: FillForm['right']
  strike: string
  direction: 'LONG' | 'SHORT'
  quantity: string
  costPerUnit: string
  acquiredOn: string
  asOf: string
}

/** The GraphQL input for an opening position, or the first problem. */
export function openingInput(form: OpeningForm): { ok: true; input: Record<string, unknown> } | { ok: false; message: string } {
  if (!/^[A-Za-z0-9.\-/]{1,24}$/.test(form.symbol.trim())) return { ok: false, message: 'Enter a ticker such as AAPL.' }
  if (!positive(form.quantity)) return { ok: false, message: 'Quantity must be above zero.' }
  if (form.costPerUnit.trim() === '' || !nonNegative(form.costPerUnit)) return { ok: false, message: 'Enter the average cost.' }
  if (!form.acquiredOn || !form.asOf) return { ok: false, message: 'Enter both dates.' }
  if (form.acquiredOn > form.asOf) return { ok: false, message: 'It must be acquired on or before the date it was held.' }
  const instrument: Record<string, unknown> = { assetClass: form.assetClass, symbol: form.symbol.trim().toUpperCase() }
  if (form.assetClass === 'OPTION') {
    if (!form.expiry || !positive(form.strike)) return { ok: false, message: 'Enter the option’s expiry and strike.' }
    Object.assign(instrument, { expiry: form.expiry, right: form.right, strike: form.strike.trim() })
  }
  const quantity = form.quantity.trim()
  return {
    ok: true,
    input: {
      instrument,
      quantity: form.direction === 'SHORT' ? `-${quantity}` : quantity,
      costPerUnit: form.costPerUnit.trim(),
      acquiredAt: new Date(`${form.acquiredOn}T00:00:00`).toISOString(),
      asOf: new Date(`${form.asOf}T00:00:00`).toISOString(),
    },
  }
}

/** A symbol from an instrument key such as `stock:IRBT`. */
export function keySymbol(key: string | null): string {
  if (!key) return ''
  const [kind, symbol] = key.split(':')
  return kind === 'option' ? (symbol ?? '') : (symbol ?? key)
}

/** Round axis ticks (1, 2 or 5 × 10ⁿ apart) covering min..max and zero. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  const low = Math.min(min, 0)
  const high = Math.max(max, 0)
  if (low === high) return [0]
  const raw = (high - low) / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let tick = Math.floor(low / step) * step; tick <= high + step * 1e-9; tick += step) {
    ticks.push(Math.round(tick / step) * step)
  }
  if (ticks[ticks.length - 1] < high) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}
