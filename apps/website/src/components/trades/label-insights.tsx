import { LabelDot } from '@/components/trades/label-picker'
import { Pnl } from '@/components/trades/trade-bits'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dataTableClass, numericCell } from '@/components/ui/table-styles'
import type { Bucket, EdgeTacticCell, TradeStats } from '@/lib/client/trades/trades'
import {
  type LabelKind,
  type LabelRef,
  TONE_CLASS,
  money,
  percent,
  rMultiple,
  toNumber,
  tone,
} from '@/lib/client/trades/trades-model'

export type LabelFilterKey = 'edgeId' | 'entryTacticId' | 'tagId' | 'mistakeId'

const FILTER_KEY: Record<LabelKind, LabelFilterKey> = {
  EDGE: 'edgeId',
  ENTRY_TACTIC: 'entryTacticId',
  TAG: 'tagId',
  MISTAKE: 'mistakeId',
}

const NONE = 'None'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function LabelName({
  name,
  color,
  onShow,
}: {
  name: string
  color: string | null
  onShow?: () => void
}) {
  const content = (
    <span className="flex min-w-0 items-center gap-2">
      <LabelDot color={color} />
      <span className="truncate">{name}</span>
    </span>
  )
  if (!onShow) return <span className="text-muted-foreground">{content}</span>
  return (
    <button
      type="button"
      onClick={onShow}
      className="rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      {content}
    </button>
  )
}

