import { MetricHelp } from '@/components/home/dashboard-card'
import { Skeleton } from '@/components/ui/skeleton'
import type { TradeStats } from '@/lib/client/analytics/stats'
import { money, toNumber } from '@/lib/client/trades/trades-model'

const plural = (count: number, singular: string, many: string) => `${count} ${count === 1 ? singular : many}`

function MetricShell({
  title,
  description,
  formula,
  badge,
  children,
}: {
  title: string
  description: string
  formula: string
  badge?: number
  children: React.ReactNode
}) {
  return (
    <article className="min-h-36 min-w-0 bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <h2 className="text-xs font-medium">{title}</h2>
        <MetricHelp title={title} description={description} formula={formula} />
        {badge !== undefined && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground tabular-nums">
            {badge}
          </span>
        )}
      </div>
      {children}
    </article>
  )
}

function RiskReward({ value, trades }: { value: number | null; trades: number }) {
  if (value === null || trades === 0) {
    return (
      <div role="img" aria-label="Average risk-to-reward unavailable" className="mt-5">
        <p className="text-3xl font-semibold text-muted-foreground">—</p>
        <p className="mt-2 text-xs text-muted-foreground">No defined risk</p>
      </div>
    )
  }
  const formatted = `${value.toFixed(2)}R`
  return (
    <div role="img" aria-label={`Average risk-to-reward ${formatted}`} className="mt-5">
      <p className="text-3xl font-semibold tabular-nums">{formatted}</p>
      <p className="mt-2 text-xs text-muted-foreground">{plural(trades, 'risk-defined trade', 'risk-defined trades')}</p>
    </div>
  )
}

function ProfitFactor({ value }: { value: number | null }) {
  const profitShare = value === null || value <= 0 ? 0 : (value / (value + 1)) * 100
  const lossShare = value === null ? 0 : 100 - profitShare
  const label = value === null ? '-' : value.toFixed(2)
  return (
    <div role="img" aria-label={`Profit factor ${label}`} className="mt-4 flex items-center justify-between gap-4">
      <p className="text-3xl font-semibold tabular-nums">{label}</p>
      <svg viewBox="0 0 48 48" className="size-20 shrink-0 -rotate-90" aria-hidden>
        <circle cx="24" cy="24" r="18" pathLength="100" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
        {profitShare > 0 && (
          <circle
            cx="24"
            cy="24"
            r="18"
            pathLength="100"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeDasharray={`${profitShare} 100`}
            className="text-emerald-500"
          />
        )}
        {lossShare > 0 && (
          <circle
            cx="24"
            cy="24"
            r="18"
            pathLength="100"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeDasharray={`${lossShare} 100`}
            strokeDashoffset={-profitShare}
            className="text-rose-500"
          />
        )}
      </svg>
    </div>
  )
}

const ARC = 'M 15 58 A 45 45 0 0 1 105 58'

function WinRate({ rate, wins, breakevens, losses }: { rate: number | null; wins: number; breakevens: number; losses: number }) {
  const decided = wins + losses
  const winShare = decided ? (wins / decided) * 100 : 0
  const lossShare = decided ? (losses / decided) * 100 : 0
  const label = rate === null ? '-' : `${rate.toFixed(2)}%`
  return (
    <div
      role="img"
      aria-label={`Win rate: ${label}. ${plural(wins, 'win', 'wins')}, ${plural(breakevens, 'breakeven', 'breakevens')}, ${plural(losses, 'loss', 'losses')}.`}
      className="mt-3 grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2"
    >
      <p className="text-3xl font-semibold tabular-nums">{label}</p>
      <div>
        <svg viewBox="0 0 120 68" className="h-14 w-full overflow-visible" aria-hidden>
          <path d={ARC} pathLength="100" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted" />
          {winShare > 0 && (
            <path
              d={ARC}
              pathLength="100"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeDasharray={`${winShare} 100`}
              className="text-emerald-500"
            />
          )}
          {lossShare > 0 && (
            <path
              d={ARC}
              pathLength="100"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeDasharray={`${lossShare} 100`}
              strokeDashoffset={-winShare}
              className="text-rose-500"
            />
          )}
        </svg>
        <div className="-mt-1 grid grid-cols-3 gap-1 text-center text-[10px] font-medium tabular-nums">
          <span className="rounded-full bg-emerald-500/10 py-0.5 text-emerald-600 dark:text-emerald-400">{wins}</span>
          <span className="rounded-full bg-sky-500/10 py-0.5 text-sky-600 dark:text-sky-400">{breakevens}</span>
          <span className="rounded-full bg-rose-500/10 py-0.5 text-rose-600 dark:text-rose-400">{losses}</span>
        </div>
      </div>
    </div>
  )
}

