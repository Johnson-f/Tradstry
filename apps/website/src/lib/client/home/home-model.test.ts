import { describe, expect, test } from 'bun:test'
import type { Bucket, EquityPoint } from '@/lib/client/analytics/stats'
import {
  bestAndWorst,
  calendarMonth,
  dayLabel,
  dayStandouts,
  drawdownSeries,
  marketDate,
  marketMidnight,
  monthLabel,
  periodRange,
  shiftMonth,
  symbolStandouts,
  weekdayNames,
  winRate,
} from './home-model'

const point = (day: string, net: string, cumulative: string, trades = 1, wins = 0, losses = 0): EquityPoint => ({
  day,
  net,
  cumulative,
  trades,
  wins,
  losses,
})

describe('market days', () => {
  test('dates follow New York, not UTC', () => {
    expect(marketDate(new Date('2026-11-02T03:00:00Z'))).toBe('2026-11-01')
    expect(marketDate(new Date('2026-11-02T06:00:00Z'))).toBe('2026-11-02')
  })

  test('midnight carries the offset in force that day', () => {
    expect(marketMidnight('2026-07-01')).toBe('2026-07-01T04:00:00.000Z')
    expect(marketMidnight('2026-12-01')).toBe('2026-12-01T05:00:00.000Z')
    expect(marketMidnight('2026-11-01')).toBe('2026-11-01T04:00:00.000Z', 'still daylight time at midnight')
  })
})

describe('periodRange', () => {
  const now = new Date('2026-11-04T15:00:00Z')

  test('rolling windows end today, in whole New York days', () => {
    expect(periodRange('today', now)).toEqual({ from: marketMidnight('2026-11-04'), phrase: 'today' })
    expect(periodRange('1w', now).from).toBe(marketMidnight('2026-10-29'))
    expect(periodRange('1m', now)).toEqual({ from: marketMidnight('2026-10-05'), phrase: 'past month' })
    expect(periodRange('6m', now).from).toBe(marketMidnight('2026-05-05'))
    expect(periodRange('ytd', now).from).toBe(marketMidnight('2026-01-01'))
    expect(periodRange('1y', now).from).toBe(marketMidnight('2025-11-05'))
  })

  test('a month back from the 31st lands on the last day of a shorter month', () => {
    expect(periodRange('1m', new Date('2026-03-31T15:00:00Z')).from).toBe(marketMidnight('2026-03-01'))
  })

  test('all history has no start', () => {
    expect(periodRange('all', now)).toEqual({ from: null, phrase: 'all time' })
  })
})

describe('calendarMonth', () => {
  const equity = [
    point('2026-07-31', '50', '50', 1, 1, 0),
    point('2026-08-14', '-7.02', '42.98', 3, 1, 1),
    point('2026-08-17', '12.50', '55.48', 2, 2, 0),
  ]
  const month = calendarMonth('2026-08', equity, '2026-08-17')

  test('lays the month out in whole weeks from Sunday', () => {
    expect(month.weeks).toHaveLength(6)
    expect(month.weeks[0].days[0]).toMatchObject({ day: '2026-07-26', inMonth: false })
    expect(month.weeks[0].days[6]).toMatchObject({ day: '2026-08-01', inMonth: true, date: 1 })
    expect(month.weeks[5].days[1]).toMatchObject({ day: '2026-08-31', inMonth: true })
    expect(month.weeks[5].days[2].inMonth).toBe(false)
  })

  test('days outside the month carry no results', () => {
    expect(month.weeks[0].days[5]).toMatchObject({ day: '2026-07-31', trades: 0, net: 0 })
  })

  test('days, weeks and the month total their outcomes', () => {
    const friday = month.weeks[2].days[5]
    expect(friday).toMatchObject({ day: '2026-08-14', trades: 3, wins: 1, breakeven: 1, losses: 1, net: -7.02 })
    expect(month.weeks[2]).toMatchObject({ index: 3, trades: 3, tradingDays: 1 })
    expect(month.weeks[3].days[1]).toMatchObject({ day: '2026-08-17', isToday: true })
    expect(month).toMatchObject({ trades: 5, wins: 3, losses: 1, breakeven: 1, tradingDays: 2 })
    expect(month.net).toBeCloseTo(5.48)
    expect(month.best?.day).toBe('2026-08-17')
    expect(winRate(month)).toBe(75)
  })

  test('weeks can start on Monday', () => {
    const monday = calendarMonth('2026-08', equity, '2026-08-17', 'MONDAY')
    expect(monday.weeks[0].days[0]).toMatchObject({ day: '2026-07-27', inMonth: false })
    expect(monday.weeks[0].days[5]).toMatchObject({ day: '2026-08-01', inMonth: true })
    expect(monday.weeks.flatMap((w) => w.days).filter((d) => d.inMonth)).toHaveLength(31)
    expect(weekdayNames('MONDAY')).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(weekdayNames('SUNDAY')[0]).toBe('Sun')
  })

  test('months move across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })
})

test('drawdown measures the fall from the running peak, starting at zero', () => {
  const { points, peak } = drawdownSeries([
    point('2026-08-03', '-10', '-10'),
    point('2026-08-04', '40', '30'),
    point('2026-08-05', '-12', '18'),
  ])
  expect(points.map((p) => p.drawdown)).toEqual([-10, 0, -12])
  expect(peak).toBe(30)
})

describe('standouts', () => {
  const bucket = (key: string, net: string, trades: number, wins: number, losses: number): Bucket => ({
    key, net, trades, wins, losses, labelId: null, color: null, winRate: null, expectancy: null, expectancyR: null,
  })

  test('best and worst symbols by net P&L', () => {
    const { best, worst } = bestAndWorst(
      symbolStandouts([bucket('AAPL', '40', 3, 2, 1), bucket('TSLA', '-25', 2, 0, 2), bucket('NVDA', '5', 1, 1, 0)]),
    )
    expect(best).toMatchObject({ key: 'AAPL', net: 40, trades: 3 })
    expect(worst).toMatchObject({ key: 'TSLA', net: -25, losses: 2 })
  })

  test('one entry has no worst; days without trades are skipped', () => {
    const days = dayStandouts([point('2026-08-03', '9', '9', 1, 1, 0), point('2026-08-04', '0', '9', 0)])
    expect(bestAndWorst(days)).toEqual({
      best: { key: '2026-08-03', trades: 1, wins: 1, breakeven: 0, losses: 0, net: 9 },
      worst: null,
    })
    expect(bestAndWorst([])).toEqual({ best: null, worst: null })
  })

  test('win rate leaves breakevens out', () => {
    expect(winRate({ wins: 1, losses: 3 })).toBe(25)
    expect(winRate({ wins: 0, losses: 0 })).toBeNull()
  })
})

test('labels', () => {
  expect(dayLabel('2026-08-14')).toBe('Aug 14')
  expect(dayLabel('2026-08-14', 'year')).toBe('Aug 14, 2026')
  expect(dayLabel('2026-08-14', 'long')).toBe('Friday, August 14, 2026')
  expect(monthLabel('2026-08')).toBe('August 2026')
})
