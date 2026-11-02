import { AreaChart, ReadoutRow } from '@/components/home/area-chart'
import { DashboardCard, EmptyChart } from '@/components/home/dashboard-card'
import { drawdownSeries } from '@/lib/client/home/home-model'
import type { TradeStats } from '@/lib/client/analytics/stats'
import { money, toNumber } from '@/lib/client/trades/trades-model'

function streakLabel(streak: number): string {
  if (streak > 0) return `${streak}-win streak`
  if (streak < 0) return `${Math.abs(streak)}-loss streak`
  return 'No active streak'
}

function RiskStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/70 px-3 py-2.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  )
}

/** How far P&L sits below its high in the range, and how losses cluster. */
export function RiskRecoveryCard({ stats, phrase, dimmed }: { stats: TradeStats; phrase: string; dimmed: boolean }) {
  const current = toNumber(stats.currentDrawdown) ?? 0
  const atPeak = current <= 0.005
  const status = atPeak ? 'At range peak' : `${money(stats.currentDrawdown)} below peak`
  const { points, peak } = drawdownSeries(stats.equity)

  return (
    <DashboardCard
      title="Risk & Recovery"
      description="Shows how far realized P&L in the range has fallen from its previous high and how losses cluster into streaks."
      formula="Drawdown = running P&L peak − current cumulative P&L"
      aside={phrase}
      dimmed={dimmed}
      className="@container/risk"
    >
      <div className="mt-4 grid gap-3 @2xl/risk:grid-cols-[minmax(13rem,0.8fr)_minmax(0,2.2fr)]">
        <div className="rounded-xl bg-muted/30 px-4 py-3">
          <p
            role="img"
            aria-label={`Current drawdown status for ${phrase}: ${status}.`}
            className={`text-2xl font-semibold tabular-nums ${atPeak ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
          >
            {status}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {atPeak
              ? 'No recovery is currently required.'
              : `${money(stats.currentDrawdown)} of realized P&L is needed to recover the peak.`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 @xl/risk:grid-cols-4">
          <RiskStat label="Maximum drawdown" value={money(stats.maxDrawdown)} />
          <RiskStat label="Peak P&L" value={money(String(peak))} />
          <RiskStat label="Current streak" value={streakLabel(stats.currentStreak)} />
          <RiskStat label="Longest losing streak" value={String(stats.longestLossStreak)} />
        </div>
      </div>
      {points.length <= 1 ? (
        <EmptyChart className="h-24">Close more trades to build a drawdown history.</EmptyChart>
      ) : (
        <div className="mt-3">
          <AreaChart
            points={points.map((point) => ({ day: point.day, value: point.drawdown }))}
            tone="loss"
            height={180}
            label={`Drawdown from peak, ${phrase}`}
            readout={(index) => (
              <ReadoutRow label="Drawdown from peak" value={money(String(Math.abs(points[index].drawdown)))} />
            )}
          />
        </div>
      )}
    </DashboardCard>
  )
}
