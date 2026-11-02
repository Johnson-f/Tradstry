import { useState } from 'react'
import { type JournalFilter, EmptyNote, ResultsTable, RowName } from '@/components/analytics/analytics-bits'
import { DashboardCard } from '@/components/home/dashboard-card'
import { Pnl } from '@/components/trades/trade-bits'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dataTableClass, numericCell } from '@/components/ui/table-styles'
import type { Bucket, EdgeTacticCell, TradeStats } from '@/lib/client/analytics/stats'
import { type LabelRef, percent } from '@/lib/client/trades/trades-model'

type Dimension =
  | 'symbol'
  | 'edge'
  | 'entryTactic'
  | 'tag'
  | 'session'
  | 'weekday'
  | 'hour'
  | 'hold'
  | 'size'
  | 'direction'

const DIMENSIONS: Array<{ value: Dimension; label: string; rows: (stats: TradeStats) => Bucket[] }> = [
  { value: 'symbol', label: 'Symbol', rows: (stats) => stats.bySymbol },
  { value: 'edge', label: 'Edge', rows: (stats) => stats.byEdge },
  { value: 'entryTactic', label: 'Entry tactic', rows: (stats) => stats.byEntryTactic },
  { value: 'tag', label: 'Tag', rows: (stats) => stats.byTag },
  { value: 'session', label: 'Session', rows: (stats) => stats.bySession },
  { value: 'weekday', label: 'Weekday', rows: (stats) => stats.byWeekday },
  { value: 'hour', label: 'Hour', rows: (stats) => stats.byHour },
  { value: 'hold', label: 'Hold time', rows: (stats) => stats.byHold },
  { value: 'size', label: 'Position size', rows: (stats) => stats.bySize },
  { value: 'direction', label: 'Direction', rows: (stats) => stats.byDirection },
]

const LABEL_FILTER: Partial<Record<Dimension, keyof JournalFilter>> = {
  edge: 'edgeId',
  entryTactic: 'entryTacticId',
  tag: 'tagId',
}

const WEEKDAY_NAMES: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
}

const NONE = 'None'

function displayName(dimension: Dimension, row: Bucket): string {
  if (dimension === 'weekday') return WEEKDAY_NAMES[row.key] ?? row.key
  if (dimension === 'hour') return `${row.key} New York`
  if (dimension === 'direction') return row.key.charAt(0).toUpperCase() + row.key.slice(1)
  if (LABEL_FILTER[dimension] && !row.labelId) return `No ${DIMENSIONS.find((d) => d.value === dimension)?.label.toLowerCase()}`
  return row.key
}

function Matrix({
  cells,
  workspaceId,
  rangeStart,
}: {
  cells: EdgeTacticCell[]
  workspaceId: string
  rangeStart: string | null
}) {
  const unique = (labels: Array<LabelRef | null>) => {
    const seen = new Map<string, LabelRef | null>()
    for (const label of labels) seen.set(label?.id ?? NONE, label)
    return [...seen.values()]
  }
  const edges = unique(cells.map((c) => c.edge))
  const tactics = unique(cells.map((c) => c.entryTactic))
  const cellOf = (edge: LabelRef | null, tactic: LabelRef | null) =>
    cells.find(
      (c) => (c.edge?.id ?? NONE) === (edge?.id ?? NONE) && (c.entryTactic?.id ?? NONE) === (tactic?.id ?? NONE),
    )
  const since = rangeStart ? { closedFrom: rangeStart } : {}

  return (
    <div className="mt-4 overflow-x-auto rounded-xl border">
      <Table className={dataTableClass} aria-label="Net P&L by edge and entry tactic">
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead scope="col">Edge \ Entry tactic</TableHead>
            {tactics.map((tactic) => (
              <TableHead key={tactic?.id ?? NONE} scope="col" className={numericCell}>
                {tactic?.name ?? 'No entry tactic'}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {edges.map((edge) => (
            <TableRow key={edge?.id ?? NONE}>
              <TableHead scope="row" className="font-normal text-foreground">
                <RowName
                  name={edge?.name ?? 'No edge'}
                  color={edge?.color ?? null}
                  workspaceId={workspaceId}
                  filter={edge ? { edgeId: edge.id, ...since } : undefined}
                />
              </TableHead>
              {tactics.map((tactic) => {
                const cell = cellOf(edge, tactic)
                return (
                  <TableCell key={tactic?.id ?? NONE} className={numericCell}>
                    {cell ? (
                      <span className="flex flex-col items-end gap-0.5">
                        <Pnl value={cell.net} />
                        <span className="text-[11px] text-muted-foreground">
                          {cell.trades} {cell.trades === 1 ? 'trade' : 'trades'} ·{' '}
                          {percent(cell.winRate, { ratio: true })}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Where results come from: any one property of a trade, and edges against entry tactics. */
export function EdgesTab({
  stats,
  phrase,
  workspaceId,
  rangeStart,
}: {
  stats: TradeStats
  phrase: string
  workspaceId: string
  /** First trading day of the range, `YYYY-MM-DD`, or null for all history. */
  rangeStart: string | null
}) {
  const [dimension, setDimension] = useState<Dimension>('symbol')
  const chosen = DIMENSIONS.find((option) => option.value === dimension) ?? DIMENSIONS[0]
  const rows = chosen.rows(stats)
  const since = rangeStart ? { closedFrom: rangeStart } : {}
  const filterFor = (row: Bucket): JournalFilter | undefined => {
    if (dimension === 'symbol') return { symbol: row.key, ...since }
    const key = LABEL_FILTER[dimension]
    return key && row.labelId ? { [key]: row.labelId, ...since } : undefined
  }

  return (
    <div className="flex flex-col gap-4">
      <DashboardCard
        title="Breakdowns"
        description="Results grouped by one property of each trade. Times are New York; a trade with several labels counts under each."
        formula="Expectancy = net P&L ÷ trades; win rate excludes breakeven trades"
        aside={phrase}
      >
        <div role="radiogroup" aria-label="Group by" className="mt-4 flex flex-wrap gap-1">
          {DIMENSIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={dimension === option.value}
              onClick={() => setDimension(option.value)}
              className="h-7 rounded-lg border px-2.5 text-xs text-muted-foreground outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-checked:border-foreground/20 aria-checked:bg-muted aria-checked:font-medium aria-checked:text-foreground"
            >
              {option.label}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <EmptyNote>
            {LABEL_FILTER[dimension]
              ? `No trades in the ${phrase} have this label yet. Add labels in a trade’s details.`
              : `No trades closed in the ${phrase}.`}
          </EmptyNote>
        ) : (
          <div className="mt-4">
            <ResultsTable
              label={chosen.label}
              rows={rows}
              name={(row) => (
                <RowName
                  name={displayName(dimension, row)}
                  color={LABEL_FILTER[dimension] ? row.color : undefined}
                  workspaceId={workspaceId}
                  filter={filterFor(row)}
                />
              )}
            />
          </div>
        )}
      </DashboardCard>

      <DashboardCard
        title="Edge and entry tactic"
        description="Net P&L for each pair, with trade count and win rate. A trade counts in every pair its labels make."
        formula="Cell = Σ P&L of trades with that edge and entry tactic"
        aside={phrase}
      >
        {stats.edgeTactic.length <= 1 ? (
          <EmptyNote>Label trades with edges and entry tactics to compare the pairs.</EmptyNote>
        ) : (
          <Matrix cells={stats.edgeTactic} workspaceId={workspaceId} rangeStart={rangeStart} />
        )}
      </DashboardCard>
    </div>
  )
}
