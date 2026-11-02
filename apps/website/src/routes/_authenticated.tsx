import { Link, Outlet, createFileRoute, redirect, useParams, useRouterState } from '@tanstack/react-router'
import { QuillWrite02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChevronRight, House, LifeBuoy } from 'lucide-react'
import { Suspense } from 'react'
import { UserMenu } from '@/components/account/user-menu'
import { ConnectBrokerMenu } from '@/components/brokerage/connect-broker-menu'
import { PeriodMenu } from '@/components/home/period-menu'
import { ManageLabelsDialog } from '@/components/trades/manage-labels-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher'
import { signInRedirectFor } from '@/lib/auth/auth-guard'
import { pageTitle, workspaceLocation } from '@/lib/navigation'

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

function AppLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const title = pageTitle(pathname)
  const isHome = title === 'Dashboard'
  const isJournal = title === 'Journal'
  const { workspaceId, tradeId } = useParams({ strict: false })
  const showPageTitle = !workspaceId || !isJournal
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

      <aside
        aria-label="App navigation"
        className="grid w-13 shrink-0 grid-rows-[1fr_auto_1fr] justify-items-center py-1 max-sm:w-14"
      >
        <Link to="/" aria-label="Tradstry home" title="Tradstry" className={railLinkClass}>
          <img
            src="/favicon.svg"
            width="22"
            height="22"
            alt=""
            className="size-5.5 brightness-0 dark:invert"
          />
        </Link>

        <nav aria-label="Main navigation" className="flex flex-col gap-1">
          <Link
            {...workspaceLocation(workspaceId, 'home')}
            aria-label="Dashboard"
            title="Dashboard"
            activeOptions={{ exact: true }}
            aria-current={isHome ? 'page' : undefined}
            className={isHome ? `${railLinkClass} ${activeRailLinkClass}` : railLinkClass}
          >
            <House className="size-4.5" aria-hidden />
          </Link>
          <Link
            {...workspaceLocation(workspaceId)}
            aria-label="Journal"
            title="Journal"
            activeOptions={{ exact: true }}
            aria-current={isJournal ? 'page' : undefined}
            className={isJournal ? `${railLinkClass} ${activeRailLinkClass}` : railLinkClass}
          >
            <HugeiconsIcon icon={QuillWrite02Icon} className="size-5" strokeWidth={1.5} aria-hidden />
          </Link>
        </nav>

        <div className="flex flex-col items-center gap-2 self-end">
          <a href="https://www.tradstry.com/#faq" aria-label="Help" title="Help" className={railLinkClass}>
            <LifeBuoy className="size-4.5" aria-hidden />
          </a>
          <UserMenu />
        </div>
      </aside>

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
                    <WorkspaceSwitcher workspaceId={workspaceId} section={isHome ? 'home' : 'journal'} />
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
            {isHome && workspaceId && <PeriodMenu workspaceId={workspaceId} />}
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