function WinLoss({ averageWin, averageLoss }: { averageWin: number; averageLoss: number }) {
  const total = averageWin + averageLoss
  const winShare = total > 0 ? (averageWin / total) * 100 : 0
  const lossShare = total > 0 ? (averageLoss / total) * 100 : 0
  const ratio = averageLoss > 0 ? (averageWin / averageLoss).toFixed(2) : '-'
  return (
    <div
      role="img"
      aria-label={`Average win ${money(String(averageWin))}, average loss ${money(String(averageLoss))}, ratio ${ratio}`}
      className="mt-4 grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3"
    >
      <p className="text-3xl font-semibold tabular-nums">{ratio}</p>
      <div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
          <span className="h-full bg-emerald-500" style={{ width: `${winShare}%` }} />
          <span className="h-full bg-rose-500" style={{ width: `${lossShare}%` }} />
        </div>
        <div className="mt-2 flex justify-between gap-2 text-xs font-medium tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">{money(String(averageWin))}</span>
          <span className="text-rose-600 dark:text-rose-400">-{money(String(averageLoss))}</span>
        </div>
      </div>
    </div>
  )
}

/** The five headline numbers for the selected range. */
export function MetricsRow({
  stats,
  phrase,
  loading,
  dimmed,
}: {
  stats: TradeStats | undefined
  phrase: string
  loading: boolean
  dimmed: boolean
}) {
  if (loading || !stats) {
    return (
      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
        <span className="sr-only">Loading results</span>
        {['a', 'b', 'c', 'd', 'e'].map((key) => (
          <Skeleton key={key} className="h-36 rounded-2xl" />
        ))}
      </div>
    )
  }
  const net = toNumber(stats.net) ?? 0
  const winRate = toNumber(stats.winRate)
  return (
    <section aria-label="Results" className={`transition-opacity duration-200 ${dimmed ? 'opacity-60' : ''}`}>
      <div className="grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-5">
        <MetricShell
          title="Net P&L"
          description={`Net realized profit and loss from closed trades · ${phrase}.`}
          formula="Σ closed-trade proceeds − cost basis − fees"
          badge={stats.trades}
        >
          <p
            className={`mt-5 text-3xl font-semibold tabular-nums ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
          >
            {money(stats.net)}
          </p>
        </MetricShell>
        <MetricShell
          title="Average risk-to-reward"
          description="Average realized profit or loss per unit of planned risk, using closed trades with an initial stop or planned risk."
          formula="Mean(realized P&L ÷ planned risk) across risk-defined trades"
        >
          <RiskReward value={toNumber(stats.expectancyR)} trades={stats.rTrades} />
        </MetricShell>
        <MetricShell
          title="Profit factor"
          description="How much gross profit was generated for every dollar of gross loss."
          formula="Gross profit ÷ |gross loss|"
        >
          <ProfitFactor value={toNumber(stats.profitFactor)} />
        </MetricShell>
        <MetricShell
          title="Win Rate"
          description="Share of decisive closed trades that were profitable. Breakeven trades are excluded."
          formula="Wins ÷ (wins + losses) × 100"
        >
          <WinRate
            rate={winRate === null ? null : winRate * 100}
            wins={stats.wins}
            breakevens={stats.breakeven}
            losses={stats.losses}
          />
        </MetricShell>
        <MetricShell
          title="Avg win/loss trade"
          description="Compares the average dollar gain on winners with the average dollar loss on losers."
          formula="Average winning trade ÷ average losing trade"
        >
          <WinLoss
            averageWin={toNumber(stats.averageWin) ?? 0}
            averageLoss={Math.abs(toNumber(stats.averageLoss) ?? 0)}
          />
        </MetricShell>
      </div>
    </section>
  )
}
