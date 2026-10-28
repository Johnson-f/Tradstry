const SECTIONS: Array<[prefix: string, title: string]> = [
  ['/settings', 'Settings'],
  ['/brokerage', 'Brokerage'],
]

export function pageTitle(pathname: string): string {
  const match = SECTIONS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  return match ? match[1] : 'Dashboard'
}
