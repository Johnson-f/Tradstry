import { describe, expect, test } from 'bun:test'
import {
  type PlanForm,
  type TradePlan,
  emptyPlanForm,
  matchingPlans,
  newTranche,
  planForm,
  planInput,
  planSummary,
  rebalanceLast,
  riskInDollars,
  sizePlan,
  updateTranche,
} from './plan-model'

const form = (change: Partial<PlanForm> & { entry?: string }): PlanForm => {
  const { entry, ...rest } = change
  const base = { ...emptyPlanForm('200'), symbol: 'aapl', ...rest }
  return entry === undefined ? base : { ...base, tranches: [newTranche(entry, '100')] }
}

const ladder = (...entries: Array<[percent: string, entry: string]>) => entries.map(([percent, entry]) => newTranche(entry, percent))

describe('sizing', () => {
  test('rounds down so the loss at the stop stays within the risk', () => {
    expect(sizePlan(form({ entry: '50', stop: '48.5' }), null)).toMatchObject({
      ok: true,
      riskDollars: 200,
      exactQuantity: 133.33333333333334,
      quantity: 133,
      entry: 50,
      actualRisk: 199.5,
      cost: 6650,
      rewardRisk: null,
      stopPercent: 3,
      accountPercent: null,
      overBalance: false,
    })
  })

  test('rounding up takes the next share and risks a little more', () => {
    expect(sizePlan(form({ entry: '50', stop: '48.5', roundUp: true }), null)).toMatchObject({ quantity: 134, actualRisk: 201 })
    expect(sizePlan(form({ assetClass: 'OPTION', entry: '5', stop: '1', risk: '100', roundUp: true }), null)).toMatchObject({
      ok: true,
      quantity: 1,
    })
  })

  test('options are contracts of 100, and a short’s stop sits above the entry', () => {
    const option = sizePlan(form({ assetClass: 'OPTION', entry: '2.40', stop: '1.20', risk: '500' }), null)
    expect(option).toMatchObject({ ok: true, quantity: 4, cost: 960 })
    const short = sizePlan(form({ direction: 'SHORT', entry: '50', stop: '51.5', risk: '100' }), null)
    expect(short).toMatchObject({ ok: true, quantity: 66 })
  })

  test('float noise does not cost a share', () => {
    expect(sizePlan(form({ entry: '0.3', stop: '0.2', risk: '0.3' }), null)).toMatchObject({ ok: true, quantity: 3 })
  })

  test('entries split the risk and weight the average entry, as the backend does', () => {
    const sizing = sizePlan(form({ tranches: ladder(['50', '100'], ['50', '98']), stop: '95' }), null)
    if (!sizing.ok) throw new Error(sizing.message ?? 'incomplete')
    expect(sizing.tranches.map((t) => [t.quantity, t.risk])).toEqual([
      [20, 100],
      [33, 99],
    ])
    expect(sizing.quantity).toBe(53)
    expect(sizing.entry.toFixed(4)).toBe('98.7547')
    expect(sizePlan(form({ tranches: ladder(['60', '100'], ['30', '98']), stop: '95' }), null)).toEqual({
      ok: false,
      message: 'The entries’ shares of the risk must add up to 100% (now 90%).',
    })
    expect(sizePlan(form({ tranches: ladder(['50', '100'], ['50', '94']), stop: '95' }), null)).toEqual({
      ok: false,
      message: 'For a long, the stop must be below every entry.',
    })
  })

  test('the last entry takes what the others leave', () => {
    const [a, b, c] = ladder(['100', '10'], ['', '9'], ['', '8'])
    expect(rebalanceLast([a, b]).map((t) => t.percent)).toEqual(['100', '0'])
    const split = updateTranche([a, b, c], a.id, { percent: '50' })
    expect(updateTranche(split, b.id, { percent: '30' }).map((t) => t.percent)).toEqual(['50', '30', '20'])
    expect(updateTranche(split, c.id, { percent: '70' }).map((t) => t.percent)).toEqual(['50', '', '70'])
    expect(rebalanceLast([a]).map((t) => t.percent)).toEqual(['100'])
  })

  test('a rule with a percent starts the form in percent mode', () => {
    expect(emptyPlanForm('200', '1')).toMatchObject({ riskMode: 'PERCENT', risk: '1' })
    expect(emptyPlanForm('200', null)).toMatchObject({ riskMode: 'DOLLARS', risk: '200' })
  })

  test('percent risk comes from the balance and flags a position it cannot pay for', () => {
    expect(riskInDollars({ riskMode: 'PERCENT', risk: '1' }, 25_000)).toBe(250)
    expect(sizePlan(form({ riskMode: 'PERCENT', risk: '1', entry: '100', stop: '99.5' }), 25_000)).toMatchObject({
      ok: true,
      quantity: 500,
      cost: 50_000,
      accountPercent: 200,
      overBalance: true,
    })
    expect(sizePlan(form({ riskMode: 'PERCENT', risk: '1', entry: '100', stop: '99' }), null)).toEqual({
      ok: false,
      message: 'Add your account balance to risk a percent of it.',
    })
  })

  test('reward to risk at the target, and stops or targets on the wrong side are refused', () => {
    expect(sizePlan(form({ entry: '100', stop: '95', target: '110' }), null)).toMatchObject({ rewardRisk: 2 })
    expect(sizePlan(form({ entry: '100', stop: '101' }), null)).toEqual({
      ok: false,
      message: 'For a long, the stop must be below the entry.',
    })
    expect(sizePlan(form({ direction: 'SHORT', entry: '100', stop: '105', target: '101' }), null)).toEqual({
      ok: false,
      message: 'For a short, the target must be below the entry.',
    })
    expect(sizePlan(form({ stop: '95' }), null)).toEqual({ ok: false, message: null })
  })

  test('the save input carries entries and dollars, never the percent of the balance', () => {
    expect(planInput(form({ riskMode: 'PERCENT', risk: '0.5', entry: '$1,000', stop: '990', roundUp: true }), 30_000)).toEqual({
      ok: true,
      input: {
        assetClass: 'STOCK',
        symbol: 'AAPL',
        direction: 'LONG',
        tranches: [{ percent: '100', entry: '1000' }],
        stop: '990',
        target: null,
        risk: '150.00',
        roundUp: true,
        note: '',
      },
    })
    expect(planInput(form({ symbol: ' ' }), null)).toEqual({ ok: false, message: 'Enter a symbol.' })
  })
})

