/** Today in the browser's time zone as `YYYY-MM-DD`, the format date inputs use. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/** A `YYYY-MM-DD` value as a local calendar day, or undefined when it is not one. */
export function parseLocalDay(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return localToday(day) === value ? day : undefined
}

export const MARKET_TIME_ZONE = 'America/New_York'

/** Where times are shown; undefined means the browser's own zone. Set from the user's settings. */
let displayTimeZone: string | undefined

export function setDisplayTimeZone(zone: 'MARKET' | 'LOCAL'): void {
  displayTimeZone = zone === 'MARKET' ? MARKET_TIME_ZONE : undefined
}

/** A calendar date stays the same date in every zone; an instant follows the display zone. */
export function formatDate(value: string | null): string {
  if (!value) return '—'
  const plain = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(plain ? `${value}T12:00:00Z` : value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: plain ? 'UTC' : displayTimeZone,
      })
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: displayTimeZone,
      })
}

export function formatNumber(value: number | null, maximumFractionDigits = 4): string {
  return value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits })
}

export function formatMoney(value: number | null, currency: string | null): string {
  if (value === null) return '—'
  if (!currency) return formatNumber(value, 2)
  if (!/^[A-Z]{3}$/.test(currency)) return `${formatNumber(value, 2)} ${currency}`
  try {
    return value.toLocaleString(undefined, { style: 'currency', currency })
  } catch {
    return `${formatNumber(value, 2)} ${currency}`
  }
}
