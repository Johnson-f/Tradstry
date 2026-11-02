import { noteText } from '@/lib/client/trades/note-document'
import { fetchTrades } from '@/lib/client/trades/trades'
import { type LabelRef, MARKET_REGIMES, type MarketRegime, type TradeSummary } from '@/lib/client/trades/trades-model'

export interface ExportRow {
  workspace: string
  trade: TradeSummary
}

function yesNo(value: boolean | null | undefined): string {
  return value === true ? 'yes' : value === false ? 'no' : ''
}

function regimeLabel(value: MarketRegime | null): string {
  return MARKET_REGIMES.find((option) => option.value === value)?.label ?? ''
}

const COLUMNS: Array<[header: string, value: (row: ExportRow) => string | number | null]> = [
  ['Workspace', (row) => row.workspace],
  ['Symbol', (row) => row.trade.symbol],
  ['Underlying', (row) => row.trade.underlying],
  ['Asset class', (row) => row.trade.assetClass],
  ['Option', (row) => (row.trade.option ? `${row.trade.option.expiry} ${row.trade.option.right} ${row.trade.option.strike}` : '')],
  ['Direction', (row) => row.trade.direction ?? (row.trade.kind === 'strategy' ? 'strategy' : '')],
  ['Status', (row) => row.trade.status],
  ['Opened', (row) => row.trade.openedAt],
  ['Closed', (row) => row.trade.closedAt],
  ['Max quantity', (row) => row.trade.maxQuantity],
  ['Average entry', (row) => row.trade.avgEntry],
  ['Average exit', (row) => row.trade.avgExit],
  ['Gross P&L', (row) => row.trade.gross],
  ['Fees', (row) => row.trade.fees],
  ['Net P&L', (row) => row.trade.net],
  ['Return %', (row) => row.trade.returnPct],
  ['R-multiple', (row) => row.trade.rMultiple],
  ['Edges', (row) => names(row.trade.annotation?.edges)],
  ['Entry tactics', (row) => names(row.trade.annotation?.entryTactics)],
  ['Tags', (row) => names(row.trade.annotation?.tags)],
  ['Mistakes', (row) => names(row.trade.annotation?.mistakes)],
  ['Initial stop', (row) => row.trade.annotation?.initialStop ?? null],
  ['Planned risk', (row) => row.trade.annotation?.plannedRisk ?? null],
  ['Conviction', (row) => row.trade.annotation?.behavior.conviction ?? null],
  ['Rule adherence', (row) => row.trade.annotation?.behavior.ruleAdherence ?? null],
  ['Market', (row) => regimeLabel(row.trade.annotation?.behavior.marketRegime ?? null)],
  ['Planned pre-market', (row) => yesNo(row.trade.annotation?.behavior.plannedPreMarket)],
  ['Revenge trade', (row) => yesNo(row.trade.annotation?.behavior.revengeTrade)],
  ['Broke 30-minute rule', (row) => yesNo(row.trade.annotation?.behavior.brokeThirtyMinuteRule)],
  ['Notes', (row) => (row.trade.annotation ? noteText(row.trade.annotation.notes).trim() : '')],
]

function names(labels: LabelRef[] | undefined): string {
  return (labels ?? []).map((label) => label.name).join('; ')
}

/** One CSV cell: quoted when it holds a comma, quote or line break. */
export function csvField(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function tradesCsv(rows: ExportRow[]): string {
  const lines = [COLUMNS.map(([header]) => csvField(header)).join(',')]
  for (const row of rows) lines.push(COLUMNS.map(([, value]) => csvField(value(row))).join(','))
  return `${lines.join('\r\n')}\r\n`
}

/** Every trade in every workspace, oldest first within each workspace. */
export async function exportRows(workspaces: Array<{ id: string; name: string }>): Promise<ExportRow[]> {
  const rows: ExportRow[] = []
  for (const workspace of workspaces) {
    const page = await fetchTrades(workspace.id, {}, 'OPENED_ASC')
    rows.push(...page.items.map((trade) => ({ workspace: workspace.name, trade })))
  }
  return rows
}

export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
