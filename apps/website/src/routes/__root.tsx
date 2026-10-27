import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
})

const navLinkClass = 'text-muted-foreground hover:text-foreground'

function RootLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center gap-6 border-b px-6 py-3">
        <span className="font-semibold">Tradstry</span>
        <nav className="flex gap-4 text-sm">
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
      </header>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
      <TanStackRouterDevtools />
    </div>
  )
}

function NotFound() {
  return <p className="text-muted-foreground">Page not found.</p>
}
