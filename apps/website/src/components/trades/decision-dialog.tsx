import { useQuery } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { DirectionBadge, Pnl } from '@/components/trades/trade-bits'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { type DecisionInput, previewDecision, useApplyDecision } from '@/lib/client/trades/trades'
import { decisionMessage, tradeErrorMessage } from '@/lib/client/trades/trades-model'
import { formatDateTime } from '@/lib/format'

const COPY: Record<DecisionInput['kind'], { title: string; description: string; action: string }> = {
  merge: {
    title: 'Merge trades',
    description: 'The trades become one, with every fill and its combined result. Fills are not changed and you can undo this.',
    action: 'Merge',
  },
  split: {
    title: 'Split this trade',
    description: 'Entries from this fill on become a trade of their own, with the exits that closed them. You can undo this.',
    action: 'Split',
  },
  combine_legs: {
    title: 'Combine into a strategy',
    description: 'The legs stay as they are and are grouped under one strategy with their combined result. You can undo this.',
    action: 'Combine',
  },
}

/** Shows what a regrouping would produce, then applies it on request. */
export function DecisionDialog({
  workspaceId,
  decision,
  onClose,
  onApplied,
}: {
  workspaceId: string
  decision: DecisionInput
  onClose: () => void
  onApplied?: (tradeIds: string[]) => void
}) {
  const id = useId()
  const [label, setLabel] = useState(decision.label ?? '')
  const preview = useQuery({
    queryKey: ['trade-decision-preview', workspaceId, decision],
    queryFn: () => previewDecision(workspaceId, decision),
    retry: false,
    gcTime: 0,
  })
  const apply = useApplyDecision(workspaceId)
  const copy = COPY[decision.kind]
  const applies = preview.data?.status === 'applied'

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl font-[Arial,Helvetica,sans-serif] sm:max-w-md data-open:animate-none data-closed:animate-none">
        <DialogHeader>
          <DialogTitle className="font-[inherit] text-lg font-semibold">{copy.title}</DialogTitle>
          <DialogDescription className="text-xs leading-5">{copy.description}</DialogDescription>
        </DialogHeader>
        {decision.kind === 'combine_legs' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-label`} className="text-xs font-normal text-muted-foreground">
              Strategy name (optional)
            </Label>
            <Input
              id={`${id}-label`}
              value={label}
              maxLength={60}
              placeholder="Call spread"
              onChange={(event) => setLabel(event.target.value)}
              className="h-9 bg-background"
            />
          </div>
        )}
        <section aria-label="Result" className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Result</h3>
          {preview.isPending ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : preview.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {tradeErrorMessage(preview.error, 'Could not preview this change.')}
            </p>
          ) : !applies ? (
            <p role="alert" className="text-sm text-destructive">
              {decisionMessage(preview.data.code)}
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {preview.data.trades
                .filter((trade) => decision.kind !== 'combine_legs' || trade.kind === 'strategy')
                .map((trade) => (
                  <li key={trade.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-medium">
                        {trade.kind === 'strategy' ? label || 'Strategy' : trade.symbol}
                        {trade.direction && (
                          <DirectionBadge direction={trade.direction as 'long' | 'short'} />
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(trade.openedAt)} · {trade.fillCount} fills
                        {trade.status === 'open' ? ' · open' : ''}
                      </span>
                    </span>
                    <Pnl value={trade.net} />
                  </li>
                ))}
            </ul>
          )}
        </section>
        {apply.isError && (
          <p role="alert" className="text-sm text-destructive">
            {tradeErrorMessage(apply.error, 'Could not apply this change. Try again.')}
          </p>
        )}
        <DialogFooter className="flex-row justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!applies || apply.isPending}
            onClick={() =>
              apply.mutate(
                { ...decision, label: label.trim() || undefined },
                {
                  onSuccess: (result) => {
                    onApplied?.(result.tradeIds)
                    onClose()
                  },
                },
              )
            }
          >
            {apply.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            {copy.action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
