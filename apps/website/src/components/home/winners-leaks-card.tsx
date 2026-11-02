import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { DashboardCard } from '@/components/home/dashboard-card'
import { type Standout, bestAndWorst, dayLabel, dayStandouts, symbolStandouts, winRate } from '@/lib/client/home/home-model'
import type { TradeStats } from '@/lib/client/trades/trades'
import { money } from '@/lib/client/trades/trades-model'

type Kind = 'symbol' | 'day'

function Breakdown({
  title,
  kind,
  entry,
  workspaceId,
  rangeStart,
}: {
  title: string
  kind: Kind
  entry: Standout | null
  workspaceId: string
  rangeStart: string | null
}) {
  if (!entry) {
    return (
      <div className="rounded-xl border bg-background/70 px-4 py-3">
        <p className="text-[10px] font-medium text-muted-foreground">{title}</p>
        <p className="mt-3 text-sm text-muted-foreground">No closed trades</p>
      </div>
    )
  }
  const rate = winRate(entry)
  const name = kind === 'day' ? dayLabel(entry.key, 'year') : entry.key
  const search =
    kind === 'symbol'
      ? { symbol: entry.key, ...(rangeStart ? { closedFrom: rangeStart } : {}) }
      : { closedFrom: entry.key, closedTo: entry.key }
  return (
    <Link
      to="/w/$workspaceId/journal"
      params={{ workspaceId }}
      search={search}
      aria-label={`Open ${title.toLowerCase()} ${name} in the journal`}
      className="group rounded-xl border bg-background/70 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium text-muted-foreground">{title}</p>
        <ArrowUpRight
          className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{name}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {rate === null ? 'No decided trades' : `${rate.toFixed(2)}% win rate`} · {entry.trades}{' '}
            {entry.trades === 1 ? 'trade' : 'trades'}
          </p>
        </div>
        <p
          className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${entry.net < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}
        >
          {money(String(entry.net), { signed: true })}
        </p>
      </div>
      {entry.trades < 3 && (
        <span className="mt-2 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-400">
          Limited sample
        </span>
      )}
    </Link>
  )
}

/** The strongest and weakest symbols and days in the range, each opening its trades. */
export function WinnersLeaksCard({
  stats,
  phrase,
  dimmed,
  workspaceId,
  rangeStart,
}: {
  stats: TradeStats
  phrase: string
  dimmed: boolean
  workspaceId: string
  /** First trading day of the range, `YYYY-MM-DD`, or null for all history. */
  rangeStart: string | null
}) {
  const symbols = bestAndWorst(symbolStandouts(stats.bySymbol))
  const days = bestAndWorst(dayStandouts(stats.equity))
  const shared = { workspaceId, rangeStart }
  return (
    <DashboardCard
      title="Winners & Leaks"
      description="Ranks the strongest and weakest symbols and trading days among closed trades in the selected range."
      formula="Rank by net realized P&L; win rate excludes breakeven trades"
      aside={phrase}
      dimmed={dimmed}
      className="@container/winners h-full"
    >
      <div className="mt-4 grid gap-3 @md/winners:grid-cols-2">
        <Breakdown title="Best symbol" kind="symbol" entry={symbols.best} {...shared} />
        <Breakdown title="Worst symbol" kind="symbol" entry={symbols.worst} {...shared} />
        <Breakdown title="Best day" kind="day" entry={days.best} {...shared} />
        <Breakdown title="Worst day" kind="day" entry={days.worst} {...shared} />
      </div>
    </DashboardCard>
  )
}
