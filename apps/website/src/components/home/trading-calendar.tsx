import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Fragment, useState } from 'react'
import { DashboardCard, DashboardCardSkeleton } from '@/components/home/dashboard-card'
import { Button } from '@/components/ui/button'
import {
  type CalendarDay,
  type CalendarWeek,
  type Outcomes as OutcomeCounts,
  type FirstWeekday,
  calendarMonth,
  dayLabel,
  monthLabel,
  shiftMonth,
  weekdayNames,
  winRate,
} from '@/lib/client/home/home-model'
import type { EquityPoint } from '@/lib/client/analytics/stats'
import { money } from '@/lib/client/trades/trades-model'

const headClass = 'border-b px-2 pb-2 text-center text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase'

const pnl = (value: number) => money(String(value), { signed: true })
const percent = (value: number | null) => (value === null ? '—' : `${value.toFixed(2)}%`)

function Outcomes({ outcomes }: { outcomes: OutcomeCounts }) {
  return (
    <span className="flex items-center gap-2 text-[9px] font-semibold tabular-nums">
      <span className="text-emerald-600 dark:text-emerald-400">{outcomes.wins}W</span>
      <span className="text-sky-600 dark:text-sky-400">{outcomes.breakeven}B</span>
      <span className="text-rose-600 dark:text-rose-400">{outcomes.losses}L</span>
    </span>
  )
}

function SummaryMetric({ label, value, tone = 0 }: { label: string; value: string; tone?: number }) {
  return (
    <div className="min-w-0 border-l pl-3 first:border-l-0 first:pl-0 md:pl-4">
      <p className="text-[9px] font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p
        className={`mt-1 truncate text-sm font-semibold tabular-nums ${tone > 0 ? 'text-emerald-600 dark:text-emerald-400' : tone < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}
      >
        {value}
      </p>
    </div>
  )
}

function DayCell({ day, largest, workspaceId }: { day: CalendarDay; largest: number; workspaceId: string }) {
  const traded = day.trades > 0
  const positive = day.net >= 0
  const strength = traded ? Math.max(0.12, Math.min(1, Math.abs(day.net) / largest)) : 0
  const background = traded
    ? `rgba(${positive ? '16, 185, 129' : '244, 63, 94'}, ${0.04 + strength * 0.11})`
    : undefined
  const className = `relative block min-h-24 overflow-hidden rounded-xl border p-2.5 text-left ${
    day.inMonth ? 'bg-background' : 'bg-muted/15 text-muted-foreground/45'
  } ${traded ? 'outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/40' : ''}`
  const content = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span
          className={`flex size-6 items-center justify-center rounded-full text-[11px] font-semibold ${day.isToday ? 'bg-foreground text-background' : ''}`}
        >
          {day.date}
        </span>
        {traded && (
          <span className="rounded-full bg-background/75 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground shadow-sm">
            {day.trades} {day.trades === 1 ? 'trade' : 'trades'}
          </span>
        )}
      </span>
      {traded && (
        <span className="mt-3 block">
          <span
            className={`block font-mono text-sm font-semibold tabular-nums ${positive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}
          >
            {pnl(day.net)}
          </span>
          <span className="mt-2 flex items-center justify-between gap-2">
            <Outcomes outcomes={day} />
            <span className="text-[9px] text-muted-foreground tabular-nums">{percent(winRate(day))}</span>
          </span>
        </span>
      )}
    </>
  )
  if (!traded) return <div className={className}>{content}</div>
  const label = `Open trades closed on ${dayLabel(day.day, 'long')}: ${pnl(day.net)}, ${day.trades} ${day.trades === 1 ? 'trade' : 'trades'}, ${percent(winRate(day))} win rate`
  return (
    <Link
      to="/w/$workspaceId/journal"
      params={{ workspaceId }}
      search={{ closedFrom: day.day, closedTo: day.day }}
      aria-label={label}
      title={label}
      className={className}
      style={{ backgroundColor: background }}
    >
      {content}
    </Link>
  )
}

