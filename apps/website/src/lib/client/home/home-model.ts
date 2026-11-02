import type { Bucket, EquityPoint } from '@/lib/client/trades/trades'
import { toNumber } from '@/lib/client/trades/trades-model'

/** Trading days are dated in New York, as the backend's statistics are. */
const MARKET_ZONE = 'America/New_York'

export type Period = 'today' | '1w' | '1m' | '3m' | '6m' | 'ytd' | '1y' | 'all'

export const DEFAULT_PERIOD: Period = '1m'

export const PERIODS: Array<{ value: Period; label: string; short: string; phrase: string }> = [
  { value: 'today', label: 'Today', short: '1D', phrase: 'today' },
  { value: '1w', label: 'Past week', short: '1W', phrase: 'past week' },
  { value: '1m', label: 'Past month', short: '1M', phrase: 'past month' },
  { value: '3m', label: 'Past 3 months', short: '3M', phrase: 'past 3 months' },
  { value: '6m', label: 'Past 6 months', short: '6M', phrase: 'past 6 months' },
  { value: 'ytd', label: 'Year to date', short: 'YTD', phrase: 'year to date' },
  { value: '1y', label: 'Past year', short: '1Y', phrase: 'past year' },
  { value: 'all', label: 'All history', short: 'Max', phrase: 'all time' },
]

export function isPeriod(value: unknown): value is Period {
  return PERIODS.some((period) => period.value === value)
}

/** The New York calendar date of an instant, as `YYYY-MM-DD`. */
export function marketDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MARKET_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

