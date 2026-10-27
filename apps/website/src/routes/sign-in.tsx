import { Products, StytchLogin, useStytchSession } from '@stytch/react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { presentation } from '@/components/auth/presentation'
import {
  rememberReturnTo,
  safeReturnPath,
  takeReturnTo,
} from '@/lib/auth/auth-redirect'
import { SESSION_DURATION_MINUTES, absoluteUrl } from '@/lib/auth/stytch'

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next: typeof search.next === 'string' ? search.next : undefined,
  }),
  component: SignIn,
})

function SignIn() {
  const { next } = Route.useSearch()
  const { session } = useStytchSession()
  const router = useRouter()

  useEffect(() => {
    rememberReturnTo(safeReturnPath(next))
  }, [next])

  useEffect(() => {
    if (session) router.history.replace(takeReturnTo())
  }, [session, router])

  const config = useMemo(() => {
    const authenticateUrl = absoluteUrl('/authenticate')
    return {
      products: [Products.oauth, Products.passwords],
      oauthOptions: {
        providers: [{ type: 'google' as const }],
        loginRedirectURL: authenticateUrl,
        signupRedirectURL: authenticateUrl,
      },
      passwordOptions: {
        loginRedirectURL: authenticateUrl,
        resetPasswordRedirectURL: absoluteUrl('/reset-password'),
      },
      sessionOptions: { sessionDurationMinutes: SESSION_DURATION_MINUTES },
    }
  }, [])

  return (
    <AuthShell
      title="Sign in"
      description="Use Google or your email and password. New here? The same form creates your account."
    >
      <StytchLogin config={config} presentation={presentation} />
    </AuthShell>
  )
}
