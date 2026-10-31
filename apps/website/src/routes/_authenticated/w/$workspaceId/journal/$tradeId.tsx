import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight, CircleAlert, CircleCheck, Clock3, Plus } from 'lucide-react'
import { Fragment, useCallback, useId, useRef, useState } from 'react'
import { DecisionDialog } from '@/components/trades/decision-dialog'
import { FillDialog } from '@/components/trades/fill-dialog'
import { TradeExecutionChart } from '@/components/trades/trade-execution-chart'
import { TradeNotePanel } from '@/components/trades/trade-note-panel'
import { LabelDot } from '@/components/trades/label-picker'
import { DirectionBadge, Pnl } from '@/components/trades/trade-bits'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dataTableClass, numericCell } from '@/components/ui/table-styles'
import { type TradeDetail, type TradeLot, useManualFills, useTrade } from '@/lib/client/trades/trades'
import {
  FILL_ROLE_LABEL,
  type LabelRef,
  STATUS_LABEL,
  type TradeAnnotation,
  type TradeSummary,
  directionLabel,
  holdTime,
  instrumentLabel,
  issueTitle,
  manualFillId,
  money,
  percent,
  price,
  quantity,
  rMultiple,
  toNumber,
  tradeErrorMessage,
} from '@/lib/client/trades/trades-model'
import { formatDate, formatDateTime } from '@/lib/format'

export const Route = createFileRoute('/_authenticated/w/$workspaceId/journal/$tradeId')({
  component: TradePage,
})

function TradePage() {
  const { workspaceId, tradeId } = Route.useParams()
  return <TradeWorkspace key={`${workspaceId}:${tradeId}`} workspaceId={workspaceId} tradeId={tradeId} />
}

