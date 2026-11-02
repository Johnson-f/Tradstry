import { Link, createFileRoute } from '@tanstack/react-router'
import { NotebookPen, Plus } from 'lucide-react'
import { useState } from 'react'
import { DashboardCardSkeleton } from '@/components/home/dashboard-card'
import { MetricsRow } from '@/components/home/metrics-row'
import { RiskRecoveryCard } from '@/components/home/risk-recovery-card'
import { TradingCalendar } from '@/components/home/trading-calendar'
import { TradingPnlCard } from '@/components/home/trading-pnl-card'
import { WinnersLeaksCard } from '@/components/home/winners-leaks-card'
import { FillDialog } from '@/components/trades/fill-dialog'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DEFAULT_PERIOD, type Period, isPeriod, marketDate, periodRange } from '@/lib/client/home/home-model'
import { useIsManualWorkspace, useOpenPositions, useTradeStats } from '@/lib/client/trades/trades'
import { tradeErrorMessage } from '@/lib/client/trades/trades-model'

export const Route = createFileRoute('/_authenticated/w/$workspaceId/')({
  validateSearch: (search: Record<string, unknown>): { period?: Period } =>
    isPeriod(search.period) && search.period !== DEFAULT_PERIOD ? { period: search.period } : {},
  component: Dashboard,
})

function FirstTrades({ workspaceId }: { workspaceId: string }) {
  const manual = useIsManualWorkspace(workspaceId)
  const [adding, setAdding] = useState(false)
  return (
    <section className="rounded-xl border border-border/70 bg-card px-6 py-12 text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground dark:bg-white/8">
        <NotebookPen className="size-5" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg font-semibold">
        {manual === false ? 'Your history is on its way' : 'Add your first trade'}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">
        {manual === false
          ? 'Trades appear once your brokerage history is imported, and your dashboard fills in from there.'
          : 'Add the buys and sells you made, and Tradstry turns them into trades. Your dashboard fills in from there.'}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {manual && (
          <Button size="sm" className="h-8" onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add fill
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          nativeButton={false}
          render={<Link to="/w/$workspaceId/journal" params={{ workspaceId }} />}
        >
          Open journal
        </Button>
      </div>
      {adding && <FillDialog workspaceId={workspaceId} onClose={() => setAdding(false)} />}
    </section>
  )
}

function Dashboard() {
  const { workspaceId } = Route.useParams()
  const { period = DEFAULT_PERIOD } = Route.useSearch()
  const [now] = useState(() => new Date())
  const range = periodRange(period, now)
  const allTime = useTradeStats(workspaceId, null)
  const stats = useTradeStats(workspaceId, range.from)
  const open = useOpenPositions(workspaceId)
  const empty = allTime.data?.trades === 0 && open.data?.length === 0
  const loading = stats.isPending
  const dimmed = stats.isPlaceholderData
  const rangeStart = range.from ? marketDate(new Date(range.from)) : null

  return (
    <TooltipProvider delay={150}>
      <div className="@container/main mx-auto flex w-full max-w-[96rem] flex-col gap-3 pb-10 font-sans md:gap-4">
        <h1 className="sr-only">Dashboard</h1>
        {empty ? (
          <FirstTrades workspaceId={workspaceId} />
        ) : stats.isError ? (
          <p role="alert" className="rounded-xl border border-border/70 bg-card p-5 text-sm text-destructive">
            {tradeErrorMessage(stats.error, 'Could not load your dashboard.')}
          </p>
        ) : (
          <>
            <MetricsRow stats={stats.data} phrase={range.phrase} loading={loading} dimmed={dimmed} />
            {loading || !stats.data ? (
              <>
                <DashboardCardSkeleton height="h-[260px]" />
                <div className="grid items-stretch gap-4 md:gap-6 @4xl/main:grid-cols-2">
                  <DashboardCardSkeleton height="h-56" />
                  <DashboardCardSkeleton height="h-56" />
                </div>
              </>
            ) : (
              <>
                <TradingPnlCard stats={stats.data} phrase={range.phrase} dimmed={dimmed} />
                <div className="grid items-stretch gap-4 md:gap-6 @4xl/main:grid-cols-2">
                  <RiskRecoveryCard stats={stats.data} phrase={range.phrase} dimmed={dimmed} />
                  <WinnersLeaksCard
                    stats={stats.data}
                    phrase={range.phrase}
                    dimmed={dimmed}
                    workspaceId={workspaceId}
                    rangeStart={rangeStart}
                  />
                </div>
              </>
            )}
            <TradingCalendar
              equity={allTime.data?.equity}
              today={marketDate(now)}
              loading={allTime.isPending}
              workspaceId={workspaceId}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