/** The instant New York's day `YYYY-MM-DD` begins, as an ISO string. */
export function marketMidnight(day: string): string {
  // 05:00 UTC is just after New York midnight and before a 2 a.m. clock change, so its offset is midnight's.
  const offset = new Intl.DateTimeFormat('en-US', { timeZone: MARKET_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${day}T05:00:00Z`))
    .find((part) => part.type === 'timeZoneName')?.value
  const match = offset?.match(/GMT([+-]\d{2}):(\d{2})/)
  return new Date(`${day}T00:00:00${match ? `${match[1]}:${match[2]}` : 'Z'}`).toISOString()
}

function parts(day: string): [number, number, number] {
  const [year, month, date] = day.split('-').map(Number)
  return [year, month, date]
}

function isoDay(year: number, month: number, date: number): string {
  return new Date(Date.UTC(year, month - 1, date)).toISOString().slice(0, 10)
}

export function shiftDays(day: string, days: number): string {
  const [year, month, date] = parts(day)
  return isoDay(year, month, date + days)
}

/** The same date `months` earlier, clamped to the end of a shorter month. */
function monthsBefore(day: string, months: number): string {
  const [year, month, date] = parts(day)
  const last = new Date(Date.UTC(year, month - months, 0)).getUTCDate()
  return isoDay(year, month - months, Math.min(date, last))
}

const SINCE: Record<Exclude<Period, 'all'>, (today: string) => string> = {
  today: (today) => today,
  '1w': (today) => shiftDays(today, -6),
  '1m': (today) => shiftDays(monthsBefore(today, 1), 1),
  '3m': (today) => shiftDays(monthsBefore(today, 3), 1),
  '6m': (today) => shiftDays(monthsBefore(today, 6), 1),
  ytd: (today) => `${today.slice(0, 4)}-01-01`,
  '1y': (today) => shiftDays(monthsBefore(today, 12), 1),
}

export interface PeriodRange {
  /** Start of the window, or null for all history. */
  from: string | null
  /** e.g. "past month". */
  phrase: string
}

/** A window of whole New York trading days ending today. */
export function periodRange(period: Period, now: Date = new Date()): PeriodRange {
  const phrase = PERIODS.find((option) => option.value === period)?.phrase ?? 'selected range'
  if (period === 'all') return { from: null, phrase }
  return { from: marketMidnight(SINCE[period](marketDate(now))), phrase }
}

export interface Outcomes {
  trades: number
  wins: number
  breakeven: number
  losses: number
  net: number
}

/** Wins over decided trades, in percent; null when nothing won or lost. */
export function winRate(outcomes: Pick<Outcomes, 'wins' | 'losses'>): number | null {
  const decided = outcomes.wins + outcomes.losses
  return decided ? (outcomes.wins / decided) * 100 : null
}

function outcomesOf(point: EquityPoint | undefined): Outcomes {
  if (!point) return { trades: 0, wins: 0, breakeven: 0, losses: 0, net: 0 }
  return {
    trades: point.trades,
    wins: point.wins,
    losses: point.losses,
    breakeven: point.trades - point.wins - point.losses,
    net: toNumber(point.net) ?? 0,
  }
}

function sum(all: Outcomes[]): Outcomes {
  return all.reduce(
    (total, next) => ({
      trades: total.trades + next.trades,
      wins: total.wins + next.wins,
      breakeven: total.breakeven + next.breakeven,
      losses: total.losses + next.losses,
      net: total.net + next.net,
    }),
    { trades: 0, wins: 0, breakeven: 0, losses: 0, net: 0 },
  )
}

export interface CalendarDay extends Outcomes {
  day: string
  date: number
  inMonth: boolean
  isToday: boolean
}

export interface CalendarWeek extends Outcomes {
  index: number
  /** Seven days, Sunday first, including days of the neighbouring months. */
  days: CalendarDay[]
  /** Days of the shown month with a closed trade. */
  tradingDays: number
}

export interface CalendarMonth extends Outcomes {
  weeks: CalendarWeek[]
  tradingDays: number
  best: CalendarDay | null
}

/** A month (`YYYY-MM`) of daily results in whole Sunday-to-Saturday weeks. */
export function calendarMonth(month: string, equity: EquityPoint[], today: string): CalendarMonth {
  const [year, monthNumber] = month.split('-').map(Number)
  const byDay = new Map(equity.map((point) => [point.day, point]))
  const first = `${month}-01`
  const last = isoDay(year, monthNumber + 1, 0)
  const start = shiftDays(first, -new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay())
  const weeks: CalendarWeek[] = []
  for (let cursor = start, index = 1; cursor <= last; index++) {
    const days: CalendarDay[] = []
    for (let slot = 0; slot < 7; slot++, cursor = shiftDays(cursor, 1)) {
      const inMonth = cursor.slice(0, 7) === month
      days.push({
        ...(inMonth ? outcomesOf(byDay.get(cursor)) : outcomesOf(undefined)),
        day: cursor,
        date: parts(cursor)[2],
        inMonth,
        isToday: cursor === today,
      })
    }
    weeks.push({ ...sum(days), index, days, tradingDays: days.filter((day) => day.trades > 0).length })
  }
  const traded = weeks.flatMap((week) => week.days).filter((day) => day.trades > 0)
  const best = traded.reduce<CalendarDay | null>((top, day) => (!top || day.net > top.net ? day : top), null)
  return { ...sum(traded), weeks, tradingDays: traded.length, best }
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return isoDay(year, monthNumber + delta, 1).slice(0, 7)
}

export interface DrawdownPoint {
  day: string
  /** How far cumulative P&L sits below its running peak; zero or negative. */
  drawdown: number
}

/** Drawdown from the running peak, which starts at zero before the first trade. */
export function drawdownSeries(equity: EquityPoint[]): { points: DrawdownPoint[]; peak: number } {
  let peak = 0
  const points = equity.map((point) => {
    const cumulative = toNumber(point.cumulative) ?? 0
    peak = Math.max(peak, cumulative)
    return { day: point.day, drawdown: cumulative - peak }
  })
  return { points, peak }
}

export interface Standout extends Outcomes {
  key: string
}

/** The best and worst entries by net P&L; the worst is left out when there is only one. */
export function bestAndWorst(entries: Standout[]): { best: Standout | null; worst: Standout | null } {
  if (entries.length === 0) return { best: null, worst: null }
  const sorted = [...entries].sort((a, b) => b.net - a.net)
  return { best: sorted[0], worst: sorted.length > 1 ? sorted[sorted.length - 1] : null }
}

export function symbolStandouts(buckets: Bucket[]): Standout[] {
  return buckets.map((bucket) => ({
    key: bucket.key,
    trades: bucket.trades,
    wins: bucket.wins,
    losses: bucket.losses,
    breakeven: bucket.trades - bucket.wins - bucket.losses,
    net: toNumber(bucket.net) ?? 0,
  }))
}

export function dayStandouts(equity: EquityPoint[]): Standout[] {
  return equity.filter((point) => point.trades > 0).map((point) => ({ key: point.day, ...outcomesOf(point) }))
}

/** A `YYYY-MM-DD` trading day for display, e.g. "Aug 14", "Aug 14, 2026" or "Friday, August 14". */
export function dayLabel(day: string, style: 'short' | 'year' | 'long' = 'short'): string {
  const options: Record<typeof style, Intl.DateTimeFormatOptions> = {
    short: { month: 'short', day: 'numeric', timeZone: 'UTC' },
    year: { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
    long: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' },
  }
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', options[style])
}

export function monthLabel(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
