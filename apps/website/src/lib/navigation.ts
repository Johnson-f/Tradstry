const SECTIONS: Array<[prefix: string, title: string]> = [
  ['/settings', 'Settings'],
  ['/tax', 'Realized gains'],
]

export type WorkspaceSection = 'home' | 'journal' | 'analytics'

export function workspaceSection(pathname: string): WorkspaceSection {
  if (pathname === '/' || /^\/w\/[^/]+\/?$/.test(pathname)) return 'home'
  return /^\/w\/[^/]+\/analytics(\/|$)/.test(pathname) ? 'analytics' : 'journal'
}

const SECTION_ROUTES = {
  home: '/w/$workspaceId',
  journal: '/w/$workspaceId/journal',
  analytics: '/w/$workspaceId/analytics',
} as const

/** Keep the selected workspace and section when navigating. */
export function workspaceLocation(workspaceId?: string, section: WorkspaceSection = 'journal') {
  if (!workspaceId) return { to: section === 'home' ? ('/' as const) : ('/brokerage' as const) }
  return { to: SECTION_ROUTES[section], params: { workspaceId } }
}

export function pageTitle(pathname: string): string {
  const section = workspaceSection(pathname)
  if (section === 'home') return 'Dashboard'
  if (section === 'analytics') return 'Analytics'
  const match = SECTIONS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return match ? match[1] : 'Journal'
}
