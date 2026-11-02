import { type Decimal, type TradeSummary, money, price, toNumber } from '@/lib/client/trades/trades-model'

export type PlanAssetClass = 'STOCK' | 'OPTION'
export type PlanDirection = 'LONG' | 'SHORT'
export type PlanStatus = 'OPEN' | 'LINKED' | 'SKIPPED'
export type RiskMode = 'DOLLARS' | 'PERCENT'

/** One planned entry and the size its share of the risk buys. */
export interface PlanTranche {
  percent: Decimal
  entry: Decimal
  quantity: Decimal
  risk: Decimal
}

export interface TradePlan {
  id: string
  workspaceId: string
  assetClass: PlanAssetClass
  /** The ticker; the underlying for an option. */
  symbol: string
  direction: PlanDirection
  /** The size-weighted average entry. */
  entry: Decimal
  stop: Decimal
  target: Decimal | null
  risk: Decimal
  quantity: Decimal
  tranches: PlanTranche[]
  roundUp: boolean
  actualRisk: Decimal | null
  cost: Decimal | null
  note: string
  status: PlanStatus
  tradeId: string | null
  createdAt: string
  updatedAt: string
}

/** A workspace's calculator rule and the balance percent risk is sized from. */
export interface PlanningRule {
  /** The brokerage snapshot when there is one, else the typed balance. */
  balance: Decimal | null
  source: 'BROKERAGE' | 'MANUAL' | null
  asOf: string | null
  linked: boolean
  manualBalance: Decimal | null
  riskPercent: Decimal | null
  maxStopPercent: Decimal | null
}

export interface TrancheDraft {
  id: string
  /** Percent of the plan's risk. */
  percent: string
  entry: string
}

export interface PlanForm {
  assetClass: PlanAssetClass
  symbol: string
  direction: PlanDirection
  /** The calculator edits the first entry only; a plan can add more. */
  tranches: TrancheDraft[]
  stop: string
  target: string
  riskMode: RiskMode
  /** Dollars, or percent of the balance. */
  risk: string
  /** Round each entry's size up, risking a little more than chosen. */
  roundUp: boolean
  note: string
}

export const MAX_TRANCHES = 10

const MULTIPLIER: Record<PlanAssetClass, number> = { STOCK: 1, OPTION: 100 }
const UNIT: Record<PlanAssetClass, [one: string, many: string]> = {
  STOCK: ['share', 'shares'],
  OPTION: ['contract', 'contracts'],
}

export function multiplierOf(assetClass: PlanAssetClass): number {
  return MULTIPLIER[assetClass]
}

export function unitLabel(assetClass: PlanAssetClass, quantity: number): string {
  return UNIT[assetClass][quantity === 1 ? 0 : 1]
}

export function newTranche(entry = '', percent = ''): TrancheDraft {
  return { id: crypto.randomUUID(), percent, entry }
}

/** A blank form that risks the rule's percent when there is one, else the default dollar risk. */
export function emptyPlanForm(defaultRisk: Decimal | null, riskPercent: Decimal | null = null): PlanForm {
  return {
    assetClass: 'STOCK',
    symbol: '',
    direction: 'LONG',
    tranches: [newTranche('', '100')],
    stop: '',
    target: '',
    riskMode: riskPercent ? 'PERCENT' : 'DOLLARS',
    risk: riskPercent ?? defaultRisk ?? '',
    roundUp: false,
    note: '',
  }
}

export function planForm(plan: TradePlan): PlanForm {
  return {
    assetClass: plan.assetClass,
    symbol: plan.symbol,
    direction: plan.direction,
    tranches: plan.tranches.length
      ? plan.tranches.map((tranche) => newTranche(tranche.entry, tranche.percent))
      : [newTranche(plan.entry, '100')],
    stop: plan.stop,
    target: plan.target ?? '',
    riskMode: 'DOLLARS',
    risk: plan.risk,
    roundUp: plan.roundUp,
    note: plan.note,
  }
}

/** The last entry takes whatever percent the others leave, so the total stays 100 without hand-balancing. */
export function rebalanceLast(tranches: TrancheDraft[]): TrancheDraft[] {
  if (tranches.length === 0) return tranches
  if (tranches.length === 1) return [{ ...tranches[0], percent: '100' }]
  const others = tranches.slice(0, -1)
  const used = others.reduce((sum, tranche) => sum + (Number(tranche.percent) || 0), 0)
  const remainder = Math.max(0, Math.round((100 - used) * 100) / 100)
  return [...others, { ...tranches[tranches.length - 1], percent: String(remainder) }]
}

