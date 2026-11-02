import { useStytch, useStytchSession } from '@stytch/react'
import type { QueryClient } from '@tanstack/react-query'
import { RouterProvider, type AnyRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useRef } from 'react'

export function App({
  router,
  queryClient,
}: {
  router: AnyRouter
  queryClient: QueryClient
}) {
  // assumeHydrated (the @stytch/react default) serves the cached session on
  // the first render, so guards can decide without a loading state.
  const stytch = useStytch()
  const { session } = useStytchSession()
  const isSignedIn = session !== null
  // Guards read the SDK directly: right after sign-in, React state is a render behind.
  const auth = useMemo(
    () => ({
      get isSignedIn() {
        return stytch.session.getSync() !== null
      },
    }),
    [stytch],
  )
  const previousSignIn = useRef(isSignedIn)

  useEffect(() => {
    // Session refreshes do not change access. Only rerun guards on sign-in/out.
    if (previousSignIn.current === isSignedIn) return
    previousSignIn.current = isSignedIn
    void router.invalidate()
  }, [router, isSignedIn])

  return <RouterProvider router={router} context={{ auth, queryClient }} />
}