function BucketTable({
  label,
  buckets,
  kind,
  onShow,
}: {
  label: string
  buckets: Bucket[]
  kind: LabelKind
  onShow: (key: LabelFilterKey, id: string) => void
}) {
  return (
    <Card className="gap-0 py-0 shadow-none">
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
          {buckets.map((bucket) => (
            <TableRow key={bucket.labelId ?? NONE}>
              <TableCell className="max-w-56">
                <LabelName
                  name={bucket.labelId ? bucket.key : `No ${label.toLowerCase()}`}
                  color={bucket.color}
                  onShow={bucket.labelId ? () => onShow(FILTER_KEY[kind], bucket.labelId as string) : undefined}
                />
              </TableCell>
              <TableCell className={numericCell}>{bucket.trades}</TableCell>
              <TableCell className={numericCell}>{percent(bucket.winRate, { ratio: true })}</TableCell>
              <TableCell className={numericCell}>
                <Pnl value={bucket.net} />
              </TableCell>
              <TableCell className={numericCell}>
                <Pnl value={bucket.expectancy} />
              </TableCell>
              <TableCell className={`${numericCell} ${TONE_CLASS[tone(bucket.expectancyR)]}`}>
                {rMultiple(bucket.expectancyR)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function Matrix({ cells, onShow }: { cells: EdgeTacticCell[]; onShow: (key: LabelFilterKey, id: string) => void }) {
  const unique = (labels: Array<LabelRef | null>) => {
    const seen = new Map<string, LabelRef | null>()
    for (const label of labels) seen.set(label?.id ?? NONE, label)
    return [...seen.values()]
  }
  const edges = unique(cells.map((c) => c.edge))
  const tactics = unique(cells.map((c) => c.entryTactic))
  const cellOf = (edge: LabelRef | null, tactic: LabelRef | null) =>
    cells.find((c) => (c.edge?.id ?? NONE) === (edge?.id ?? NONE) && (c.entryTactic?.id ?? NONE) === (tactic?.id ?? NONE))

  return (
    <Card className="gap-0 overflow-x-auto py-0 shadow-none">
      <Table className={dataTableClass} aria-label="Net P&L by edge and entry tactic">
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead scope="col">Edge \ Entry</TableHead>
            {tactics.map((tactic) => (
              <TableHead key={tactic?.id ?? NONE} scope="col" className={numericCell}>
                {tactic?.name ?? 'No tactic'}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {edges.map((edge) => (
            <TableRow key={edge?.id ?? NONE}>
              <TableHead scope="row" className="font-normal text-foreground">
                <LabelName name={edge?.name ?? 'No edge'} color={edge?.color ?? null} onShow={edge ? () => onShow('edgeId', edge.id) : undefined} />
              </TableHead>
              {tactics.map((tactic) => {
                const cell = cellOf(edge, tactic)
                return (
                  <TableCell key={tactic?.id ?? NONE} className={numericCell}>
                    {cell ? (
                      <span className="flex flex-col items-end gap-0.5">
                        <Pnl value={cell.net} />
                        <span className="text-[11px] text-muted-foreground">
                          {cell.trades} {cell.trades === 1 ? 'trade' : 'trades'} · {percent(cell.winRate, { ratio: true })}
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
    </Card>
  )
}

function MistakeCosts({
  stats,
  onShow,
}: {
  stats: TradeStats
  onShow: (key: LabelFilterKey, id: string) => void
}) {
  return (
    <Card className="gap-0 py-0 shadow-none">
      <Table className={dataTableClass} aria-label="What each mistake cost">
        <TableHeader className="bg-muted/30">
          <TableRow>
            <TableHead scope="col">Mistake</TableHead>
            <TableHead scope="col" className={numericCell}>
              Trades
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Net P&amp;L
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Expectancy with
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Without
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stats.mistakeCosts.map((cost) => (
            <TableRow key={cost.mistake.id}>
              <TableCell className="max-w-56">
                <LabelName name={cost.mistake.name} color={cost.mistake.color} onShow={() => onShow('mistakeId', cost.mistake.id)} />
              </TableCell>
              <TableCell className={numericCell}>{cost.trades}</TableCell>
              <TableCell className={numericCell}>
                <Pnl value={cost.net} />
              </TableCell>
              <TableCell className={numericCell}>
                <Pnl value={cost.expectancyWith} />
              </TableCell>
              <TableCell className={numericCell}>
                <Pnl value={cost.expectancyWithout} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function costliest(stats: TradeStats): string | null {
  const [worst] = [...stats.mistakeCosts].sort((a, b) => (toNumber(a.net) ?? 0) - (toNumber(b.net) ?? 0))
  if (!worst || (toNumber(worst.net) ?? 0) >= 0) return null
  return `“${worst.mistake.name}” cost ${money(worst.net)} over ${worst.trades} ${worst.trades === 1 ? 'trade' : 'trades'}.`
}

/** Closed-trade results broken down by the journal's labels. */
export function LabelInsights({
  stats,
  loading,
  onShow,
}: {
  stats: TradeStats | undefined
  loading: boolean
  onShow: (key: LabelFilterKey, id: string) => void
}) {
  if (loading || !stats) {
    return (
      <div className="space-y-4" aria-label="Loading insights">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  const labelled = stats.trades - stats.untagged
  if (stats.trades === 0) {
    return (
      <Card className="items-center gap-2 px-6 py-12 text-center shadow-none">
        <h2 className="font-medium">No closed trades yet</h2>
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Results by edge, entry tactic and mistake appear once trades close.
        </p>
      </Card>
    )
  }
  if (labelled === 0 && stats.byTag.length === 0 && stats.mistakeCosts.length === 0) {
    return (
      <Card className="items-center gap-2 px-6 py-12 text-center shadow-none">
        <h2 className="font-medium">Label your trades to see what works</h2>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          Open a trade, choose Trade note, then Trade details. Note what gave it an advantage, what triggered your
          entry, and any mistakes. Results are broken down here.
        </p>
      </Card>
    )
  }
  const worst = costliest(stats)
  return (
    <div className="space-y-7">
      <p className="text-sm text-muted-foreground">
        {labelled} of {stats.trades} closed trades have an edge. A trade with several edges or entry tactics counts
        under each.
        {worst && ` ${worst}`}
      </p>
      <Section title="By edge">
        <BucketTable label="Edge" kind="EDGE" buckets={stats.byEdge} onShow={onShow} />
      </Section>
      <Section title="By entry tactic">
        <BucketTable label="Entry tactic" kind="ENTRY_TACTIC" buckets={stats.byEntryTactic} onShow={onShow} />
      </Section>
      {stats.edgeTactic.length > 1 && (
        <Section
          title="Edge and entry tactic"
          description="Net P&L for each pair, with trade count and win rate. A trade counts in every pair it has."
        >
          <Matrix cells={stats.edgeTactic} onShow={onShow} />
        </Section>
      )}
      {stats.mistakeCosts.length > 0 && (
        <Section
          title="Mistakes"
          description="Expectancy of trades with the mistake, against every other closed trade."
        >
          <MistakeCosts stats={stats} onShow={onShow} />
        </Section>
      )}
      {stats.byTag.length > 0 && (
        <Section title="By tag" description="A trade with several tags counts under each.">
          <BucketTable label="Tag" kind="TAG" buckets={stats.byTag} onShow={onShow} />
        </Section>
      )}
    </div>
  )
}
