import { useStytch } from '@stytch/react'
import type { QueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

/**
 * Ends the Stytch session and drops cached data so the next account never sees
 * the last one's. `next` sends the user back after signing in again.
 */
export function useSignOut(queryClient: QueryClient) {
  const stytch = useStytch()
  const navigate = useNavigate()
  return useCallback(
    async (next?: string) => {
      try {
        await stytch.session.revoke()
      } catch {
        // Already gone server-side; clear the local copy so the UI agrees.
        await stytch.session.revoke({ forceClear: true }).catch(() => {})
      }
      queryClient.clear()
      await navigate({ to: '/sign-in', search: { next } })
    },
    [stytch, navigate, queryClient],
  )
}
