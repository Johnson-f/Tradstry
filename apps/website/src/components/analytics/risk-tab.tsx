import { EmptyNote, ResultsTable, Stat } from '@/components/analytics/analytics-bits'
import { BarChart } from '@/components/analytics/bar-chart'
import { ReadoutRow } from '@/components/home/area-chart'
import { DashboardCard } from '@/components/home/dashboard-card'
import type { TradeStats } from '@/lib/client/analytics/stats'
import { monthLabel } from '@/lib/client/home/home-model'
import { compactMoney, money, percent, rMultiple, toNumber } from '@/lib/client/trades/trades-model'

function streakLabel(streak: number): string {
  if (streak > 0) return `${streak} ${streak === 1 ? 'win' : 'wins'}`
  if (streak < 0) return `${-streak} ${streak === -1 ? 'loss' : 'losses'}`
  return 'None'
}

function shortMonth(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

/** How big wins and losses are in R, how losses cluster, and month-to-month consistency. */
export function RiskTab({ stats, phrase }: { stats: TradeStats; phrase: string }) {
  const withStop = stats.rTrades
  const months = stats.byMonth
  const greenMonths = months.filter((month) => (toNumber(month.net) ?? 0) > 0).length
  const ranked = [...months].sort((a, b) => (toNumber(b.net) ?? 0) - (toNumber(a.net) ?? 0))
  const best = ranked[0]
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : undefined

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 @4xl/main:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <DashboardCard
          title="R-multiples"
          description="How many trades ended in each range of R, using trades with an initial stop or planned risk."
          formula="R = net P&L ÷ planned risk"
          aside={phrase}
        >
          {withStop === 0 ? (
            <EmptyNote>
              No trade in this range has a stop. Add an initial stop or planned risk in a trade’s details to see R.
            </EmptyNote>
          ) : (
            <div className="mt-4">
              <BarChart
                bars={stats.rDistribution.map((range) => ({
                  key: range.key,
                  label: range.key.replace(' to ', '…').replace('Below ', '<').replace(' and above', '+'),
                  value: range.trades,
                  tone: range.key.startsWith('−') || range.key.startsWith('Below') ? 'loss' : 'gain',
                }))}
                height={220}
                label={`Trades by R-multiple, ${phrase}`}
                tick={(value) => String(value)}
                readout={(index) => {
                  const range = stats.rDistribution[index]
                  return (
                    <>
                      <p className="mb-1 font-medium">{range.key}</p>
                      <ReadoutRow label="Trades" value={range.trades} />
                      <ReadoutRow label="Net P&L" value={money(range.net, { signed: true })} />
                    </>
                  )
                }}
              />
            </div>
          )}
        </DashboardCard>
        <DashboardCard
          title="Risk"
          description="Average R, the system quality number, and how many trades had a defined risk."
          formula="SQN = √n × mean R ÷ standard deviation of R"
          aside={phrase}
        >
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Stat label="Average R" value={withStop ? rMultiple(stats.expectancyR) : '—'} />
            <Stat label="SQN" value={stats.sqn === null ? '—' : Number(stats.sqn).toFixed(2)} />
            <Stat
              label="Trades with a stop"
              value={`${withStop} of ${stats.trades}`}
              detail={stats.trades ? percent(String(withStop / stats.trades), { ratio: true }) : undefined}
            />
            <Stat label="Max drawdown" value={money(stats.maxDrawdown)} detail={`${money(stats.currentDrawdown)} now`} />
            <Stat label="Longest win streak" value={streakLabel(stats.longestWinStreak)} />
            <Stat label="Longest loss streak" value={streakLabel(-stats.longestLossStreak)} />
            <Stat label="Current streak" value={streakLabel(stats.currentStreak)} />
            <Stat
              label="Recovery factor"
              value={stats.recoveryFactor === null ? '—' : Number(stats.recoveryFactor).toFixed(2)}
            />
          </div>
        </DashboardCard>
      </div>

      <DashboardCard
        title="Monthly consistency"
        description="Net P&L for each New York calendar month, with win rate and expectancy."
        formula="Month = Σ P&L of trades closed that month"
        aside={phrase}
      >
        {months.length === 0 ? (
          <EmptyNote>No trades closed in the {phrase}.</EmptyNote>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Green months" value={`${greenMonths} of ${months.length}`} />
              <Stat
                label="Best month"
                value={best ? money(best.net, { signed: true }) : '—'}
                detail={best ? monthLabel(best.key) : undefined}
              />
              <Stat
                label="Worst month"
                value={worst ? money(worst.net, { signed: true }) : '—'}
                detail={worst ? monthLabel(worst.key) : undefined}
              />
              <Stat
                label="Average month"
                value={money(String((toNumber(stats.net) ?? 0) / months.length), { signed: true })}
              />
            </div>
            {months.length > 1 && (
              <div className="mt-4">
                <BarChart
                  bars={months.map((month) => {
                    const net = toNumber(month.net) ?? 0
                    return { key: month.key, label: shortMonth(month.key), value: net, tone: net < 0 ? 'loss' : 'gain' }
                  })}
                  height={220}
                  label={`Net P&L by month, ${phrase}`}
                  tick={compactMoney}
                  readout={(index) => {
                    const month = months[index]
                    return (
                      <>
                        <p className="mb-1 font-medium">{monthLabel(month.key)}</p>
                        <ReadoutRow label="Net P&L" value={money(month.net, { signed: true })} />
                        <ReadoutRow label="Trades" value={month.trades} />
                        <ReadoutRow label="Win rate" value={percent(month.winRate, { ratio: true })} />
                      </>
                    )
                  }}
                />
              </div>
            )}
            <div className="mt-4">
              <ResultsTable label="Month" rows={[...months].reverse()} name={(row) => monthLabel(row.key)} />
            </div>
          </>
        )}
      </DashboardCard>
    </div>
  )
}
