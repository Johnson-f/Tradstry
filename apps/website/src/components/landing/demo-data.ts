import type { Bar } from '@/components/analytics/bar-chart'

// Fictional numbers for the landing page's product previews.

const DAILY_PNL = [
  420, -180, 610, 0, 240, -320, 880, 150, -90, 470, 310, -540, 220, 690, -150, 380, 0, 520, -260, 940, 130,
  -410, 360, 580, -120, 270, 740, -330, 190, 460, 85, -220, 640, 300, -170, 510, 230, -95, 720, 405,
]

function weekdaysFrom(start: string, count: number): string[] {
  const days: string[] = []
  const date = new Date(`${start}T12:00:00Z`)
  while (days.length < count) {
    const weekday = date.getUTCDay()
    if (weekday !== 0 && weekday !== 6) days.push(date.toISOString().slice(0, 10))
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return days
}

const DAYS = weekdaysFrom('2026-08-03', DAILY_PNL.length)

export const DEMO_DAILY = DAYS.map((day, index) => ({ day, pnl: DAILY_PNL[index] }))

export const DEMO_EQUITY = DAYS.map((day, index) => ({
  day,
  value: DAILY_PNL.slice(0, index + 1).reduce((sum, pnl) => sum + pnl, 0),
}))

export const DEMO_NET = DEMO_EQUITY[DEMO_EQUITY.length - 1].value

export const DEMO_METRICS = [
  { label: 'Net P&L', value: `+$${DEMO_NET.toLocaleString('en-US')}`, tone: 'gain' },
  { label: 'Win rate', value: '61%', tone: 'neutral' },
  { label: 'Expectancy', value: '+$96 / trade', tone: 'gain' },
  { label: 'Profit factor', value: '1.84', tone: 'neutral' },
] as const

export interface DemoTrade {
  symbol: string
  side: 'Long' | 'Short'
  opened: string
  net: number
  r: number
  edge: string
}

export const DEMO_TRADES: DemoTrade[] = [
  { symbol: 'NVDA', side: 'Long', opened: 'Sep 25', net: 1240, r: 2.1, edge: 'Opening range' },
  { symbol: 'TSLA', side: 'Short', opened: 'Sep 25', net: -380, r: -0.8, edge: 'Failed breakout' },
  { symbol: 'AMD', side: 'Long', opened: 'Sep 24', net: 978.05, r: 2.0, edge: 'Pullback' },
  { symbol: 'AAPL', side: 'Long', opened: 'Sep 23', net: 520, r: 1.1, edge: 'Pullback' },
  { symbol: 'META', side: 'Long', opened: 'Sep 23', net: -210, r: -0.5, edge: 'Opening range' },
]

/** The AMD trade from Sep 24, fill by fill. */
export const DEMO_FILLS = [
  { time: '9:41', action: 'Buy', quantity: 100, price: 118.42 },
  { time: '9:58', action: 'Buy', quantity: 50, price: 119.1 },
  { time: '11:12', action: 'Sell', quantity: 75, price: 124.3 },
  { time: '13:47', action: 'Sell', quantity: 75, price: 126.05 },
] as const

export const DEMO_EDGE_BARS: Bar[] = [
  { key: 'opening-range', label: 'Opening range', value: 3120, tone: 'gain' },
  { key: 'pullback', label: 'Pullback', value: 2480, tone: 'gain' },
  { key: 'vwap-reclaim', label: 'VWAP reclaim', value: 940, tone: 'gain' },
  { key: 'failed-breakout', label: 'Failed breakout', value: -620, tone: 'loss' },
  { key: 'late-day-fade', label: 'Late-day fade', value: -1310, tone: 'loss' },
]

export const DEMO_MISTAKES = [
  { label: 'Moved the stop', trades: 7, cost: -1840 },
  { label: 'Chased the entry', trades: 5, cost: -960 },
  { label: 'Sized up after a loss', trades: 3, cost: -720 },
] as const

/** October 2026, weekdays only: the P&L of each trading day, null for no trades. */
export const DEMO_CALENDAR = weekdaysFrom('2026-10-01', 22).map((day, index) => ({
  day,
  pnl: [420, -180, 610, null, 240, -320, 880, 150, -90, 470, 310, -540, 220, 690, null, 380, -150, 520, -260, 940, 130, 360][
    index
  ],
}))
