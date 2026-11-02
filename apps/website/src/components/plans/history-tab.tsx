import { ArrowDown01Icon, ArrowTurnBackwardIcon, ArrowUpRight01Icon, Delete02Icon, TimeQuarterPassIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { Metric, TabEmpty } from '@/components/plans/calculator-bits'
import { CardsSkeleton } from '@/components/plans/calculator-skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { type TradePlan, formatSize } from '@/lib/client/plans/plan-model'
import { cn } from '@/lib/utils'
import { useDeletePlan, useSkipPlan } from '@/lib/client/plans/plans'
import { money, price, toNumber, tradeErrorMessage } from '@/lib/client/trades/trades-model'
import { formatDate } from '@/lib/format'

const actionClass = 'size-7 text-muted-foreground'

function HistoryCard({
  workspaceId,
  plan,
  onOpenTrade,
}: {
  workspaceId: string
  plan: TradePlan
  onOpenTrade: () => void
}) {
  const reopen = useSkipPlan(workspaceId)
  const remove = useDeletePlan(workspaceId)
  const busy = reopen.isPending || remove.isPending
  const error = reopen.error ?? remove.error
  const linked = plan.status === 'LINKED'
  const ladderId = useId()
  const [expanded, setExpanded] = useState(false)
  const hasLadder = plan.tranches.length > 1

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-start gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold tracking-wide">{plan.symbol}</span>
            <span className="text-xs text-muted-foreground">{plan.direction === 'LONG' ? 'Long' : 'Short'}</span>
            <Badge variant={linked ? 'secondary' : 'outline'} className="h-5 px-1.5 text-[0.625rem] font-normal">
              {linked ? 'Linked to a trade' : 'Skipped'}
            </Badge>
            <span className="ml-auto text-[0.625rem] text-muted-foreground tabular-nums">{formatDate(plan.createdAt)}</span>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-3">
            <Metric label={plan.tranches.length > 1 ? 'Avg entry' : 'Entry'} value={price(plan.entry)} />
            <Metric label="Stop" value={price(plan.stop)} />
            <Metric label="Size" value={formatSize(toNumber(plan.quantity) ?? 0, plan.assetClass)} />
            <Metric label="Risk" value={money(plan.actualRisk ?? plan.risk)} />
          </div>

          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-muted-foreground tabular-nums">
            <span>{money(plan.cost)} position</span>
            {plan.target && (
              <>
                <span>·</span>
                <span>target {price(plan.target)}</span>
              </>
            )}
            {plan.roundUp && (
              <>
                <span>·</span>
                <span>rounded up</span>
              </>
            )}
            {plan.note && (
              <>
                <span>·</span>
                <span className="min-w-0 truncate">{plan.note}</span>
              </>
            )}
            {hasLadder && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={ladderId}
                onClick={() => setExpanded((value) => !value)}
                className="ml-auto flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
              >
                {plan.tranches.length} entries
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  strokeWidth={2}
                  className={cn('size-3.5 transition-transform motion-reduce:transition-none', expanded && 'rotate-180')}
                />
              </button>
            )}
          </p>
        </div>

        <div className="flex shrink-0 gap-1">
          {linked && plan.tradeId ? (
            <Button
              size="icon"
              variant="ghost"
              title="Open the trade"
              aria-label={`Open the ${plan.symbol} trade`}
              className={`${actionClass} hover:text-foreground`}
              nativeButton={false}
              render={
                <Link
                  to="/w/$workspaceId/journal/$tradeId"
                  params={{ workspaceId, tradeId: plan.tradeId }}
                  onClick={onOpenTrade}
                />
              }
            >
              <HugeiconsIcon icon={ArrowUpRight01Icon} strokeWidth={2} className="size-4" />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="Reopen plan"
                aria-label={`Reopen the ${plan.symbol} plan`}
                className={`${actionClass} hover:text-foreground`}
                disabled={busy}
                onClick={() => reopen.mutate({ id: plan.id, skipped: false })}
              >
                <HugeiconsIcon icon={ArrowTurnBackwardIcon} strokeWidth={2} className="size-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                title="Delete plan"
                aria-label={`Delete the ${plan.symbol} plan`}
                className={`${actionClass} hover:text-destructive`}
                disabled={busy}
                onClick={() => remove.mutate(plan.id)}
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      {hasLadder && expanded && (
        <div id={ladderId} className="border-t border-border bg-muted/20 px-3 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.625rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Execution ladder</p>
            <p className="text-[0.625rem] text-muted-foreground tabular-nums">{money(plan.risk)} risk budget</p>
          </div>
          <div className="grid gap-1.5">
            {plan.tranches.map((tranche, index) => (
              <div
                key={index}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/70 bg-background px-2 py-2"
              >
                <span className="font-mono text-[0.625rem] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{Number(tranche.percent).toLocaleString()}% risk allocation</p>
                  <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground tabular-nums">
                    {formatSize(toNumber(tranche.quantity) ?? 0, plan.assetClass)} @ {price(tranche.entry)} → {price(plan.stop)}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-xs font-medium">{money(tranche.risk)}</p>
                  <p className="text-[0.625rem] text-muted-foreground">risk</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="border-t px-3 py-2 text-xs text-destructive">
          {tradeErrorMessage(error, 'Could not change the plan. Try again.')}
        </p>
      )}
    </article>
  )
}

/** Plans that are done: carried out by a trade, or skipped. */
export function HistoryTab({
  workspaceId,
  plans,
  loading,
  onOpenTrade,
  onPlans,
  onCalculator,
}: {
  workspaceId: string
  plans: TradePlan[] | undefined
  loading: boolean
  onOpenTrade: () => void
  onPlans: () => void
  onCalculator: () => void
}) {
  if (loading) return <CardsSkeleton label="Loading your plan history" />
  const done = (plans ?? []).filter((plan) => plan.status !== 'OPEN')
  if (done.length === 0) {
    const open = (plans ?? []).filter((plan) => plan.status === 'OPEN').length
    return (
      <TabEmpty
        icon={TimeQuarterPassIcon}
        title="No plan history yet"
        description="Plans land here once you link them to a trade in the journal, or skip them. Each one keeps its entries, stop and risk."
        action={
          open > 0
            ? { label: `See open plans (${open})`, onClick: onPlans }
            : { label: 'Plan a position', onClick: onCalculator }
        }
      />
    )
  }
  return (
    <ScrollArea className="py-2 [&>[data-slot=scroll-area-viewport]]:max-h-[28rem]">
      <div className="grid gap-2 pr-3">
        {done.map((plan) => (
          <HistoryCard key={plan.id} workspaceId={workspaceId} plan={plan} onOpenTrade={onOpenTrade} />
        ))}
      </div>
    </ScrollArea>
  )
}
