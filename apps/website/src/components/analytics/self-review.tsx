import { Comparison, EmptyNote, ResultsTable, Stat } from '@/components/analytics/analytics-bits'
import { DashboardCard } from '@/components/home/dashboard-card'
import type { Bucket, TradeStats } from '@/lib/client/analytics/stats'
import { toNumber } from '@/lib/client/trades/trades-model'

function score(value: string | null): string {
  const number = toNumber(value)
  return number === null ? '—' : `${number.toFixed(1)} / 5`
}

function count(rows: Bucket[], key: string): number {
  return rows.find((row) => row.key === key)?.trades ?? 0
}

function ScoreCard({
  title,
  description,
  rows,
  phrase,
}: {
  title: string
  description: string
  rows: Bucket[]
  phrase: string
}) {
  return (
    <DashboardCard title={title} description={description} formula="Expectancy = net P&L ÷ trades at each score" aside={phrase}>
      {rows.length === 0 ? (
        <EmptyNote>Not recorded on any trade in the {phrase}.</EmptyNote>
      ) : (
        <div className="mt-4">
          <ResultsTable label="Score" rows={rows} name={(row) => row.key} />
        </div>
      )}
    </DashboardCard>
  )
}

function YesNoCard({
  title,
  description,
  rows,
  phrase,
}: {
  title: string
  description: string
  rows: Bucket[]
  phrase: string
}) {
  return (
    <DashboardCard title={title} description={description} formula="Expectancy = net P&L ÷ trades in each group" aside={phrase}>
      {rows.length === 0 ? <EmptyNote>Not recorded on any trade in the {phrase}.</EmptyNote> : <Comparison rows={rows} />}
    </DashboardCard>
  )
}

/** Results by conviction, market, plan, revenge, the 30-minute rule and rule adherence. */
export function SelfReview({ stats, phrase }: { stats: TradeStats; phrase: string }) {
  const behavior = stats.behavior
  return (
    <section aria-labelledby="self-review" className="flex flex-col gap-4">
      <div className="pt-2">
        <h2 id="self-review" className="text-base font-semibold">
          How you traded
        </h2>
        <p className="text-sm text-muted-foreground">
          From the answers under “How you traded it” in each trade’s details. Trades without an answer are left out.
        </p>
      </div>
      {behavior.recorded === 0 ? (
        <EmptyNote>
          No answers recorded in the {phrase}. Open a trade in the journal, choose Trade Detail and answer a few
          questions to compare.
        </EmptyNote>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 @2xl/main:grid-cols-5">
            <Stat label="Trades answered" value={behavior.recorded} detail={`of ${stats.trades}`} />
            <Stat label="Average conviction" value={score(behavior.averageConviction)} />
            <Stat label="Average rule score" value={score(behavior.averageRuleAdherence)} />
            <Stat label="Revenge trades" value={count(behavior.byRevenge, 'Revenge trade')} />
            <Stat label="Broke 30-minute rule" value={count(behavior.byThirtyMinuteRule, 'Broke the 30-minute rule')} />
          </div>
          <div className="grid items-stretch gap-4 @4xl/main:grid-cols-2">
            <ScoreCard
              title="Conviction"
              description="Results by how sure you were before entering, from 1 to 5."
              rows={behavior.byConviction}
              phrase={phrase}
            />
            <ScoreCard
              title="Rule adherence"
              description="Results by how closely you followed your rules, from 1 to 5."
              rows={behavior.byRuleAdherence}
              phrase={phrase}
            />
            <DashboardCard
              title="Market"
              description="Results by what the market was doing during the trade."
              formula="Expectancy = net P&L ÷ trades in each market"
              aside={phrase}
            >
              {behavior.byMarketRegime.length === 0 ? (
                <EmptyNote>Not recorded on any trade in the {phrase}.</EmptyNote>
              ) : (
                <div className="mt-4">
                  <ResultsTable label="Market" rows={behavior.byMarketRegime} name={(row) => row.key} />
                </div>
              )}
            </DashboardCard>
            <YesNoCard
              title="Planned before the open"
              description="Trades planned before the market opened against trades that were not."
              rows={behavior.byPlanned}
              phrase={phrase}
            />
            <YesNoCard
              title="Revenge trades"
              description="Trades taken to win back a loss against the rest."
              rows={behavior.byRevenge}
              phrase={phrase}
            />
            <YesNoCard
              title="30-minute rule"
              description="Trades that kept your 30-minute rule against trades that broke it."
              rows={behavior.byThirtyMinuteRule}
              phrase={phrase}
            />
          </div>
        </>
      )}
    </section>
  )
}
