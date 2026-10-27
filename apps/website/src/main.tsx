import { StytchProvider } from '@stytch/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from '@/app'
import { stytch } from '@/lib/auth/stytch'
import { routeTree } from './routeTree.gen'

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: { auth: { isSignedIn: false }, queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StytchProvider stytch={stytch}>
      <QueryClientProvider client={queryClient}>
        <App router={router} queryClient={queryClient} />
      </QueryClientProvider>
    </StytchProvider>
  </StrictMode>,
)