/** Editing any entry's percent but the last rebalances the last; editing the last is left as typed. */
export function updateTranche(tranches: TrancheDraft[], id: string, change: Partial<Omit<TrancheDraft, 'id'>>): TrancheDraft[] {
  const next = tranches.map((tranche) => (tranche.id === id ? { ...tranche, ...change } : tranche))
  const isLast = tranches[tranches.length - 1]?.id === id
  return change.percent !== undefined && !isLast ? rebalanceLast(next) : next
}

function amount(value: string): number | null {
  const cleaned = value.replace(/[$,%\s]/g, '')
  if (cleaned === '') return null
  const number = Number(cleaned)
  return Number.isFinite(number) ? number : Number.NaN
}

/** The risk in dollars, rounded to cents; percent needs a balance. */
export function riskInDollars(form: Pick<PlanForm, 'risk' | 'riskMode'>, balance: number | null): number | null {
  const value = amount(form.risk)
  if (value === null || Number.isNaN(value)) return null
  if (form.riskMode === 'DOLLARS') return value
  return balance === null ? null : Math.round(balance * value) / 100
}

/** Rounds to a whole size, down or up, forgiving float noise such as 0.3 / 0.1 = 2.9999999999999996. */
function roundSize(value: number, up: boolean): number {
  return up ? Math.ceil(value - 1e-6) : Math.floor(value + 1e-6)
}

function entries(form: Pick<PlanForm, 'tranches'>): Array<number | null> {
  return form.tranches.map((tranche) => amount(tranche.entry))
}

/** The stop on the wrong side of an entry, or null. */
export function stopProblem(form: Pick<PlanForm, 'tranches' | 'stop' | 'direction'>): string | null {
  const stop = amount(form.stop)
  if (stop === null || Number.isNaN(stop)) return null
  const long = form.direction === 'LONG'
  const wrong = entries(form).some((entry) => entry !== null && !Number.isNaN(entry) && (long ? stop >= entry : stop <= entry))
  if (!wrong) return null
  const which = form.tranches.length === 1 ? 'the entry' : 'every entry'
  return `For a ${long ? 'long' : 'short'}, the stop must be ${long ? 'below' : 'above'} ${which}.`
}

/** "133 shares", "4 contracts". */
export function formatSize(quantity: number, assetClass: PlanAssetClass): string {
  return `${quantity.toLocaleString()} ${unitLabel(assetClass, quantity)}`
}

export interface TrancheSizing {
  id: string
  percent: number
  entry: number
  /** Dollars lost per share, contract or coin at the stop. */
  riskPerUnit: number
  exactQuantity: number
  quantity: number
  risk: number
}

export type Sizing =
  | {
      ok: true
      riskDollars: number
      tranches: TrancheSizing[]
      /** Before rounding. */
      exactQuantity: number
      quantity: number
      /** The size-weighted average entry. */
      entry: number
      actualRisk: number
      cost: number
      /** Reward over risk at the target, from the average entry. */
      rewardRisk: number | null
      /** Stop distance as a percent of the average entry. */
      stopPercent: number
      /** Position cost as a percent of the balance, when there is one. */
      accountPercent: number | null
      overBalance: boolean
    }
  | { ok: false; message: string | null }

/**
 * Each entry sized so its loss at the stop is its share of the risk, as the
 * backend computes it. `message` is null while the form is still incomplete.
 */
