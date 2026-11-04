import { createFileRoute } from '@tanstack/react-router'
import { CircleAlert, Plus, RefreshCw, Search, X } from 'lucide-react'
import { useId, useState } from 'react'
import { AttentionPanel } from '@/components/trades/attention-panel'
import { FillDialog } from '@/components/trades/fill-dialog'
import { OpeningDialog } from '@/components/trades/opening-dialog'
import { ChoiceField, Pnl } from '@/components/trades/trade-bits'
import { TradesTable } from '@/components/trades/trades-table'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { dayLabel, marketMidnight, shiftDays } from '@/lib/client/home/home-model'
import { labelsOf, useJournalLabels } from '@/lib/client/trades/labels'
import {
  type TradeFilter,
  type TradeSort,
  useIsManualWorkspace,
  useTrades,
} from '@/lib/client/trades/trades'
import { useTradeStats } from '@/lib/client/analytics/stats'
import { type LabelKind } from '@/lib/client/trades/trades-model'

const DAY = /^\d{4}-\d{2}-\d{2}$/

type LabelFilterKey = 'edgeId' | 'entryTacticId' | 'tagId' | 'mistakeId'

const LABEL_KEYS: LabelFilterKey[] = ['edgeId', 'entryTacticId', 'tagId', 'mistakeId']

interface JournalSearch extends Partial<Record<LabelFilterKey, string>> {
  symbol?: string
  /** Inclusive New York trading days, `YYYY-MM-DD`. */
  closedFrom?: string
  closedTo?: string
}

export const Route = createFileRoute('/_authenticated/w/$workspaceId/journal/')({
  validateSearch: (search: Record<string, unknown>): JournalSearch => {
    const day = (value: unknown) => (typeof value === 'string' && DAY.test(value) ? value : undefined)
    const closedFrom = day(search.closedFrom)
    return {
      ...(typeof search.symbol === 'string' && search.symbol.trim() ? { symbol: search.symbol.trim() } : {}),
      ...(closedFrom ? { closedFrom, closedTo: day(search.closedTo) ?? closedFrom } : {}),
      ...Object.fromEntries(
        LABEL_KEYS.flatMap((key) => {
          const value = search[key]
          return typeof value === 'string' && value ? [[key, value]] : []
        }),
      ),
    }
  },
  component: Journal,
})

function closedLabel(range: { from: string; to: string }): string {
  return range.from === range.to
    ? dayLabel(range.from, 'year')
    : `${dayLabel(range.from, 'year')} – ${dayLabel(range.to, 'year')}`
}

const ALL = 'all'

const LABEL_FILTERS: Array<{ key: LabelFilterKey; kind: LabelKind; any: string; label: string }> = [
  { key: 'edgeId', kind: 'EDGE', any: 'Any edge', label: 'Edge' },
  { key: 'entryTacticId', kind: 'ENTRY_TACTIC', any: 'Any entry tactic', label: 'Entry tactic' },
  { key: 'tagId', kind: 'TAG', any: 'Any tag', label: 'Tag' },
  { key: 'mistakeId', kind: 'MISTAKE', any: 'Any mistake', label: 'Mistake' },
]

const NO_LABELS: Record<LabelFilterKey, string> = { edgeId: ALL, entryTacticId: ALL, tagId: ALL, mistakeId: ALL }

type RetryTarget = 'journal' | 'stats' | 'trades'

