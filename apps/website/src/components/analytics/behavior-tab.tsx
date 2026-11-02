import { Comparison, EmptyNote, ResultsTable, RowName, Stat } from '@/components/analytics/analytics-bits'
import { SelfReview } from '@/components/analytics/self-review'
import { DashboardCard } from '@/components/home/dashboard-card'
import { Pnl } from '@/components/trades/trade-bits'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dataTableClass, numericCell } from '@/components/ui/table-styles'
import type { TradeStats } from '@/lib/client/analytics/stats'
import { holdTime, money, percent, toNumber } from '@/lib/client/trades/trades-model'

/**
 * How habits show up in results: mistakes, trading after a loss, how much is
 * traded each day, and what the trader recorded about their own behavior.
 */
export function BehaviorTab({
  stats,
  phrase,
  workspaceId,
  rangeStart,
}: {
  stats: TradeStats
  phrase: string
  workspaceId: string
  rangeStart: string | null
}) {
  const since = rangeStart ? { closedFrom: rangeStart } : {}
  const flawed = stats.byDiscipline.find((row) => row.key === 'With mistakes')
  const winHold = stats.averageWinHoldSeconds
  const lossHold = stats.averageLossHoldSeconds
  const holdsLosers = winHold !== null && lossHold !== null && lossHold > winHold

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 @4xl/main:grid-cols-2">
        <DashboardCard
          title="Clean vs flawed"
          description="Trades with no mistake recorded against trades with at least one."
          formula="Expectancy = net P&L ÷ trades in each group"
          aside={phrase}
        >
          {!flawed || flawed.trades === 0 ? (
            <EmptyNote>No mistakes recorded in the {phrase}. Note them in a trade’s details to compare.</EmptyNote>
          ) : (
            <Comparison rows={stats.byDiscipline} />
          )}
        </DashboardCard>
        <DashboardCard
          title="Hold time"
          description="How long winning trades were held compared with losing ones."
          formula="Average of (close − open) for each group"
          aside={phrase}
        >
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat label="All trades" value={holdTime(stats.averageHoldSeconds)} />
            <Stat label="Winners" value={holdTime(winHold)} />
            <Stat label="Losers" value={holdTime(lossHold)} />
          </div>
          {holdsLosers && (
            <p className="mt-3 text-xs text-muted-foreground">
              Losers are held longer than winners, a common sign of letting losses run.
            </p>
          )}
        </DashboardCard>
      </div>

      <DashboardCard
        title="Mistakes"
        description="What each mistake cost: trades with it, against every other trade in the range."
        formula="Expectancy with vs without = net ÷ trades in each group"
        aside={phrase}
      >
        {stats.mistakeCosts.length === 0 ? (
          <EmptyNote>No mistakes recorded in the {phrase}.</EmptyNote>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border">
            <Table className={dataTableClass} aria-label="What each mistake cost">
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead scope="col">Mistake</TableHead>
                  <TableHead scope="col" className={numericCell}>
                    Trades
                  </TableHead>
                  <TableHead scope="col" className={numericCell}>
                    Net P&amp;L
                  </TableHead>
                  <TableHead scope="col" className={numericCell}>
                    Expectancy with
                  </TableHead>
                  <TableHead scope="col" className={numericCell}>
                    Without
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.mistakeCosts.map((cost) => (
                  <TableRow key={cost.mistake.id}>
                    <TableCell className="max-w-64">
                      <RowName
                        name={cost.mistake.name}
                        color={cost.mistake.color}
                        workspaceId={workspaceId}
                        filter={{ mistakeId: cost.mistake.id, ...since }}
                      />
                    </TableCell>
                    <TableCell className={numericCell}>{cost.trades}</TableCell>
                    <TableCell className={numericCell}>
                      <Pnl value={cost.net} />
                    </TableCell>
                    <TableCell className={numericCell}>
                      <Pnl value={cost.expectancyWith} />
                    </TableCell>
                    <TableCell className={numericCell}>
                      <Pnl value={cost.expectancyWithout} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DashboardCard>

      <div className="grid items-stretch gap-4 @4xl/main:grid-cols-2">
        <DashboardCard
          title="After a win or a loss"
          description="Each trade by how the previous trade that day ended before it opened. Trading worse after a loss can point to revenge trading."
          formula="Previous = last trade closed earlier the same New York day"
          aside={phrase}
        >
          {stats.byPreviousTrade.length === 0 ? (
            <EmptyNote>No trades closed in the {phrase}.</EmptyNote>
          ) : (
            <div className="mt-4">
              <ResultsTable label="Trade" rows={stats.byPreviousTrade} name={(row) => row.key} />
            </div>
          )}
        </DashboardCard>
        <DashboardCard
          title="Trades per day"
          description="Trading days grouped by how many trades closed on them. Shows whether more trades in a day helps or hurts."
          formula="Average day = net P&L ÷ trading days in the group"
          aside={phrase}
        >
          {stats.tradesPerDay.length === 0 ? (
            <EmptyNote>No trades closed in the {phrase}.</EmptyNote>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border">
              <Table className={dataTableClass} aria-label="Results by trades per day">
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead scope="col">Day with</TableHead>
                    <TableHead scope="col" className={numericCell}>
                      Days
                    </TableHead>
                    <TableHead scope="col" className={numericCell}>
                      Win rate
                    </TableHead>
                    <TableHead scope="col" className={numericCell}>
                      Average day
                    </TableHead>
                    <TableHead scope="col" className={numericCell}>
                      Net P&amp;L
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.tradesPerDay.map((load) => (
                    <TableRow key={load.key}>
                      <TableCell>{load.key}</TableCell>
                      <TableCell className={numericCell}>{load.days}</TableCell>
                      <TableCell className={numericCell}>{percent(load.winRate, { ratio: true })}</TableCell>
                      <TableCell className={numericCell}>
                        <Pnl value={load.averageDay} />
                      </TableCell>
                      <TableCell className={numericCell}>
                        <Pnl value={load.net} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {stats.tradesPerDay.length > 1 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Best average day:{' '}
              {(() => {
                const best = [...stats.tradesPerDay].sort(
                  (a, b) => (toNumber(b.averageDay) ?? 0) - (toNumber(a.averageDay) ?? 0),
                )[0]
                return `days with ${best.key} (${money(best.averageDay, { signed: true })})`
              })()}
            </p>
          )}
        </DashboardCard>
      </div>

      <DashboardCard
        title="Plans"
        description="Trades you linked to a plan made beforehand, against trades with no plan."
        formula="Expectancy = net P&L ÷ trades in each group"
        aside={phrase}
      >
        {stats.plans.fromPlan === 0 && stats.plans.skipped === 0 ? (
          <EmptyNote>
            No plans linked to trades in the {phrase}. Plan a trade in the Position Calculator in the sidebar, then link it
            from the trade in the journal.
          </EmptyNote>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 @2xl/main:grid-cols-4">
              <Stat label="Trades from a plan" value={stats.plans.fromPlan} detail={`of ${stats.trades}`} />
              <Stat label="Skipped plans" value={stats.plans.skipped} />
            </div>
            <Comparison rows={stats.plans.byPlan} />
          </>
        )}
      </DashboardCard>

      <SelfReview stats={stats} phrase={phrase} />
    </div>
  )
}