export function sizePlan(form: PlanForm, balance: number | null): Sizing {
  const prices = entries(form)
  const percents = form.tranches.map((tranche) => amount(tranche.percent))
  const stop = amount(form.stop)
  const target = amount(form.target)
  const riskValue = amount(form.risk)
  if ([...prices, ...percents, stop, target, riskValue].some((v) => Number.isNaN(v))) {
    return { ok: false, message: 'Enter numbers only.' }
  }
  if (prices.some((p) => p === null) || stop === null || riskValue === null) return { ok: false, message: null }
  const entryPrices = prices as number[]
  const long = form.direction === 'LONG'
  if (entryPrices.some((p) => p <= 0) || stop < 0) {
    return { ok: false, message: 'Enter entries above zero and a stop of zero or more.' }
  }
  if (percents.some((p) => p === null || p <= 0)) return { ok: false, message: 'Give every entry a share of the risk above 0%.' }
  const totalPercent = (percents as number[]).reduce((sum, p) => sum + p, 0)
  if (Math.abs(totalPercent - 100) > 0.001) {
    return { ok: false, message: `The entries’ shares of the risk must add up to 100% (now ${Math.round(totalPercent * 100) / 100}%).` }
  }
  const wrongSide = stopProblem(form)
  if (wrongSide) return { ok: false, message: wrongSide }
  if (target !== null && (target <= 0 || entryPrices.some((p) => (long ? target <= p : target >= p)))) {
    const which = form.tranches.length === 1 ? 'the entry' : 'every entry'
    return { ok: false, message: `For a ${long ? 'long' : 'short'}, the target must be ${long ? 'above' : 'below'} ${which}.` }
  }
  if (form.riskMode === 'PERCENT' && balance === null) return { ok: false, message: 'Add your account balance to risk a percent of it.' }
  if (form.riskMode === 'PERCENT' && (riskValue <= 0 || riskValue > 100)) {
    return { ok: false, message: 'Risk a percent between 0 and 100.' }
  }
  const riskDollars = riskInDollars(form, balance) ?? 0
  if (riskDollars <= 0) return { ok: false, message: 'Risk must be above zero.' }

  const multiplier = MULTIPLIER[form.assetClass]
  const tranches: TrancheSizing[] = form.tranches.map((tranche, index) => {
    const entry = entryPrices[index]
    const percent = percents[index] as number
    const riskPerUnit = Math.abs(entry - stop) * multiplier
    const exactQuantity = (riskDollars * percent) / 100 / riskPerUnit
    const quantity = roundSize(exactQuantity, form.roundUp)
    return { id: tranche.id, percent, entry, riskPerUnit, exactQuantity, quantity, risk: quantity * riskPerUnit }
  })
  if (tranches.some((tranche) => tranche.quantity <= 0)) {
    const what = tranches.length === 1 ? 'That risk' : 'An entry’s share of the risk'
    return {
      ok: false,
      message: `${what} is less than one ${unitLabel(form.assetClass, 1)} loses at this stop. Raise the risk, move the stop closer or round up.`,
    }
  }
  const quantity = tranches.reduce((sum, tranche) => sum + tranche.quantity, 0)
  const value = tranches.reduce((sum, tranche) => sum + tranche.quantity * tranche.entry, 0)
  const entry = value / quantity
  const cost = value * multiplier
  return {
    ok: true,
    riskDollars,
    tranches,
    exactQuantity: tranches.reduce((sum, tranche) => sum + tranche.exactQuantity, 0),
    quantity,
    entry,
    actualRisk: tranches.reduce((sum, tranche) => sum + tranche.risk, 0),
    cost,
    rewardRisk: target === null ? null : Math.abs(target - entry) / Math.abs(entry - stop),
    stopPercent: (Math.abs(entry - stop) / entry) * 100,
    accountPercent: balance === null || balance <= 0 ? null : (cost / balance) * 100,
    overBalance: balance !== null && cost > balance,
  }
}

/** The GraphQL input for a plan, or the first problem with it. */
export function planInput(
  form: PlanForm,
  balance: number | null,
): { ok: true; input: Record<string, unknown> } | { ok: false; message: string } {
  if (!form.symbol.trim()) return { ok: false, message: 'Enter a symbol.' }
  const sizing = sizePlan(form, balance)
  if (!sizing.ok) return { ok: false, message: sizing.message ?? 'Enter an entry, a stop and a risk.' }
  const clean = (value: string) => value.replace(/[$,%\s]/g, '')
  return {
    ok: true,
    input: {
      assetClass: form.assetClass,
      symbol: form.symbol.trim().toUpperCase(),
      direction: form.direction,
      tranches: form.tranches.map((tranche) => ({ percent: clean(tranche.percent), entry: clean(tranche.entry) })),
      stop: clean(form.stop),
      target: clean(form.target) || null,
      risk: sizing.riskDollars.toFixed(2),
      roundUp: form.roundUp,
      note: form.note.trim(),
    },
  }
}

/** Plans that could belong to the trade: not yet linked, same symbol and direction. */
export function matchingPlans(
  plans: TradePlan[],
  trade: Pick<TradeSummary, 'kind' | 'underlying' | 'direction'>,
): TradePlan[] {
  if (trade.kind !== 'single' || !trade.direction) return []
  const direction = trade.direction === 'long' ? 'LONG' : 'SHORT'
  return plans.filter(
    (plan) => plan.status !== 'LINKED' && plan.symbol === trade.underlying.toUpperCase() && plan.direction === direction,
  )
}

/** "40 shares long at $100.00, stop $95.00, risking $200.00". */
export function planSummary(plan: TradePlan): string {
  const quantity = toNumber(plan.quantity) ?? 0
  const entries = plan.tranches.length > 1 ? `across ${plan.tranches.length} entries averaging` : 'at'
  const parts = [
    `${formatSize(quantity, plan.assetClass)} ${plan.direction === 'LONG' ? 'long' : 'short'} ${entries} ${price(plan.entry)}`,
    `stop ${price(plan.stop)}`,
    plan.target ? `target ${price(plan.target)}` : null,
    `risking ${money(plan.risk)}`,
  ]
  return parts.filter(Boolean).join(', ')
}