function Journal() {
  const { workspaceId } = Route.useParams()
  const search = Route.useSearch()
  const id = useId()
  const manual = useIsManualWorkspace(workspaceId)
  const labels = useJournalLabels()
  const stats = useTradeStats(workspaceId, null)
  const [status, setStatus] = useState(ALL)
  const [direction, setDirection] = useState(ALL)
  const [labelFilter, setLabelFilter] = useState(() => ({
    ...NO_LABELS,
    ...Object.fromEntries(LABEL_KEYS.flatMap((key) => (search[key] ? [[key, search[key]]] : []))),
  }))
  const [symbol, setSymbol] = useState(search.symbol ?? '')
  const [closed, setClosed] = useState(
    search.closedFrom ? { from: search.closedFrom, to: search.closedTo ?? search.closedFrom } : null,
  )
  const [sort, setSort] = useState<TradeSort>('OPENED_DESC')
  const [dialog, setDialog] = useState<'fill' | 'opening' | null>(null)
  const [retrying, setRetrying] = useState<{ workspaceId: string; target: RetryTarget } | null>(null)
  const filter: TradeFilter = {
    status: status === ALL ? null : status,
    direction: direction === ALL ? null : direction,
    symbol: symbol.trim() || null,
    ...Object.fromEntries(Object.entries(labelFilter).map(([key, value]) => [key, value === ALL ? null : value])),
    closedFrom: closed ? marketMidnight(closed.from) : null,
    closedTo: closed ? marketMidnight(shiftDays(closed.to, 1)) : null,
  }
  const filtered =
    status !== ALL ||
    direction !== ALL ||
    symbol.trim() !== '' ||
    closed !== null ||
    Object.values(labelFilter).some((v) => v !== ALL)
  const trades = useTrades(workspaceId, filter, sort)
  const summary = stats.isPlaceholderData ? undefined : stats.data
  const summaryLoading = stats.isPending || stats.isPlaceholderData
  const retryTarget = retrying?.workspaceId === workspaceId ? retrying.target : null
  const statsFailed = stats.isError || retryTarget === 'stats' || retryTarget === 'journal'
  const tradesFailed = trades.isError || retryTarget === 'trades' || retryTarget === 'journal'
  const journalFailed = (statsFailed && !summary && tradesFailed && !trades.data) || retryTarget === 'journal'
  const statsUnavailable = statsFailed && !summary
  const retry = async (target: RetryTarget) => {
    if (retryTarget) return
    const attempt = { workspaceId, target }
    setRetrying(attempt)
    try {
      await Promise.all([
        ...(target !== 'trades' ? [stats.refetch()] : []),
        ...(target !== 'stats' ? [trades.refetch()] : []),
      ])
    } finally {
      setRetrying((current) => (current === attempt ? null : current))
    }
  }

  return (
    <div className="w-full space-y-5 pb-10 font-sans sm:px-3">
      <div className="flex flex-wrap items-center gap-x-12 gap-y-5 xl:gap-x-20">
        <div className="shrink-0">
          <h1 className="text-2xl leading-8 font-semibold tracking-tight">Journal</h1>
          {!journalFailed && (
            <p className="mt-2 text-[15px] leading-6 text-muted-foreground">
              {summary ? `${summary.trades} closed trades · All time` : 'All-time closed trades'}
            </p>
          )}
        </div>
        {!journalFailed && !statsUnavailable && (
          <dl
            aria-label="All-time results for closed trades"
            className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-3"
          >
            {[
              { label: 'Net P&L', value: summary?.net },
              { label: 'Total profit', value: summary?.grossProfit },
              { label: 'Total loss', value: summary?.grossLoss },
            ].map(({ label, value }) => (
              <Card
                key={label}
                className="gap-2 rounded-xl bg-muted/20 px-4 py-3 shadow-none ring-foreground/8 sm:min-w-40"
              >
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-xl leading-7 font-semibold tracking-tight">
                  {summaryLoading ? (
                    <>
                      <Skeleton className="h-7 w-24" />
                      <span className="sr-only">Loading {label}</span>
                    </>
                  ) : (
                    <Pnl value={value ?? null} />
                  )}
                </dd>
              </Card>
            ))}
          </dl>
        )}
        {!journalFailed && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDialog('opening')}>
              <Plus aria-hidden />
              Add opening position
            </Button>
            {manual && (
              <Button size="sm" onClick={() => setDialog('fill')}>
                <Plus aria-hidden />
                Add fill
              </Button>
            )}
          </div>
        )}
      </div>
      {journalFailed ? (
        <JournalLoadError
          title="Unable to load your journal"
          description="Try again in a moment, or get help if this keeps happening."
          pending={retryTarget === 'journal' || stats.isFetching || trades.isFetching}
          disabled={retryTarget !== null}
          onRetry={() => void retry('journal')}
        />
      ) : (
        <>
          {statsFailed && (
            <JournalLoadError
              compact
              title={summary ? 'Results may be out of date' : 'Results are unavailable'}
              description={
                summary
                  ? 'We couldn’t refresh your totals. Showing the last loaded results.'
                  : 'Your profit and loss totals couldn’t be loaded. You can still review your trades.'
              }
              pending={retryTarget === 'stats' || stats.isFetching}
              disabled={retryTarget !== null}
              onRetry={() => void retry('stats')}
            />
          )}
          <section aria-label="Trades" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Label htmlFor={`${id}-symbol`} className="sr-only">
                  Symbol
                </Label>
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
                />
                <Input
                  id={`${id}-symbol`}
                  value={symbol}
                  placeholder="Search symbol"
                  onChange={(event) => setSymbol(event.target.value)}
                  className="h-8 w-44 border-border/60 pl-8 text-[13px] placeholder:normal-case"
                />
              </div>
              <ChoiceField
                id={`${id}-status`}
                label="Status"
                hideLabel
                className="h-8 w-36 border-transparent bg-transparent text-[13px] text-muted-foreground hover:bg-muted/60"
                value={status}
                onChange={setStatus}
                choices={[
                  { value: ALL, label: 'All statuses' },
                  { value: 'open', label: 'Open' },
                  { value: 'closed', label: 'Closed' },
                  { value: 'incomplete', label: 'Missing history' },
                ]}
              />
              <ChoiceField
                id={`${id}-direction`}
                label="Side"
                hideLabel
                className="h-8 w-36 border-transparent bg-transparent text-[13px] text-muted-foreground hover:bg-muted/60"
                value={direction}
                onChange={setDirection}
                choices={[
                  { value: ALL, label: 'Long and short' },
                  { value: 'long', label: 'Long' },
                  { value: 'short', label: 'Short' },
                ]}
              />
              {LABEL_FILTERS.map(({ key, kind, any, label }) => {
                const choices = labelsOf(labels.data, kind)
                if (choices.length === 0) return null
                return (
                  <ChoiceField
                    key={key}
                    id={`${id}-${key}`}
                    label={label}
                    hideLabel
                    className="h-8 w-40 border-transparent bg-transparent text-[13px] text-muted-foreground hover:bg-muted/60"
                    value={labelFilter[key]}
                    onChange={(value) => setLabelFilter((current) => ({ ...current, [key]: value }))}
                    choices={[
                      { value: ALL, label: any },
                      ...choices.map((l) => ({ value: l.id, label: l.archived ? `${l.name} (archived)` : l.name })),
                    ]}
                  />
                )
              })}
              {closed && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 gap-1.5"
                  aria-label={`Closed ${closedLabel(closed)}. Remove this filter`}
                  onClick={() => setClosed(null)}
                >
                  Closed {closedLabel(closed)}
                  <X aria-hidden />
                </Button>
              )}
              <ChoiceField
                id={`${id}-sort`}
                label="Sort"
                hideLabel
                className="h-8 w-36 border-transparent bg-transparent text-[13px] text-muted-foreground hover:bg-muted/60"
                value={sort}
                onChange={setSort}
                choices={[
                  { value: 'OPENED_DESC', label: 'Newest first' },
                  { value: 'OPENED_ASC', label: 'Oldest first' },
                  { value: 'NET_DESC', label: 'Best first' },
                  { value: 'NET_ASC', label: 'Worst first' },
                ]}
              />
              {(!tradesFailed || trades.data) && <AttentionPanel workspaceId={workspaceId} />}
            </div>

            {tradesFailed && (
              <JournalLoadError
                compact={Boolean(trades.data)}
                title={trades.data ? 'Trades may be out of date' : 'Unable to load trades'}
                description={
                  trades.data
                    ? 'We couldn’t refresh your trades. Showing the last loaded list.'
                    : 'We couldn’t retrieve your trades. Your filters are kept, so you can try again.'
                }
                pending={retryTarget === 'trades' || trades.isFetching}
                disabled={retryTarget !== null}
                onRetry={() => void retry('trades')}
              />
            )}
            {trades.isPending && !tradesFailed ? (
              <Skeleton className="h-64 rounded-none" aria-label="Loading trades" />
            ) : !trades.data ? null : trades.data.items.length === 0 ? (
              <Card className="items-center gap-2 px-6 py-12 text-center shadow-none">
                <h2 className="font-medium">
                  {trades.data.total === 0 && !filtered ? 'No trades yet' : 'No trades match'}
                </h2>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  {manual
                    ? 'Add the buys and sells you made, and Tradstry turns them into trades.'
                    : 'Trades appear here once your brokerage history is imported.'}
                </p>
              </Card>
            ) : (
              <div className={trades.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}>
                <TradesTable workspaceId={workspaceId} trades={trades.data.items} />
              </div>
            )}
          </section>
        </>
      )}

      {dialog === 'fill' && <FillDialog workspaceId={workspaceId} onClose={() => setDialog(null)} />}
      {dialog === 'opening' && <OpeningDialog workspaceId={workspaceId} onClose={() => setDialog(null)} />}
    </div>
  )
}

