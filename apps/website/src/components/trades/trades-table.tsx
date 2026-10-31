import { useNavigate } from '@tanstack/react-router'
import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { LabelDot } from '@/components/trades/label-picker'
import { Pnl } from '@/components/trades/trade-bits'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  STATUS_LABEL,
  TONE_CLASS,
  type TradeSummary,
  directionLabel,
  holdTime,
  instrumentLabel,
  percent,
  price,
  quantity,
  rMultiple,
  tone,
} from '@/lib/client/trades/trades-model'
import { formatDateTime } from '@/lib/format'

const tableClass =
  'min-w-240 border-y border-border/50 text-[15px] [&_tr]:border-border/50 [&_th]:h-10 [&_th]:border-r [&_th]:border-border/50 [&_th]:px-4 [&_th]:text-[13px] [&_th]:font-normal [&_th]:text-muted-foreground [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-border/50 [&_td]:px-4 [&_td]:py-1.5 [&_td:last-child]:border-r-0 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0'

const numericCell = 'tabular-nums text-foreground/85'

/** A continuous list of trades, each opening its journal entry. */
export function TradesTable({
  workspaceId,
  trades,
}: {
  workspaceId: string
  trades: TradeSummary[]
}) {
  const navigate = useNavigate()
  const open = (trade: TradeSummary) =>
    void navigate({ to: '/w/$workspaceId/journal/$tradeId', params: { workspaceId, tradeId: trade.id } })

  return (
    <div>
      <Table className={tableClass} aria-label="Trades">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="w-52">Trade</TableHead>
            <TableHead scope="col">Opened</TableHead>
            <TableHead scope="col" className={numericCell}>
              Held
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Size
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Entry
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Exit
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Net P&amp;L
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              Return
            </TableHead>
            <TableHead scope="col" className={numericCell}>
              R
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => {
            const warnings = trade.issues.filter((i) => i.severity !== 'info')
            const labels = trade.annotation
              ? [...trade.annotation.edges, ...trade.annotation.entryTactics, ...trade.annotation.tags]
              : []
            return (
              <TableRow
                key={trade.id}
                className="h-14 cursor-pointer hover:bg-muted/40"
                onClick={() => open(trade)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-sm text-left leading-5 font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                          onClick={(event) => {
                            event.stopPropagation()
                            open(trade)
                          }}
                        >
                          {instrumentLabel(trade)}
                        </button>
                        {warnings.length > 0 && (
                          <span title={warnings.map((w) => w.message).join('\n')} className="inline-flex">
                            <HugeiconsIcon icon={Alert02Icon} className="size-4 text-amber-600 dark:text-amber-400" strokeWidth={1.8} aria-label="Has warnings" />
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-5 text-muted-foreground">
                        <span>{directionLabel(trade.direction)}</span>
                        <span aria-hidden>·</span>
                        <span className={trade.status === 'incomplete' ? 'text-amber-700 dark:text-amber-400' : undefined}>
                          {STATUS_LABEL[trade.status]}
                        </span>
                      </p>
                      {labels.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {labels.map((label) => (
                            <Badge key={label.id} variant="outline" className="h-4.5 gap-1 px-1.5 text-[11px] font-normal">
                              <LabelDot color={label.color} />
                              {label.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(trade.openedAt)}</TableCell>
                <TableCell className="text-sm text-muted-foreground tabular-nums">
                  {trade.status === 'open' ? 'open' : holdTime(trade.holdingSeconds)}
                </TableCell>
                <TableCell className={numericCell}>{quantity(trade.maxQuantity)}</TableCell>
                <TableCell className={numericCell}>{price(trade.avgEntry)}</TableCell>
                <TableCell className={numericCell}>{price(trade.avgExit)}</TableCell>
                <TableCell className={numericCell}>
                  {trade.status === 'open' && trade.unrealized !== null ? (
                    <span className="flex flex-col items-start gap-0.5">
                      <Pnl value={trade.unrealized} />
                      <span className="text-[13px] leading-5 text-muted-foreground">Unrealised</span>
                    </span>
                  ) : (
                    <Pnl value={trade.net} />
                  )}
                </TableCell>
                <TableCell className={`tabular-nums ${TONE_CLASS[tone(trade.returnPct)]}`}>{percent(trade.returnPct)}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">{rMultiple(trade.rMultiple)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
