import { Link, Outlet, createFileRoute, redirect, useParams, useRouterState } from '@tanstack/react-router'
import { Analytics01Icon, Calculator01Icon, QuillWrite02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChevronRight, House, LifeBuoy } from 'lucide-react'
import { Suspense, useState } from 'react'
import { UserMenu } from '@/components/account/user-menu'
import { ConnectBrokerMenu } from '@/components/brokerage/connect-broker-menu'
import { PeriodMenu } from '@/components/home/period-menu'
import { PositionCalculator } from '@/components/plans/position-calculator'
import { ManageLabelsDialog } from '@/components/trades/manage-labels-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher'
import { signInRedirectFor } from '@/lib/auth/auth-guard'
import { useRealtimeUpdates } from '@/lib/client/realtime'
import { useSettings } from '@/lib/client/settings'
import { setDisplayTimeZone } from '@/lib/format'
import { pageTitle, workspaceLocation, workspaceSection } from '@/lib/navigation'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    const target = signInRedirectFor(context.auth, location.href)
    if (target) throw redirect(target)
  },
  component: AppLayout,
})

const railLinkClass =
  'flex size-9 items-center justify-center rounded-xl text-neutral-500 hover:bg-black/5 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 max-sm:size-11 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100'

const activeRailLinkClass = 'bg-black/7 text-neutral-900 dark:bg-white/10 dark:text-neutral-100'

/** A rail control whose name shows beside it on hover or focus. */
function RailItem({ label, render, children }: { label: string; render: React.ReactElement; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={render}>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="font-[Arial,Helvetica,sans-serif]">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function AppLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const title = pageTitle(pathname)
  const section = workspaceSection(pathname)
  const isHome = title === 'Dashboard'
  const isJournal = title === 'Journal'
  const isAnalytics = title === 'Analytics'
  const { workspaceId, tradeId } = useParams({ strict: false })
  const settings = useSettings()
  useRealtimeUpdates()
  const [plannerOpen, setPlannerOpen] = useState(false)
  setDisplayTimeZone(settings.data?.timeZone ?? 'LOCAL')
  const showPageTitle = !workspaceId || !(isHome || isJournal || isAnalytics)
  const content = (
    <Suspense
      fallback={
        <span role="status" className="sr-only">
          Loading page…
        </span>
      }
    >
      <Outlet />
    </Suspense>
  )

  return (
    <div className="fixed inset-0 flex overflow-hidden overscroll-none bg-[#ededed] py-1.5 pr-1.5 font-[Arial,Helvetica,sans-serif] text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-16 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:ring-2 focus:ring-neutral-500"
      >
        Skip to content
      </a>

      <TooltipProvider delay={300}>
        <aside
          aria-label="App navigation"
          className="grid w-13 shrink-0 grid-rows-[1fr_auto_1fr] justify-items-center py-1 max-sm:w-14"
        >
          <RailItem label="Tradstry" render={<Link to="/app" aria-label="Tradstry home" className={railLinkClass} />}>
            <img
              src="/favicon.svg"
              width="24"
              height="24"
              alt=""
              className="size-6 rounded-[5px] dark:ring-1 dark:ring-white/15"
            />
          </RailItem>

          <nav aria-label="Main navigation" className="flex flex-col gap-1">
            <RailItem
              label="Dashboard"
              render={
                <Link
                  {...workspaceLocation(workspaceId, 'home')}
                  aria-label="Dashboard"
                  activeOptions={{ exact: true }}
                  aria-current={isHome ? 'page' : undefined}
                  className={isHome ? `${railLinkClass} ${activeRailLinkClass}` : railLinkClass}
                />
              }
            >
              <House className="size-4.5" aria-hidden />
            </RailItem>
            <RailItem
              label="Journal"
              render={
                <Link
                  {...workspaceLocation(workspaceId)}
                  aria-label="Journal"
                  activeOptions={{ exact: true }}
                  aria-current={isJournal ? 'page' : undefined}
                  className={isJournal ? `${railLinkClass} ${activeRailLinkClass}` : railLinkClass}
                />
              }
            >
              <HugeiconsIcon icon={QuillWrite02Icon} className="size-5" strokeWidth={1.5} aria-hidden />
            </RailItem>
            <RailItem
              label="Analytics"
              render={
                <Link
                  {...workspaceLocation(workspaceId, 'analytics')}
                  aria-label="Analytics"
                  aria-current={isAnalytics ? 'page' : undefined}
                  className={isAnalytics ? `${railLinkClass} ${activeRailLinkClass}` : railLinkClass}
                />
              }
            >
              <HugeiconsIcon icon={Analytics01Icon} className="size-5" strokeWidth={1.5} aria-hidden />
            </RailItem>
          </nav>

          <div className="flex flex-col items-center gap-2 self-end">
            {workspaceId && (
              <RailItem
                label="Position Calculator"
                render={
                  <button
                    type="button"
                    aria-label="Position Calculator"
                    aria-haspopup="dialog"
                    onClick={() => setPlannerOpen(true)}
                    className={plannerOpen ? `${railLinkClass} ${activeRailLinkClass}` : railLinkClass}
                  />
                }
              >
                <HugeiconsIcon icon={Calculator01Icon} className="size-5" strokeWidth={1.5} aria-hidden />
              </RailItem>
            )}
            <RailItem
              label="Help"
              render={<a href="https://tradstry.com/#faq" aria-label="Help" className={railLinkClass} />}
            >
              <LifeBuoy className="size-4.5" aria-hidden />
            </RailItem>
            <UserMenu />
          </div>
        </aside>
      </TooltipProvider>
      {workspaceId && <PositionCalculator workspaceId={workspaceId} open={plannerOpen} onOpenChange={setPlannerOpen} />}

      <div className="flex min-w-0 flex-1 overflow-hidden rounded-2xl bg-white dark:bg-neutral-900">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-10 shrink-0 items-center gap-3 border-b border-neutral-200/60 px-4 dark:border-white/10">
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex min-w-0 items-center gap-2.5 text-sm">
                <li>
                  <span className="text-neutral-400">Tradstry</span>
                </li>
                {(workspaceId || isHome) && (
                  <li
                    className="flex min-w-0 items-center gap-2.5"
                    aria-current={!showPageTitle ? 'page' : undefined}
                  >
                    <ChevronRight className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
                    <WorkspaceSwitcher workspaceId={workspaceId} section={section} />
                  </li>
                )}
                {showPageTitle && (
                  <li className="flex items-center gap-2.5">
                    <ChevronRight className="size-3.5 text-neutral-400" aria-hidden />
                    <span aria-current="page">{title}</span>
                  </li>
                )}
              </ol>
            </nav>
            {isJournal && (
              <div className="flex shrink-0 items-center gap-2">
                <ManageLabelsDialog />
                <ConnectBrokerMenu />
              </div>
            )}
            {(isHome || isAnalytics) && workspaceId && (
              <PeriodMenu workspaceId={workspaceId} section={isHome ? 'home' : 'analytics'} />
            )}
          </header>
          <main id="dashboard-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-hidden outline-none">
            {tradeId ? (
              content
            ) : (
              <ScrollArea className="h-full min-w-0 overflow-hidden [&>[data-slot=scroll-area-viewport]]:overscroll-none">
                <div className="min-h-full min-w-0 p-4 sm:p-6">{content}</div>
              </ScrollArea>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
