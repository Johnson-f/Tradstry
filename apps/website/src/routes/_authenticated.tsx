import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { UserMenu } from '@/components/account/user-menu'
import { signInRedirectFor } from '@/lib/auth/auth-guard'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    const target = signInRedirectFor(context.auth, location.href)
    if (target) throw redirect(target)
  },
  component: AppLayout,
})

const navLinkClass = 'text-muted-foreground hover:text-foreground'

function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center gap-6 border-b px-6 py-3">
        <span className="font-semibold">Tradstry</span>
        <nav className="flex flex-1 gap-4 text-sm">
          <Link
            to="/"
            className={navLinkClass}
            activeProps={{ className: 'text-foreground font-medium' }}
            activeOptions={{ exact: true }}
          >
            Dashboard
          </Link>
          <Link
            to="/settings"
            className={navLinkClass}
            activeProps={{ className: 'text-foreground font-medium' }}
          >
            Settings
          </Link>
        </nav>
        <UserMenu />
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