function JournalLoadError({
  title,
  description,
  onRetry,
  pending,
  disabled,
  compact = false,
}: {
  title: string
  description: string
  onRetry: () => void
  pending: boolean
  disabled: boolean
  compact?: boolean
}) {
  const id = useId()

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={compact ? undefined : 'flex min-h-[min(32rem,65dvh)] items-center justify-center py-6'}
    >
      <Card
        className={
          compact
            ? 'flex-row flex-wrap items-center gap-4 rounded-xl bg-muted/20 p-4 shadow-none ring-border/70'
            : 'w-full max-w-md items-center gap-6 rounded-2xl p-8 text-center shadow-none ring-border/70 sm:p-10'
        }
      >
        <div
          className={
            compact
              ? 'flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background'
              : 'flex size-14 items-center justify-center rounded-2xl border border-border/70 bg-muted/30'
          }
        >
          <CircleAlert
            className={compact ? 'size-4 text-muted-foreground' : 'size-7 text-muted-foreground'}
            strokeWidth={1.5}
            aria-hidden
          />
        </div>
        <div role="alert" className={compact ? 'min-w-40 flex-1 space-y-1' : 'space-y-2'}>
          <h2 id={`${id}-title`} className={compact ? 'text-sm font-medium' : 'text-xl font-semibold tracking-tight'}>
            {title}
          </h2>
          <p
            className={
              compact ? 'text-xs leading-5 text-muted-foreground' : 'max-w-72 text-sm leading-6 text-muted-foreground'
            }
          >
            {description}
          </p>
        </div>
        <div className={compact ? 'ml-auto flex shrink-0' : 'flex w-full flex-col justify-center gap-2 sm:flex-row'}>
          <Button
            type="button"
            variant={compact ? 'outline' : 'default'}
            className="h-9 gap-2 px-4"
            disabled={disabled || pending}
            aria-busy={pending}
            onClick={onRetry}
          >
            <RefreshCw className={`size-3.5 ${pending ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
            {pending ? 'Trying again…' : 'Try again'}
          </Button>
          {!compact && (
            <Button
              variant="outline"
              className="h-9 px-4"
              nativeButton={false}
              render={<a href="https://tradstry.com/support" target="_blank" rel="noreferrer" />}
            >
              Get help
            </Button>
          )}
        </div>
      </Card>
    </section>
  )
}
