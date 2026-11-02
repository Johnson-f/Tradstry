import { Tabs } from '@base-ui/react/tabs'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { BehaviorTab } from '@/components/analytics/behavior-tab'
import { EdgesTab } from '@/components/analytics/edges-tab'
import { OverviewTab } from '@/components/analytics/overview-tab'
import { RiskTab } from '@/components/analytics/risk-tab'
import { DashboardCardSkeleton } from '@/components/home/dashboard-card'
import { Card } from '@/components/ui/card'
import { tabClass, tabListClass } from '@/components/ui/tab-styles'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useTradeStats } from '@/lib/client/analytics/stats'
import { type Period, isPeriod, marketDate, periodRange } from '@/lib/client/home/home-model'
import { useDefaultPeriod } from '@/lib/client/settings'
import { tradeErrorMessage } from '@/lib/client/trades/trades-model'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'risk', label: 'Risk & R' },
  { value: 'edges', label: 'Edges' },
  { value: 'behavior', label: 'Behavior' },
] as const

type AnalyticsTab = (typeof TABS)[number]['value']

function isTab(value: unknown): value is AnalyticsTab {
  return TABS.some((tab) => tab.value === value)
}

export const Route = createFileRoute('/_authenticated/w/$workspaceId/analytics')({
  validateSearch: (search: Record<string, unknown>): { period?: Period; tab?: Exclude<AnalyticsTab, 'overview'> } => ({
    ...(isPeriod(search.period) ? { period: search.period } : {}),
    ...(isTab(search.tab) && search.tab !== 'overview' ? { tab: search.tab } : {}),
  }),
  component: Analytics,
})

function Analytics() {
  const { workspaceId } = Route.useParams()
  const defaultPeriod = useDefaultPeriod()
  const { period = defaultPeriod, tab = 'overview' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [now] = useState(() => new Date())
  const range = periodRange(period, now)
  const stats = useTradeStats(workspaceId, range.from)
  const rangeStart = range.from ? marketDate(new Date(range.from)) : null
  const data = stats.data

  return (
    <TooltipProvider delay={150}>
      <div className="@container/main mx-auto flex w-full max-w-[96rem] flex-col gap-4 pb-10 font-sans">
        <h1 className="sr-only">Analytics</h1>
        <Tabs.Root
          value={tab}
          onValueChange={(next: AnalyticsTab) =>
            void navigate({
              search: (previous) => ({ ...previous, tab: next === 'overview' ? undefined : next }),
              replace: true,
            })
          }
        >
          <Tabs.List aria-label="Analytics views" className={tabListClass}>
            {TABS.map((option) => (
              <Tabs.Tab key={option.value} value={option.value} className={tabClass}>
                {option.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <div className={`pt-4 transition-opacity duration-200 ${stats.isPlaceholderData ? 'opacity-60' : ''}`}>
            {stats.isError ? (
              <p role="alert" className="rounded-xl border border-border/70 bg-card p-5 text-sm text-destructive">
                {tradeErrorMessage(stats.error, 'Could not load your analytics.')}
              </p>
            ) : stats.isPending || !data ? (
              <div className="flex flex-col gap-4">
                <DashboardCardSkeleton height="h-40" />
                <DashboardCardSkeleton height="h-64" />
              </div>
            ) : data.trades === 0 ? (
              <Card className="items-center gap-2 px-6 py-12 text-center shadow-none">
                <h2 className="font-medium">No trades closed in the {range.phrase}</h2>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  Pick a longer period in the top bar, or close some trades to see your analytics.
                </p>
              </Card>
            ) : (
              <>
                <Tabs.Panel value="overview" className="outline-none">
                  <OverviewTab stats={data} phrase={range.phrase} />
                </Tabs.Panel>
                <Tabs.Panel value="risk" className="outline-none">
                  <RiskTab stats={data} phrase={range.phrase} />
                </Tabs.Panel>
                <Tabs.Panel value="edges" className="outline-none">
                  <EdgesTab stats={data} phrase={range.phrase} workspaceId={workspaceId} rangeStart={rangeStart} />
                </Tabs.Panel>
                <Tabs.Panel value="behavior" className="outline-none">
                  <BehaviorTab stats={data} phrase={range.phrase} workspaceId={workspaceId} rangeStart={rangeStart} />
                </Tabs.Panel>
              </>
            )}
          </div>
        </Tabs.Root>
      </div>
    </TooltipProvider>
  )
}
