import { StytchProvider } from '@stytch/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'
import { pageClient } from '@/lib/auth/stytch'
import { routeTree } from './routeTree.gen'
import { applyTheme, storedTheme } from '@/lib/theme'

applyTheme(storedTheme(), false)

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: { auth: { isSignedIn: false }, queryClient },
  defaultPreload: 'viewport',
  defaultPendingMinMs: 0,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StytchProvider stytch={pageClient}>
      <QueryClientProvider client={queryClient}>
        <App router={router} queryClient={queryClient} />
      </QueryClientProvider>
    </StytchProvider>
  </StrictMode>,
)
