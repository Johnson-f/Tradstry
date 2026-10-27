import {
  IdentityProvider,
  StytchProvider,
  useStytchSession,
} from '@stytch/react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AuthShell } from '@/components/auth/auth-shell'
import { presentation } from '@/components/auth/presentation'
import { getIdentityProviderClient } from '@/lib/auth/stytch'

/**
 * The Connected Apps authorization URL. MCP clients send the user here to
 * approve access; Stytch reads the OAuth parameters from this page's URL.
 */
export const Route = createFileRoute('/oauth/authorize')({
  component: Authorize,
})

function Authorize() {
  return (
    <StytchProvider stytch={getIdentityProviderClient()}>
      <Consent />
    </StytchProvider>
  )
}

function Consent() {
  const { session } = useStytchSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (session) return
    // Come back to the exact authorize URL: its query carries the OAuth request.
    const next = `${window.location.pathname}${window.location.search}`
    void navigate({ to: '/sign-in', search: { next }, replace: true })
  }, [session, navigate])

  if (!session) return null
  return (
    <AuthShell
      title="Allow access"
      description="An app is asking to use your Tradstry account."
    >
      <IdentityProvider presentation={presentation} />
    </AuthShell>
  )
}
