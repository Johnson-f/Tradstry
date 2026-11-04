/** What a requested OAuth scope lets an app do, in Tradstry's words. */
export interface Permission {
  title: string
  detail: string
}

const IDENTITY_SCOPES = new Set(['openid', 'profile', 'email', 'phone'])

const PERMISSIONS: Record<string, Permission> = {
  'tradstry:read': {
    title: 'Read your trading journal',
    detail: 'Trades, journal notes, labels, plans and analytics, across your workspaces.',
  },
  'tradstry:write': {
    title: 'Add to your journal',
    detail: 'Add notes and labels to trades, and save trade plans. It never deletes what you wrote.',
  },
  offline_access: {
    title: 'Stay connected',
    detail: 'Keep access while you’re away, until you disconnect it.',
  },
}

const IDENTITY: Permission = { title: 'See your name and email address', detail: 'To know which account it’s using.' }

/**
 * One line per thing the app may do, most important first. Identity scopes
 * collapse into one line; scopes Tradstry doesn't know fall back to Stytch's text.
 */
export function permissions(scopes: Array<{ scope: string; description: string }>): Permission[] {
  const known = Object.keys(PERMISSIONS)
  const lines = [...scopes]
    .filter((result) => !IDENTITY_SCOPES.has(result.scope))
    .sort((a, b) => rank(a.scope, known) - rank(b.scope, known))
    .map((result) => PERMISSIONS[result.scope] ?? { title: result.description || result.scope, detail: '' })
  return scopes.some((result) => IDENTITY_SCOPES.has(result.scope)) ? [...lines, IDENTITY] : lines
}

function rank(scope: string, known: string[]): number {
  const index = known.indexOf(scope)
  return index === -1 ? known.length : index
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Where approving sends the user back, and whether that's an app on this computer. */
export function returnTarget(redirectUri: string): { host: string; local: boolean } | null {
  try {
    const url = new URL(redirectUri)
    const host = url.hostname
    return { host, local: LOOPBACK_HOSTS.has(host) }
  } catch {
    return null
  }
}

/** Sites of well-known apps, for apps that registered without a metadata URL. */
const KNOWN_APP_SITES: Array<[name: RegExp, site: string]> = [
  [/\bclaude\b/i, 'claude.ai'],
  [/\bchatgpt\b|\bopenai\b/i, 'chatgpt.com'],
]

/**
 * Icons to try for the app asking for access, best first: the logo Stytch
 * has for it, else its own site's app icon. Apps using a Client ID Metadata
 * Document have their site in the client ID; others are matched by name.
 */
export function appIcons(client: { client_id: string; client_name: string; client_logo_url?: string }): string[] {
  const icons = client.client_logo_url ? [client.client_logo_url] : []
  let site: string | undefined
  try {
    const url = new URL(client.client_id)
    if (url.protocol === 'https:') site = url.host
  } catch {
    site = KNOWN_APP_SITES.find(([name]) => name.test(client.client_name))?.[1]
  }
  if (site) icons.push(`https://${site}/apple-touch-icon.png`)
  return icons
}
