const SECTIONS: Array<[prefix: string, title: string]> = [
  ['/settings', 'Settings'],
  ['/tax', 'Realized gains'],
]

export type WorkspaceSection = 'home' | 'journal'

export function workspaceSection(pathname: string): WorkspaceSection {
  return pathname === '/' || /^\/w\/[^/]+\/?$/.test(pathname) ? 'home' : 'journal'
}

/** Keep the selected workspace and section when navigating. */
export function workspaceLocation(workspaceId?: string, section: WorkspaceSection = 'journal') {
  if (!workspaceId) return { to: section === 'home' ? ('/' as const) : ('/brokerage' as const) }
  return {
    to: section === 'home' ? ('/w/$workspaceId' as const) : ('/w/$workspaceId/journal' as const),
    params: { workspaceId },
  }
}

export function pageTitle(pathname: string): string {
  if (workspaceSection(pathname) === 'home') return 'Home'
  const match = SECTIONS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return match ? match[1] : 'Journal'
}
