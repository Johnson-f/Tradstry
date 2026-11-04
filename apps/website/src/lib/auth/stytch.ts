import { createStytchClient, type User } from '@stytch/react'
import type { TokenSource } from '@/lib/client/api'

export const SESSION_DURATION_MINUTES = 43_200

const PUBLIC_TOKEN = import.meta.env.VITE_STYTCH_PUBLIC_TOKEN ?? ''

// Leave VITE_STYTCH_DOMAIN unset unless it is a real custom CNAME: pointing the
// SDK at Stytch's default *.customers.stytch.* domain breaks Google OAuth with
// oauth_state_mismatch, because the OAuth callback stays on test/api.stytch.com.
export const stytch = createStytchClient(PUBLIC_TOKEN, {
  customBaseUrl: import.meta.env.VITE_STYTCH_DOMAIN || undefined,
})

/** Stytch answers 401 or 404 when the session itself has ended or been revoked. */
export function sessionEnded(error: unknown): boolean {
  const status = (error as { status_code?: unknown } | null)?.status_code
  return status === 401 || status === 404
}

// Read the JWT per request: the SDK swaps in a fresh one every few minutes.
export const stytchTokens: TokenSource = {
  getToken: () => stytch.session.getTokens()?.session_jwt ?? null,
  refresh: async () => {
    try {
      await stytch.session.authenticate()
    } catch (error) {
      // forceClear drops the local copy even though Stytch already ended the session.
      if (sessionEnded(error)) await stytch.session.revoke({ forceClear: true }).catch(() => {})
      throw error
    }
  },
}

let identityProviderClient: typeof stytch | undefined

/** Connected Apps consent must run on the exact issuer domain MCP advertises. */
export function getIdentityProviderClient(): typeof stytch {
  const domain = import.meta.env.VITE_STYTCH_IDP_DOMAIN
  if (!domain) return stytch
  identityProviderClient ??= createStytchClient(PUBLIC_TOKEN, {
    customBaseUrl: domain,
  })
  return identityProviderClient
}

export const AUTHORIZE_PATH = '/oauth/authorize'

/**
 * The client this page load gives `<StytchProvider>`. Stytch won't nest
 * providers, and consent must run on the IdP domain while sign-in must not
 * (Google OAuth state breaks there), so the choice is made once at start-up.
 */
export const pageClient: typeof stytch =
  typeof window !== 'undefined' && window.location.pathname === AUTHORIZE_PATH ? getIdentityProviderClient() : stytch

/** Reached in-app, the consent page needs a full load to get the IdP-domain client. */
export function consentNeedsReload(): boolean {
  return pageClient !== getIdentityProviderClient()
}

export function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString()
}

export function userFullName(user: User | null): string {
  if (!user) return ''
  const { first_name, middle_name, last_name } = user.name
  return [first_name, middle_name, last_name].filter(Boolean).join(' ')
}

export function userEmail(user: User | null): string {
  const emails = user?.emails ?? []
  return (emails.find((item) => item.verified) ?? emails[0])?.email ?? ''
}

export function userAvatarUrl(user: User | null): string | undefined {
  return user?.providers.find((provider) => provider.profile_picture_url)
    ?.profile_picture_url
}
