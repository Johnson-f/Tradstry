export interface AuthSession {
  id: string
  lastAccessedAt: string | null
  ipAddress: string | null
  userAgent: string | null
  current: boolean
}

export function describeUserAgent(userAgent: string | null): {
  label: string
  isMobile: boolean
} {
  if (!userAgent) return { label: 'Unknown device', isMobile: false }
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : null
  const system = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Mac OS X/.test(userAgent)
        ? 'macOS'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null
  const label =
    browser && system ? `${browser} on ${system}` : (browser ?? system)
  return {
    label: label ?? 'Unknown device',
    isMobile: /Mobile|iPhone|Android/.test(userAgent),
  }
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function lastActive(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Unknown'
  const minutes = Math.round((new Date(iso).getTime() - now) / 60_000)
  if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return RELATIVE.format(hours, 'hour')
  return RELATIVE.format(Math.round(hours / 24), 'day')
}
