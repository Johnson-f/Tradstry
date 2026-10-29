const SECTIONS: Array<[prefix: string, title: string]> = [
  ['/settings', 'Settings'],
  ['/brokerage/connections', 'Brokerage'],
  ['/brokerage', 'Journal'],
]

export type WorkspaceSection = 'dashboard' | 'journal'

export function workspaceSection(pathname: string): WorkspaceSection {
  return /^\/w\/[^/]+\/journal(?:\/|$)/.test(pathname) || /^\/brokerage\/?$/.test(pathname)
    ? 'journal'
    : 'dashboard'
}

/** Keep the selected workspace when moving between its Dashboard and Journal. */
export function workspaceLocation(section: WorkspaceSection, workspaceId?: string) {
  if (!workspaceId) return { to: section === 'journal' ? ('/brokerage' as const) : ('/' as const) }
  return {
    to: section === 'journal' ? ('/w/$workspaceId/journal' as const) : ('/w/$workspaceId' as const),
    params: { workspaceId },
  }
}

export function pageTitle(pathname: string): string {
  if (workspaceSection(pathname) === 'journal') return 'Journal'
  const match = SECTIONS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return match ? match[1] : 'Dashboard'
}