function TradeWorkspace({ workspaceId, tradeId }: { workspaceId: string; tradeId: string }) {
  const detail = useTrade(workspaceId, tradeId)
  const id = useId()
  const frame = useRef<HTMLDivElement>(null)
  const noteButton = useRef<HTMLButtonElement>(null)
  const flushNote = useRef<(() => Promise<boolean>) | null>(null)
  const onFlushChange = useCallback((flush: (() => Promise<boolean>) | null) => {
    flushNote.current = flush
  }, [])
  const [noteOpen, setNoteOpen] = useState(false)
  const [tradeWidth, setTradeWidth] = useState(50)
  const showNote = noteOpen && Boolean(detail.data)
  const closeNote = async () => {
    if (flushNote.current && !(await flushNote.current())) return
    setNoteOpen(false)
    requestAnimationFrame(() => noteButton.current?.focus())
  }

  return (
    <div ref={frame} className="flex h-full min-h-0 bg-[#ededed] font-sans dark:bg-neutral-950">
      <div
        id={`${id}-trade`}
        className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-neutral-900 ${showNote ? 'rounded-2xl max-lg:hidden lg:flex-none' : ''}`}
        style={showNote ? { flexBasis: `${tradeWidth}%` } : undefined}
      >
        <header className="flex h-11 shrink-0 items-center justify-between gap-4 border-b border-border/50 px-6">
          <nav aria-label="Trade breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px]">
            <Link
              to="/w/$workspaceId/journal"
              params={{ workspaceId }}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              Journal
            </Link>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span aria-current="page" className="truncate">
              {detail.data ? instrumentLabel(detail.data.trade) : 'Trade'}
            </span>
          </nav>
          {detail.data && !detail.isError && (
            <Button
              ref={noteButton}
              variant="ghost"
              size="sm"
              className="ml-auto"
              aria-expanded={showNote}
              aria-controls={showNote ? `${id}-note` : undefined}
              onClick={() => (showNote ? closeNote() : setNoteOpen(true))}
            >
              <Plus aria-hidden />
              Trade Note
            </Button>
          )}
        </header>
        <ScrollArea className="min-h-0 flex-1 overflow-hidden [&>[data-slot=scroll-area-viewport]]:overscroll-contain">
          <div className="@container/trade">
            {detail.isPending ? (
              <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1fr_2fr]" aria-label="Loading trade">
                <Skeleton className="h-80" />
                <Skeleton className="h-80" />
                <Skeleton className="h-96" />
              </div>
            ) : detail.isError ? (
              <p role="alert" className="p-6 text-sm text-destructive">
                {tradeErrorMessage(detail.error, 'Could not load this trade.')}
              </p>
            ) : !detail.data ? (
              <Card className="m-6 items-center gap-2 px-6 py-12 text-center shadow-none">
                <h1 className="font-medium">This trade is no longer here</h1>
                <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                  It was merged, split, or its fills changed. Its journal entry moved with its fills or is listed in the
                  Journal under items that need your attention.
                </p>
              </Card>
            ) : (
              <TradeView key={tradeId} workspaceId={workspaceId} detail={detail.data} />
            )}
          </div>
        </ScrollArea>
      </div>
      {showNote && detail.data && (
        <>
          <div
            role="separator"
            tabIndex={0}
            aria-label="Resize trade and note panels"
            aria-orientation="vertical"
            aria-controls={`${id}-trade`}
            aria-valuemin={30}
            aria-valuemax={70}
            aria-valuenow={Math.round(tradeWidth)}
            className="hidden w-1.5 shrink-0 cursor-col-resize touch-none outline-none hover:bg-foreground/10 focus-visible:bg-foreground/20 lg:block"
            onPointerDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              event.currentTarget.focus()
              event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
              const rect = frame.current?.getBoundingClientRect()
              if (rect && rect.width > 0)
                setTradeWidth(Math.min(70, Math.max(30, ((event.clientX - rect.left) / rect.width) * 100)))
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId)
            }}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              setTradeWidth((width) =>
                event.key === 'Home'
                  ? 30
                  : event.key === 'End'
                    ? 70
                    : Math.min(70, Math.max(30, width + (event.key === 'ArrowLeft' ? -5 : 5))),
              )
            }}
          />
          <TradeNotePanel
            id={`${id}-note`}
            workspaceId={workspaceId}
            trade={detail.data.trade}
            suggestedStop={detail.data.suggestedStop}
            onClose={closeNote}
            onFlushChange={onFlushChange}
            reloadAnnotation={async () => {
              const fresh = await detail.refetch({ throwOnError: true })
              if (!fresh.data) throw new Error('This trade is no longer here.')
              return fresh.data.trade.annotation
            }}
          />
        </>
      )}
    </div>
  )
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-border/50 py-3">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-[15px] leading-6 font-medium tabular-nums">{children}</dd>
    </div>
  )
}

function Chips({ labels }: { labels: LabelRef[] }) {
  if (labels.length === 0) return <span className="font-normal text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span key={label.id} className="inline-flex items-center gap-1.5 font-normal">
          <LabelDot color={label.color} />
          {label.name}
          {label.archived && <span className="text-xs text-muted-foreground">(archived)</span>}
        </span>
      ))}
    </span>
  )
}

function JournalLabels({ annotation }: { annotation: TradeAnnotation | null }) {
  if (!annotation) return null
  const { edges, entryTactics, tags, mistakes } = annotation
  if ([edges, entryTactics, tags, mistakes].every((labels) => labels.length === 0)) return null
  return (
    <section aria-labelledby="journal-heading">
      <h2 id="journal-heading" className="text-base font-semibold">
        Journal
      </h2>
      <dl className="mt-2">
        <Tile label="Edges">
          <Chips labels={edges} />
        </Tile>
        <Tile label="Entry tactics">
          <Chips labels={entryTactics} />
        </Tile>
        {tags.length > 0 && (
          <Tile label="Tags">
            <Chips labels={tags} />
          </Tile>
        )}
        {mistakes.length > 0 && (
          <Tile label="Mistakes">
            <Chips labels={mistakes} />
          </Tile>
        )}
      </dl>
    </section>
  )
}

function TradeLink({ workspaceId, trade }: { workspaceId: string; trade: TradeSummary }) {
  return (
    <Link
      to="/w/$workspaceId/journal/$tradeId"
      params={{ workspaceId, tradeId: trade.id }}
      className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-muted/40"
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="break-words font-medium">{instrumentLabel(trade)}</span>
        <span className="text-xs text-muted-foreground">
          {directionLabel(trade.direction)} · {formatDate(trade.openedAt)} · {STATUS_LABEL[trade.status]}
        </span>
      </span>
      <Pnl value={trade.net} className="shrink-0" />
    </Link>
  )
}

function TradeView({ workspaceId, detail }: { workspaceId: string; detail: TradeDetail }) {
  const { trade } = detail
  const hasManual = detail.fills.some((f) => f.manual)
  const manualFills = useManualFills(workspaceId, hasManual)
  const [splitAt, setSplitAt] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const editingFill = manualFills.data?.find((f) => f.id === editing)
  const open = trade.status === 'open'
  const StatusIcon = open ? Clock3 : trade.status === 'closed' ? CircleCheck : CircleAlert
  const headline = open ? trade.unrealized : trade.net

  return (
    <>
      <div className="grid min-h-[calc(100dvh-7rem)] @5xl/trade:grid-cols-2">
        <div className="min-w-0 border-b border-border/50 @5xl/trade:border-r @5xl/trade:border-b-0">
          <div className="grid @xl/trade:grid-cols-2">
            <aside aria-label="Trade overview" className="min-w-0 space-y-6 border-b border-border/50 p-6 @xl/trade:border-r">
              <header className="space-y-3 border-b border-border/50 pb-6">
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <StatusIcon className="size-4 shrink-0" aria-hidden />
                  {open ? 'Open trade' : trade.status === 'closed' ? 'Closed trade' : 'Missing history'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="break-words text-2xl leading-8 font-semibold tracking-tight">
                    {instrumentLabel(trade)}
                  </h1>
                  <DirectionBadge direction={trade.direction} />
                  {trade.nonEconomic && <Badge variant="outline">Transfer</Badge>}
                </div>
                <div>
                  <p className="text-3xl leading-10 font-semibold tracking-tight">
                    <Pnl value={headline} />
                  </p>
                  <p className="mt-1 text-[13px] text-muted-foreground">{open ? 'Unrealised P&L' : 'Net P&L'}</p>
                  {open && trade.unrealized === null && (
                    <p className="mt-1 text-xs text-muted-foreground">No current price available</p>
                  )}
                </div>
              </header>

              <section aria-labelledby="overview-heading">
                <h2 id="overview-heading" className="text-base font-semibold">
                  Trade details
                </h2>
                <dl className="mt-2">
                  <Tile label="Opened">{formatDateTime(trade.openedAt)}</Tile>
                  <Tile label="Closed">{open ? 'Still open' : formatDateTime(trade.closedAt)}</Tile>
                  <Tile label="Time held">{open ? 'Still open' : holdTime(trade.holdingSeconds)}</Tile>
                  <Tile label="Fills">{trade.fillCount}</Tile>
                  {trade.option && (
                    <>
                      <Tile label="Contract">
                        {trade.option.right === 'call' ? 'Call' : 'Put'} · {price(trade.option.strike)} strike
                      </Tile>
                      <Tile label="Expiry">{formatDate(trade.option.expiry)}</Tile>
                      <Tile label="Multiplier">{quantity(trade.option.multiplier)}</Tile>
                    </>
                  )}
                </dl>
              </section>

              <JournalLabels annotation={trade.annotation} />

              {trade.issues.length > 0 && (
                <section aria-label="Trade warnings" className="space-y-2">
                  {trade.issues.map((issue) => (
                    <Alert key={`${issue.code}-${issue.fillKey}`}>
                      <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.8} aria-hidden />
                      <AlertDescription>
                        <span className="font-medium text-foreground">{issueTitle(issue.code)}.</span> {issue.message}
                      </AlertDescription>
                    </Alert>
                  ))}
                </section>
              )}
            </aside>

            <aside aria-label="Key numbers" className="min-w-0 space-y-6 border-b border-border/50 p-6">
              <section aria-labelledby="numbers-heading">
                <h2 id="numbers-heading" className="text-base font-semibold">
                  Key numbers
                </h2>
                <dl className="mt-2 grid grid-cols-2 gap-x-5">
                  <Tile label="Avg entry">{price(trade.avgEntry)}</Tile>
                  <Tile label="Avg exit">{price(trade.avgExit)}</Tile>
                  <Tile label="Return">{percent(trade.returnPct)}</Tile>
                  <Tile label="R-multiple">{rMultiple(trade.rMultiple)}</Tile>
                  <Tile label="Size">{quantity(trade.maxQuantity)}</Tile>
                  <Tile label="Fees">{money(trade.fees)}</Tile>
                  {open && <Tile label="Current mark">{price(trade.mark)}</Tile>}
                  {open && <Tile label="Open quantity">{quantity(trade.openQuantity)}</Tile>}
                </dl>
                <dl>
                  <Tile label={open ? 'Realised so far' : 'Net P&L'}>
                    <Pnl value={trade.net} />
                  </Tile>
                  <Tile label="Gross P&L">
                    <Pnl value={trade.gross} />
                  </Tile>
                  {toNumber(trade.income) !== 0 && <Tile label="Dividends">{money(trade.income)}</Tile>}
                  <Tile label="Initial stop">
                    {trade.annotation?.initialStop ? (
                      price(trade.annotation.initialStop)
                    ) : detail.suggestedStop ? (
                      <span className="font-normal text-muted-foreground">
                        {price(detail.suggestedStop.price)} from your stop order · not saved
                      </span>
                    ) : (
                      '—'
                    )}
                  </Tile>
                  {trade.annotation?.plannedRisk && <Tile label="Planned risk">{money(trade.annotation.plannedRisk)}</Tile>}
                </dl>
              </section>

              {detail.legs.length > 0 && (
                <section aria-labelledby="legs-heading">
                  <h2 id="legs-heading" className="text-base font-semibold">
                    Strategy legs
                  </h2>
                  <div className="mt-2 divide-y divide-border/50">
                    {detail.legs.map((leg) => (
                      <TradeLink key={leg.id} workspaceId={workspaceId} trade={leg} />
                    ))}
                  </div>
                </section>
              )}
              {(detail.parent || detail.related.length > 0) && (
                <section aria-labelledby="related-heading">
                  <h2 id="related-heading" className="text-base font-semibold">
                    {detail.parent ? 'Part of a strategy' : 'Related trades'}
                  </h2>
                  <div className="mt-2 divide-y divide-border/50">
                    {detail.parent && <TradeLink workspaceId={workspaceId} trade={detail.parent} />}
                    {detail.related.map((related) => (
                      <TradeLink key={related.id} workspaceId={workspaceId} trade={related} />
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </div>

          <div className="min-w-0 p-6">
            <section aria-labelledby="fills-heading" className="space-y-2">
              <h2 id="fills-heading" className="text-base font-semibold">
                Fills
              </h2>
              <div className="border-y border-border/50">
                <Table className={dataTableClass} aria-label="Fills">
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead scope="col">When</TableHead>
                      <TableHead scope="col">Action</TableHead>
                      <TableHead scope="col" className={numericCell}>
                        Quantity
                      </TableHead>
                      <TableHead scope="col" className={numericCell}>
                        Price
                      </TableHead>
                      <TableHead scope="col" className={numericCell}>
                        Fee
                      </TableHead>
                      <TableHead scope="col">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.fills.map((fill, index) => (
                      <TableRow key={`${fill.key}-${index}`}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(fill.executedAt)}
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-1.5">
                            {FILL_ROLE_LABEL[fill.role] ?? fill.role}
                            {fill.derived && (
                              <Badge
                                variant="outline"
                                className="font-normal"
                                title="The brokerage reported no stock fill; Tradstry added this one"
                              >
                                Added
                              </Badge>
                            )}
                            {fill.manual && (
                              <Badge variant="outline" className="font-normal">
                                Manual
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className={numericCell}>{quantity(fill.quantity)}</TableCell>
                        <TableCell className={numericCell}>{price(fill.price)}</TableCell>
                        <TableCell className={numericCell}>{money(fill.fee)}</TableCell>
                        <TableCell className="text-right">
                          {fill.role === 'add' && trade.kind === 'single' && (
                            <Button size="sm" variant="ghost" onClick={() => setSplitAt(fill.key)}>
                              Split here
                            </Button>
                          )}
                          {fill.manual && manualFillId(fill.key) && (
                            <Button size="sm" variant="ghost" onClick={() => setEditing(manualFillId(fill.key))}>
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        </div>

        <div className="min-w-0 space-y-7 p-6">
          <section aria-label="Execution chart" className="border-b border-border/50 pb-6">
            {trade.kind === 'strategy' ? (
              <div className="space-y-2">
                <h2 className="text-base font-semibold">Strategy executions</h2>
                <p className="text-sm text-muted-foreground">Open a strategy leg to view its execution prices.</p>
              </div>
            ) : (
              <TradeExecutionChart key={trade.id} fills={detail.fills} />
            )}
          </section>
          {detail.lots.length > 0 && <LotsTable lots={detail.lots} />}
        </div>
      </div>

      {splitAt && (
        <DecisionDialog
          workspaceId={workspaceId}
          decision={{ kind: 'split', tradeId: trade.id, atFill: splitAt }}
          onClose={() => setSplitAt(null)}
        />
      )}
      {editingFill && <FillDialog workspaceId={workspaceId} fill={editingFill} onClose={() => setEditing(null)} />}
    </>
  )
}

function LotsTable({ lots }: { lots: TradeLot[] }) {
  return (
    <section aria-labelledby="lots-heading" className="space-y-2">
      <div>
        <h2 id="lots-heading" className="text-sm font-medium">
          Lots
        </h2>
        <p className="text-xs text-muted-foreground">Each entry is a lot; exits close the oldest lots first.</p>
      </div>
      <Card className="gap-0 py-0 shadow-none">
        <Table className={dataTableClass} aria-label="Lots and how they closed">
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead scope="col">Lot</TableHead>
              <TableHead scope="col" className={numericCell}>
                Quantity
              </TableHead>
              <TableHead scope="col" className={numericCell}>
                Price
              </TableHead>
              <TableHead scope="col" className={numericCell}>
                P&amp;L
              </TableHead>
              <TableHead scope="col" className={numericCell}>
                Taxable gain
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lots.map((lot) => (
              <Fragment key={lot.id}>
                <TableRow className="bg-muted/15">
                  <TableCell>
                    <span className="font-medium">Opened {formatDateTime(lot.acquiredAt)}</span>
                    {!lot.costKnown && <span className="block text-xs text-destructive">Cost unknown</span>}
                    {lot.washBasisAdjustment !== '0.00' && (
                      <span className="block text-xs text-muted-foreground">
                        Basis +{money(lot.washBasisAdjustment)} from a wash sale
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={numericCell}>
                    {quantity(lot.originalQuantity)}
                    {lot.quantity !== '0' && (
                      <span className="block text-xs text-muted-foreground">{quantity(lot.quantity)} open</span>
                    )}
                  </TableCell>
                  <TableCell className={numericCell}>{price(lot.costPerUnit)}</TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
                {lot.closures.map((closure, index) => (
                  <TableRow key={`${lot.id}-${index}`}>
                    <TableCell className="pl-8 text-xs text-muted-foreground">
                      Closed {formatDateTime(closure.closedAt)}
                      {closure.kind !== 'trade' && ` · ${closure.kind.replace('_', ' ')}`}
                    </TableCell>
                    <TableCell className={`${numericCell} text-xs`}>{quantity(closure.quantity)}</TableCell>
                    <TableCell className={`${numericCell} text-xs`}>{price(closure.exitPrice)}</TableCell>
                    <TableCell className={`${numericCell} text-xs`}>
                      <Pnl value={closure.gross} />
                    </TableCell>
                    <TableCell className={`${numericCell} text-xs`}>
                      {closure.taxRealized === null ? (
                        <span className="text-muted-foreground">Not taxable</span>
                      ) : (
                        <span className="flex flex-col items-end gap-0.5">
                          <Pnl value={closure.taxRealized} />
                          <span className="text-[11px] text-muted-foreground">
                            {closure.term === 'long' ? 'Long-term' : 'Short-term'}
                            {closure.washDisallowed && closure.washDisallowed !== '0.00' &&
                              ` · ${money(closure.washDisallowed)} wash${closure.washPermanent ? ' (IRA)' : ''}`}
                          </span>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </section>
  )
}
