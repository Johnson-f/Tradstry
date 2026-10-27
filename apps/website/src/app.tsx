import { useStytchSession } from '@stytch/react'
import type { QueryClient } from '@tanstack/react-query'
import { RouterProvider, type AnyRouter } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'

export function App({
  router,
  queryClient,
}: {
  router: AnyRouter
  queryClient: QueryClient
}) {
  // assumeHydrated (the @stytch/react default) serves the cached session on
  // the first render, so guards can decide without a loading state.
  const { session } = useStytchSession()
  const auth = useMemo(() => ({ isSignedIn: session !== null }), [session])

  useEffect(() => {
    void router.invalidate()
  }, [router, auth])

  return <RouterProvider router={router} context={{ auth, queryClient }} />
}
