import { Calculator, ChartColumn, LayoutDashboard, NotebookPen } from 'lucide-react'
import { AreaChart, ReadoutRow } from '@/components/home/area-chart'
import { DEMO_EQUITY, DEMO_METRICS, DEMO_TRADES } from '@/components/landing/demo-data'
import { toneClass, usd } from '@/components/landing/tone'
import { dayLabel } from '@/lib/client/home/home-model'
import { cn } from '@/lib/utils'

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Journal', icon: NotebookPen, active: false },
  { label: 'Analytics', icon: ChartColumn, active: false },
  { label: 'Plans', icon: Calculator, active: false },
]

/** A still of the dashboard, drawn with the app's own chart and fictional numbers. */
export function AppPreview() {
  return (
    <div className="rounded-[28px] border border-border bg-neutral-100 p-2 shadow-[0_30px_80px_-40px_rgb(0_0_0/0.35)] dark:bg-neutral-800/60">
      <div className="flex overflow-hidden rounded-[22px] border border-border bg-background text-left">
        <aside className="hidden w-52 shrink-0 flex-col gap-1 border-r border-border p-3 md:flex" aria-hidden="true">
          <div className="mb-3 flex items-center gap-2 px-2 py-1">
            <img src="/favicon.svg" alt="" className="size-6 rounded-md" />
            <span className="text-sm font-semibold">Swing account</span>
          </div>
          {NAV.map(({ label, icon: Icon, active }) => (
            <div
              key={label}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground',
                active && 'bg-muted font-medium text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </div>
          ))}
          <div className="mt-auto rounded-xl bg-muted/70 p-3 text-xs">
            <p className="font-medium text-foreground">Brokerage linked</p>
            <p className="mt-0.5 text-muted-foreground">Synced 2 minutes ago</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-base font-semibold">Dashboard</p>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">Last 3 months</span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {DEMO_METRICS.map((metric) => (
              <div key={metric.label} className="rounded-xl bg-muted/60 px-3.5 py-3">
                <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                <dd
                  className={cn(
                    'mt-1 text-lg font-semibold tabular-nums',
                    metric.tone === 'gain' && 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-3 rounded-xl border border-border p-3 sm:p-4">
            <p className="text-sm font-medium">Trading P&L</p>
            <AreaChart
              points={DEMO_EQUITY}
              tone="gain"
              height={200}
              label="Cumulative P&L over the last three months, rising from zero"
              readout={(index) => (
                <ReadoutRow label={dayLabel(DEMO_EQUITY[index].day)} value={usd(DEMO_EQUITY[index].value, { signed: true })} />
              )}
            />
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">Recent trades</caption>
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Symbol</th>
                  <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Edge</th>
                  <th className="px-3 py-2 text-left font-medium">Opened</th>
                  <th className="px-3 py-2 text-right font-medium">Net</th>
                  <th className="px-3 py-2 text-right font-medium">R</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_TRADES.map((trade) => (
                  <tr key={`${trade.symbol}-${trade.opened}`} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="font-medium">{trade.symbol}</span>{' '}
                      <span className="text-xs text-muted-foreground">{trade.side}</span>
                    </td>
                    <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">{trade.edge}</td>
                    <td className="px-3 py-2 text-muted-foreground">{trade.opened}</td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', toneClass(trade.net))}>
                      {usd(trade.net, { signed: true })}
                    </td>
                    <td className={cn('px-3 py-2 text-right tabular-nums', toneClass(trade.r))}>
                      {trade.r > 0 ? '+' : ''}
                      {trade.r.toFixed(1)}R
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
