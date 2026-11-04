import { money } from '@/lib/client/trades/trades-model'

export function toneClass(value: number) {
  if (value > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (value < 0) return 'text-rose-600 dark:text-rose-400'
  return ''
}

export function usd(value: number, options: { signed?: boolean } = {}) {
  return money(String(value), options)
}
