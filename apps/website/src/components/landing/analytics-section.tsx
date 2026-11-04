import { BarChart } from '@/components/analytics/bar-chart'
import { AreaChart, ReadoutRow } from '@/components/home/area-chart'
import { DEMO_CALENDAR, DEMO_EDGE_BARS, DEMO_EQUITY, DEMO_MISTAKES, DEMO_NET } from '@/components/landing/demo-data'
import { Panel, Screen, Section, SectionHeading } from '@/components/landing/section'
import { toneClass, usd } from '@/components/landing/tone'
import { dayLabel } from '@/lib/client/home/home-model'
import { compactMoney } from '@/lib/client/trades/trades-model'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

function dayTint(pnl: number | null, largest: number) {
  if (pnl === null || pnl === 0) return 'bg-muted text-muted-foreground'
  const strength = Math.abs(pnl) / largest
  if (pnl > 0) return strength > 0.6 ? 'bg-emerald-500/45' : strength > 0.3 ? 'bg-emerald-500/25' : 'bg-emerald-500/12'
  return strength > 0.6 ? 'bg-rose-500/40' : strength > 0.3 ? 'bg-rose-500/22' : 'bg-rose-500/12'
}

function TradingMonth() {
  const firstWeekday = (new Date(`${DEMO_CALENDAR[0].day}T12:00:00Z`).getUTCDay() + 6) % 7
  const largest = Math.max(...DEMO_CALENDAR.map((day) => Math.abs(day.pnl ?? 0)))
  return (
    <div>
      <div className="grid grid-cols-5 gap-1.5 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <ol className="mt-2 grid grid-cols-5 gap-1.5" aria-label="Daily P&L in October">
        {Array.from({ length: firstWeekday }, (_, index) => (
          <li key={`blank-${index}`} aria-hidden="true" />
        ))}
        {DEMO_CALENDAR.map(({ day, pnl }) => (
          <li
            key={day}
            className={cn('flex aspect-[4/3] flex-col justify-between rounded-lg p-1.5 text-left', dayTint(pnl, largest))}
          >
            <span className="text-[11px] text-muted-foreground">{Number(day.slice(8))}</span>
            <span className="truncate text-[11px] font-medium tabular-nums">
              {pnl === null ? '' : `${pnl > 0 ? '+' : ''}${compactMoney(pnl)}`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function AnalyticsSection() {
  const totalMistakes = DEMO_MISTAKES.reduce((sum, mistake) => sum + mistake.cost, 0)
  const worst = Math.max(...DEMO_MISTAKES.map((mistake) => Math.abs(mistake.cost)))
  return (
    <Section id="analytics">
      <SectionHeading title="Know what's actually working.">
        Win rate, expectancy, profit factor and drawdown for any period. Break your results down by edge, symbol, time of
        day or mistake, and see what each habit costs you.
      </SectionHeading>

      <div className="mt-14 grid gap-4 lg:grid-cols-5">
        <Panel title="Your equity curve" className="lg:col-span-3">
          <Screen>
            <div className="flex items-baseline justify-between">
              <p className="text-sm text-muted-foreground">Last 3 months</p>
              <p className={cn('text-xl font-semibold tabular-nums', toneClass(DEMO_NET))}>
                {usd(DEMO_NET, { signed: true })}
              </p>
            </div>
            <AreaChart
              points={DEMO_EQUITY}
              tone="gain"
              height={220}
              label="Cumulative P&L over three months"
              readout={(index) => (
                <ReadoutRow label={dayLabel(DEMO_EQUITY[index].day)} value={usd(DEMO_EQUITY[index].value, { signed: true })} />
              )}
            />
          </Screen>
        </Panel>

        <Panel title="Every day at a glance" className="lg:col-span-2">
          <Screen>
            <p className="mb-3 text-sm text-muted-foreground">October</p>
            <TradingMonth />
          </Screen>
        </Panel>

        <Panel title="P&L by edge" className="lg:col-span-3">
          <Screen>
            <BarChart
              bars={DEMO_EDGE_BARS}
              height={220}
              label="Net P&L for each edge: opening range and pullbacks earn the most, late-day fades lose the most"
              tick={compactMoney}
              readout={(index) => (
                <ReadoutRow label={DEMO_EDGE_BARS[index].label} value={usd(DEMO_EDGE_BARS[index].value, { signed: true })} />
              )}
            />
          </Screen>
        </Panel>

        <Panel title="What your mistakes cost" className="lg:col-span-2">
          <Screen>
            <ul className="space-y-4">
              {DEMO_MISTAKES.map((mistake) => (
                <li key={mistake.label}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{mistake.label}</span>
                    <span className="text-rose-600 tabular-nums dark:text-rose-400">{usd(mistake.cost)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-rose-500/70"
                      style={{ width: `${(Math.abs(mistake.cost) / worst) * 100}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{mistake.trades} trades</p>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-border pt-4 text-sm text-muted-foreground">
              Together they cost <span className="font-medium text-foreground">{usd(totalMistakes)}</span> this
              quarter.
            </p>
          </Screen>
        </Panel>
      </div>
    </Section>
  )
}
