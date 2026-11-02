import { Stat } from '@/components/analytics/analytics-bits'
import { AreaChart, ReadoutRow } from '@/components/home/area-chart'
import { DashboardCard, EmptyChart } from '@/components/home/dashboard-card'
import { Pnl } from '@/components/trades/trade-bits'
import type { TradeStats } from '@/lib/client/analytics/stats'
import { drawdownSeries } from '@/lib/client/home/home-model'
import { holdTime, money, percent, rMultiple, toNumber } from '@/lib/client/trades/trades-model'

const fixed = (value: string | null) => (value === null ? '—' : Number(value).toFixed(2))

/** The headline numbers, then how the equity curve and drawdown moved. */
export function OverviewTab({ stats, phrase }: { stats: TradeStats; phrase: string }) {
  const net = toNumber(stats.net) ?? 0
  const { points: drawdown } = drawdownSeries(stats.equity)
  return (
    <div className="flex flex-col gap-4">
      <DashboardCard
        title="Performance"
        description="Results of trades closed in the selected range. Win rate leaves breakeven trades out."
        formula="Expectancy = net P&L ÷ trades; profit factor = gross profit ÷ |gross loss|"
        aside={phrase}
      >
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label="Net P&L" value={<Pnl value={stats.net} signed={false} />} detail={`${stats.trades} closed trades`} />
          <Stat
            label="Win rate"
            value={percent(stats.winRate, { ratio: true })}
            detail={`${stats.wins} won · ${stats.breakeven} even · ${stats.losses} lost`}
          />
          <Stat label="Profit factor" value={fixed(stats.profitFactor)} />
          <Stat
            label="Expectancy"
            value={<Pnl value={stats.expectancy} />}
            detail={stats.rTrades ? `${rMultiple(stats.expectancyR)} average R` : 'No defined risk'}
          />
          <Stat
            label="Average win"
            value={money(stats.averageWin)}
            detail={stats.averageWinPct === null ? undefined : `${percent(stats.averageWinPct)} average return`}
          />
          <Stat
            label="Average loss"
            value={money(stats.averageLoss)}
            detail={stats.averageLossPct === null ? undefined : `${percent(stats.averageLossPct)} average return`}
          />
          <Stat label="Largest win" value={<Pnl value={stats.largestWin} />} />
          <Stat label="Largest loss" value={<Pnl value={stats.largestLoss} />} />
          <Stat
            label="Average hold"
            value={holdTime(stats.averageHoldSeconds)}
            detail={`Winners ${holdTime(stats.averageWinHoldSeconds)} · losers ${holdTime(stats.averageLossHoldSeconds)}`}
          />
          <Stat label="Max drawdown" value={money(stats.maxDrawdown)} detail={`${money(stats.currentDrawdown)} now`} />
          <Stat label="Recovery factor" value={fixed(stats.recoveryFactor)} detail="Net P&L ÷ max drawdown" />
          <Stat label="SQN" value={fixed(stats.sqn)} detail={`From ${stats.rTrades} trades with a stop`} />
        </div>
      </DashboardCard>

      <div className="grid items-stretch gap-4 @4xl/main:grid-cols-2">
        <DashboardCard
          title="Equity curve"
          description="Cumulative realized P&L, day by day, for trades closed in the range."
          formula="Running Σ daily closed-trade P&L"
          aside={phrase}
        >
          {stats.equity.length === 0 ? (
            <EmptyChart>No trades closed in the {phrase}.</EmptyChart>
          ) : (
            <div className="mt-4">
              <AreaChart
                points={stats.equity.map((point) => ({ day: point.day, value: toNumber(point.cumulative) ?? 0 }))}
                tone={net < 0 ? 'loss' : 'gain'}
                height={240}
                label={`Equity curve, ${phrase}`}
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
        <DashboardCard
          title="Drawdown"
          description="How far cumulative P&L sat below its running high each day."
          formula="Drawdown = running P&L peak − cumulative P&L"
          aside={phrase}
        >
          {drawdown.length <= 1 ? (
            <EmptyChart>Close more trades to build a drawdown history.</EmptyChart>
          ) : (
            <div className="mt-4">
              <AreaChart
                points={drawdown.map((point) => ({ day: point.day, value: point.drawdown }))}
                tone="loss"
                height={240}
                label={`Drawdown from peak, ${phrase}`}
                readout={(index) => (
                  <ReadoutRow label="Below peak" value={money(String(Math.abs(drawdown[index].drawdown)))} />
                )}
              />
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}