function WeekRail({ week }: { week: CalendarWeek }) {
  if (week.trades === 0) {
    return (
      <div className="flex min-h-24 flex-col justify-between rounded-xl border bg-muted/10 p-2.5">
        <p className="text-[9px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Week {week.index}</p>
        <p className="text-[9px] text-muted-foreground/70">No activity</p>
      </div>
    )
  }
  return (
    <div className="flex min-h-24 flex-col justify-between rounded-xl border bg-muted/20 p-2.5">
      <div>
        <p className="text-[9px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Week {week.index}</p>
        <p
          className={`mt-2 font-mono text-sm font-semibold tabular-nums ${week.net > 0 ? 'text-emerald-600 dark:text-emerald-400' : week.net < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}
        >
          {pnl(week.net)}
        </p>
      </div>
      <div>
        <Outcomes outcomes={week} />
        <p className="mt-1 text-[9px] text-muted-foreground">
          {week.tradingDays} active {week.tradingDays === 1 ? 'day' : 'days'}
        </p>
      </div>
    </div>
  )
}

/** Daily realized P&L for one month, by New York trading date, with weekly totals. */
export function TradingCalendar({
  equity,
  today,
  loading,
  workspaceId,
  firstWeekday,
}: {
  equity: EquityPoint[] | undefined
  today: string
  loading: boolean
  workspaceId: string
  firstWeekday: FirstWeekday
}) {
  const [month, setMonth] = useState(() => today.slice(0, 7))
  if (loading || !equity) return <DashboardCardSkeleton height="h-[32rem]" />

  const view = calendarMonth(month, equity, today, firstWeekday)
  const largest = Math.max(1, ...view.weeks.flatMap((week) => week.days).map((day) => Math.abs(day.net)))

  return (
    <DashboardCard
      title="Trading Calendar"
      description="Daily realized P&L from closed trades, grouped by the New York trading date each position closed."
      formula="Daily P&L = Σ closed-trade proceeds − cost basis − fees"
      className="md:p-5"
    >
      <div className="mt-2 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft aria-hidden />
          </Button>
          <p className="min-w-40 text-center text-xl font-semibold" aria-live="polite">
            {monthLabel(month)}
          </p>
          <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMonth(today.slice(0, 7))}>
            Today
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 xl:min-w-[34rem]">
          <SummaryMetric label="Net P&L" value={pnl(view.net)} tone={view.net} />
          <SummaryMetric label="Win rate" value={`${percent(winRate(view))} win rate`} />
          <SummaryMetric label="Activity" value={`${view.tradingDays} active ${view.tradingDays === 1 ? 'day' : 'days'}`} />
          <SummaryMetric
            label="Best day"
            value={view.best ? `${dayLabel(view.best.day)} · ${pnl(view.best.net)}` : 'No closed trades'}
            tone={view.best && view.best.net > 0 ? 1 : 0}
          />
        </div>
      </div>

      {view.trades === 0 && (
        <div className="mt-4 rounded-xl border border-dashed bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
          No trades closed this month. Choose another month or sync your brokerage.
        </div>
      )}

      <div className="mt-5 min-w-0 overflow-x-auto overscroll-x-contain">
        <div className="grid min-w-[54rem] grid-cols-[repeat(7,minmax(0,1fr))_7.5rem] gap-2 pb-3">
          {weekdayNames(firstWeekday).map((weekday) => (
            <div key={weekday} className={headClass}>
              {weekday}
            </div>
          ))}
          <div className={headClass}>Week</div>
          {view.weeks.map((week) => (
            <Fragment key={week.index}>
              {week.days.map((day) => (
                <DayCell key={day.day} day={day} largest={largest} workspaceId={workspaceId} />
              ))}
              <WeekRail week={week} />
            </Fragment>
          ))}
        </div>
      </div>
    </DashboardCard>
  )
}