const plan = (change: Partial<TradePlan>): TradePlan => ({
  id: 'p',
  workspaceId: 'w',
  assetClass: 'STOCK',
  symbol: 'AAPL',
  direction: 'LONG',
  entry: '100',
  stop: '95',
  target: null,
  risk: '200',
  quantity: '40',
  tranches: [{ percent: '100', entry: '100', quantity: '40', risk: '200.00' }],
  roundUp: false,
  actualRisk: '200.00',
  cost: '4000.00',
  note: '',
  status: 'OPEN',
  tradeId: null,
  createdAt: '',
  updatedAt: '',
  ...change,
})

test('plans match a single trade by symbol and direction until linked', () => {
  const plans = [
    plan({ id: 'open' }),
    plan({ id: 'skipped', status: 'SKIPPED' }),
    plan({ id: 'linked', status: 'LINKED', tradeId: 't' }),
    plan({ id: 'short', direction: 'SHORT' }),
    plan({ id: 'other', symbol: 'MSFT' }),
  ]
  const trade = { kind: 'single' as const, underlying: 'AAPL', direction: 'long' as const }
  expect(matchingPlans(plans, trade).map((p) => p.id)).toEqual(['open', 'skipped'])
  expect(matchingPlans(plans, { ...trade, kind: 'strategy' })).toEqual([])
})

test('plan summaries and edit forms carry every entry', () => {
  expect(planSummary(plan({ target: '110' }))).toBe('40 shares long at $100.00, stop $95.00, target $110.00, risking $200.00')
  const split = plan({
    entry: '98.7547',
    quantity: '53',
    roundUp: true,
    tranches: [
      { percent: '50', entry: '100', quantity: '20', risk: '100.00' },
      { percent: '50', entry: '98', quantity: '33', risk: '99.00' },
    ],
  })
  expect(planSummary(split)).toBe('53 shares long across 2 entries averaging $98.75, stop $95.00, risking $200.00')
  expect(planForm(split)).toMatchObject({
    roundUp: true,
    tranches: [
      { percent: '50', entry: '100' },
      { percent: '50', entry: '98' },
    ],
  })
})
