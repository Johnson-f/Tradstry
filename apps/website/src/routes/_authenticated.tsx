import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useParams,
  useRouterState,
} from '@tanstack/react-router'
import { ChevronRight, House, Landmark, LifeBuoy } from 'lucide-react'
import { Suspense } from 'react'
import { UserMenu } from '@/components/account/user-menu'
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher'
import { signInRedirectFor } from '@/lib/auth/auth-guard'
import { pageTitle } from '@/lib/navigation'

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
  const title = useRouterState({
    select: (state) => pageTitle(state.location.pathname),
  })
  const { workspaceId } = useParams({ strict: false })

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
          <img src="/favicon.svg" width="22" height="22" alt="" className="size-5.5 brightness-0 dark:invert" />
        </Link>

        <nav aria-label="Main navigation" className="flex flex-col gap-1">
          <Link
            to="/"
            aria-label="Dashboard"
            title="Dashboard"
            aria-current={workspaceId ? 'page' : undefined}
            className={workspaceId ? `${railLinkClass} ${activeRailLinkClass}` : railLinkClass}
          >
            <House className="size-4.5" aria-hidden />
          </Link>
          <Link
            to="/brokerage"
            aria-label="Brokerage"
            title="Brokerage"
            className={railLinkClass}
            activeProps={{ className: activeRailLinkClass }}
          >
            <Landmark className="size-4.5" aria-hidden />
          </Link>
        </nav>

        <div className="flex flex-col items-center gap-2 self-end">
          <a
            href="https://www.tradstry.com/#faq"
            aria-label="Help"
            title="Help"
            className={railLinkClass}
          >
            <LifeBuoy className="size-4.5" aria-hidden />
          </a>
          <UserMenu />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 overflow-hidden rounded-2xl bg-white dark:bg-neutral-900">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-10 shrink-0 items-center border-b border-neutral-200/60 px-4 dark:border-white/10">
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center gap-2.5 text-sm">
                <li>
                  <span className="text-neutral-400">Tradstry</span>
                </li>
                {workspaceId && (
                  <li className="flex min-w-0 items-center gap-2.5" aria-current={title === 'Dashboard' ? 'page' : undefined}>
                    <ChevronRight className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
                    <WorkspaceSwitcher workspaceId={workspaceId} />
                  </li>
                )}
                {(!workspaceId || title !== 'Dashboard') && (
                  <li className="flex items-center gap-2.5">
                    <ChevronRight className="size-3.5 text-neutral-400" aria-hidden />
                    <span aria-current="page">{title}</span>
                  </li>
                )}
              </ol>
            </nav>
          </header>
          <main
            id="dashboard-content"
            tabIndex={-1}
            className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-none p-4 outline-none sm:p-6"
          >
            <Suspense fallback={<span role="status" className="sr-only">Loading page…</span>}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  )
}
