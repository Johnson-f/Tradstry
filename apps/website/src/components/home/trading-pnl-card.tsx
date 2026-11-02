import { AreaChart, ReadoutRow } from '@/components/home/area-chart'
import { DashboardCard, EmptyChart } from '@/components/home/dashboard-card'
import type { TradeStats } from '@/lib/client/analytics/stats'
import { money, toNumber } from '@/lib/client/trades/trades-model'

const plural = (count: number, singular: string, many: string) => `${count} ${count === 1 ? singular : many}`

/** Cumulative realized P&L across the range, with how the trades ended. */
export function TradingPnlCard({ stats, phrase, dimmed }: { stats: TradeStats; phrase: string; dimmed: boolean }) {
  const net = toNumber(stats.net) ?? 0
  const closed = plural(stats.trades, 'closed trade', 'closed trades')
  return (
    <DashboardCard
      title="Trading P&L"
      description="Realized profit and loss from closed trades in the selected range. Open trades are excluded."
      formula="Σ closed-trade proceeds − cost basis − fees"
      aside={phrase}
      dimmed={dimmed}
    >
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            role="img"
            aria-label={`Cumulative realized trading P&L for ${phrase}: ${money(stats.net)} from ${closed}.`}
            className={`text-3xl font-semibold tabular-nums ${net < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}
          >
            {money(stats.net)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Realized from {closed}</p>
        </div>
        <dl className="flex gap-4 text-xs tabular-nums">
          <div>
            <dt className="text-muted-foreground">Wins</dt>
            <dd className="mt-0.5 font-semibold text-emerald-600 dark:text-emerald-400">{stats.wins}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Breakeven</dt>
            <dd className="mt-0.5 font-semibold">{stats.breakeven}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Losses</dt>
            <dd className="mt-0.5 font-semibold text-rose-600 dark:text-rose-400">{stats.losses}</dd>
          </div>
        </dl>
      </div>
      {stats.equity.length === 0 ? (
        <EmptyChart>No trades closed during the {phrase}.</EmptyChart>
      ) : (
        <div className="mt-4">
          <AreaChart
            points={stats.equity.map((point) => ({ day: point.day, value: toNumber(point.cumulative) ?? 0 }))}
            tone={net < 0 ? 'loss' : 'gain'}
            height={250}
            label={`Cumulative realized P&L, ${phrase}`}
            readout={(index) => {
              const point = stats.equity[index]
              return (
                <>
                  <ReadoutRow label="Cumulative P&L" value={money(point.cumulative)} />
                  <ReadoutRow label="Daily P&L" value={money(point.net, { signed: true })} />
                  <ReadoutRow label="Closed trades" value={point.trades} />
                </>
              )
            }}
          />
        </div>
      )}
    </DashboardCard>
  )
}
