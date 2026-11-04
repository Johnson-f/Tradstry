import { parseOAuthAuthorizeParams, useStytch, useStytchSession } from '@stytch/react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ConsentScreen } from '@/components/auth/consent-screen'
import { consentNeedsReload } from '@/lib/auth/stytch'

/**
 * The Connected Apps authorization URL. MCP clients send the user here to
 * approve access; the OAuth request travels in this page's query string.
 */
export const Route = createFileRoute('/oauth/authorize')({
  component: Authorize,
})

function Authorize() {
  const reload = consentNeedsReload()
  useEffect(() => {
    if (reload) window.location.replace(window.location.href)
  }, [reload])
  return reload ? null : <Consent />
}

function Consent() {
  const stytch = useStytch()
  const { session } = useStytchSession()
  const router = useRouter()
  // Keep the request seen on arrival, as Stytch's own consent screen does.
  const [{ result: request, error }] = useState(() => parseOAuthAuthorizeParams(new URLSearchParams(window.location.search)))

  // Sign in on a full page load so it runs on the default client, then come
  // back to this exact URL: its query carries the OAuth request.
  const signIn = () => {
    const next = `${window.location.pathname}${window.location.search}`
    window.location.replace(router.buildLocation({ to: '/sign-in', search: { next } }).href)
  }

  useEffect(() => {
    if (!session) signIn()
  })

  if (!session) return null
  return (
    <ConsentScreen
      request={request}
      requestError={error}
      onSwitchAccount={() => void stytch.session.revoke({ forceClear: true }).finally(signIn)}
    />
  )
}
