import type { TradeSummary } from './trades-model'

export interface TradePage {
  total: number
  items: TradeSummary[]
}

/** The API caps each response at 200 trades; the Journal displays the full list. */
export async function loadAllTrades(
  loadPage: (offset: number, limit: number) => Promise<TradePage>,
): Promise<TradePage> {
  const items: TradeSummary[] = []
  let total: number
  do {
    const page = await loadPage(items.length, 200)
    total = page.total
    if (page.items.length === 0 && items.length < total) {
      throw new Error('Could not load the complete trade list.')
    }
    items.push(...page.items)
  } while (items.length < total)
  return { total, items }
}
