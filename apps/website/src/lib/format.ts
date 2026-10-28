/** Today in the browser's time zone as `YYYY-MM-DD`, the format date inputs use. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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
