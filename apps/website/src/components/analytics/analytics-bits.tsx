import { Link } from '@tanstack/react-router'
import { LabelDot } from '@/components/trades/label-picker'
import { Pnl } from '@/components/trades/trade-bits'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dataTableClass, numericCell } from '@/components/ui/table-styles'
import type { Bucket } from '@/lib/client/analytics/stats'
import { TONE_CLASS, money, percent, rMultiple, tone } from '@/lib/client/trades/trades-model'

/** Filters the Journal accepts in its URL. */
export interface JournalFilter {
  symbol?: string
  closedFrom?: string
  closedTo?: string
  edgeId?: string
  entryTacticId?: string
  tagId?: string
  mistakeId?: string
}

/** A small headline number inside a card. */
export function Stat({ label, value, detail }: { label: string; value: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border bg-background/70 px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  )
}

/** A row name that opens the Journal filtered to it, when it can be. */
export function RowName({
  name,
  color,
  workspaceId,
  filter,
}: {
  name: string
  color?: string | null
  workspaceId: string
  filter?: JournalFilter
}) {
  const content = (
    <span className="flex min-w-0 items-center gap-2">
      {color !== undefined && <LabelDot color={color} />}
      <span className="truncate">{name}</span>
    </span>
  )
  if (!filter) return content
  return (
    <Link
      to="/w/$workspaceId/journal"
      params={{ workspaceId }}
      search={filter}
      aria-label={`Open ${name} in the journal`}
      className="block rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      {content}
    </Link>
  )
}

/** Trades, win rate, net, expectancy and average R for each group. */
export function ResultsTable({
  label,
  rows,
  name,
}: {
  label: string
  rows: Bucket[]
  name: (row: Bucket) => React.ReactNode
}) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table className={dataTableClass} aria-label={`Results by ${label.toLowerCase()}`}>
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead scope="col">{label}</TableHead>
            <TableHead scope="col" className={numericCell}>
              Trades
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Win rate
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Net P&amp;L
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Expectancy
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Avg R
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.labelId ?? row.key}>
              <TableCell className="max-w-64">{name(row)}</TableCell>
              <TableCell className={numericCell}>{row.trades}</TableCell>
              <TableCell className={numericCell}>{percent(row.winRate, { ratio: true })}</TableCell>
              <TableCell className={numericCell}>
                <Pnl value={row.net} />
              </TableCell>
              <TableCell className={numericCell}>
                <Pnl value={row.expectancy} />
              </TableCell>
              <TableCell className={`${numericCell} ${TONE_CLASS[tone(row.expectancyR)]}`}>
                {rMultiple(row.expectancyR)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Expectancy, trades, win rate and net side by side for two or more groups. */
export function Comparison({ rows }: { rows: Bucket[] }) {
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border bg-background/70 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">{row.key}</p>
          <p className="mt-2 text-xl font-semibold">
            <Pnl value={row.expectancy} />
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">per trade</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.trades} {row.trades === 1 ? 'trade' : 'trades'} · {percent(row.winRate, { ratio: true })} win rate ·{' '}
            {money(row.net, { signed: true })}
          </p>
        </div>
      ))}
    </div>
  )
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-xl border border-dashed bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}
