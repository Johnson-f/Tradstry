import { AlertCircleIcon, NoteEditIcon } from '@hugeicons/core-free-icons'
import { ChevronDown, MoreHorizontal, Plus, SkipForward, Trash2 } from 'lucide-react'
import { TabEmpty } from '@/components/plans/calculator-bits'
import { CardsSkeleton } from '@/components/plans/calculator-skeletons'
import { DirectionBadge } from '@/components/trades/trade-bits'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatSize, multiplierOf, type TradePlan } from '@/lib/client/plans/plan-model'
import { useDeletePlan, useSkipPlan } from '@/lib/client/plans/plans'
import { money, price, toNumber, tradeErrorMessage } from '@/lib/client/trades/trades-model'
import { formatDate } from '@/lib/format'

function PlanCard({
  workspaceId,
  plan,
  onEdit,
}: {
  workspaceId: string
  plan: TradePlan
  onEdit: () => void
}) {
  const skip = useSkipPlan(workspaceId)
  const remove = useDeletePlan(workspaceId)
  const busy = skip.isPending || remove.isPending
  const error = skip.error ?? remove.error
  const option = plan.assetClass === 'OPTION'
  const stopDistance = Math.abs(Number(plan.entry) - Number(plan.stop))
  const rewardRisk =
    plan.target && stopDistance > 0 ? Math.abs(Number(plan.target) - Number(plan.entry)) / stopDistance : null

  return (
    <article aria-label={`${plan.symbol} plan`} className="min-w-0 rounded-xl border bg-background p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-semibold tracking-tight">{plan.symbol}</h4>
            <DirectionBadge direction={plan.direction === 'LONG' ? 'long' : 'short'} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {option ? 'Option' : 'Stock'} · {formatDate(plan.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit the ${plan.symbol} plan`}
            disabled={busy}
            onClick={onEdit}
          >
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`More actions for ${plan.symbol}`}
                  disabled={busy}
                />
              }
            >
              <MoreHorizontal aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => skip.mutate({ id: plan.id, skipped: true })}>
                <SkipForward aria-hidden />
                Skip plan
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => remove.mutate(plan.id)}>
                <Trash2 aria-hidden />
                Delete plan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:mt-1 [&_dd]:font-medium [&_dd]:tabular-nums">
        <div>
          <dt>Size</dt>
          <dd>{formatSize(toNumber(plan.quantity) ?? 0, plan.assetClass)}</dd>
        </div>
        <div>
          <dt>{plan.tranches.length > 1 ? 'Average entry' : 'Entry'}</dt>
          <dd>{price(plan.entry)}</dd>
        </div>
        <div>
          <dt>Stop</dt>
          <dd>{price(plan.stop)}</dd>
        </div>
        <div>
          <dt>Risk at stop</dt>
          <dd>{money(plan.actualRisk ?? plan.risk)}</dd>
        </div>
      </dl>
      <details className="group mt-3 border-t pt-2">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm py-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          Plan details <ChevronDown className="size-3.5 group-open:rotate-180" aria-hidden />
        </summary>
        <div className="grid gap-2 pt-2 text-sm">
          {plan.tranches.map((entry, index) => (
            <div key={index} className="rounded-md bg-muted/40 px-3 py-2 text-xs leading-5 tabular-nums">
              <p className="font-medium">
                Entry {index + 1} · {formatSize(Number(entry.quantity), plan.assetClass)} at{' '}
                {price(entry.entry)}
              </p>
              <p className="text-muted-foreground">
                {Number(entry.percent)}% of budget · {money(entry.risk)} at stop ·{' '}
                {money(
                  String(Math.abs(Number(entry.entry) - Number(plan.stop)) * multiplierOf(plan.assetClass)),
                )}
                /{option ? 'contract' : 'share'}
              </p>
            </div>
          ))}
          {plan.target && (
            <p>
              Target {price(plan.target)}
              {rewardRisk !== null && ` · ${rewardRisk.toFixed(1)}R`}
            </p>
          )}
          {plan.roundUp && <p className="text-xs text-muted-foreground">Sizes rounded up</p>}
          {plan.note && <p className="whitespace-pre-wrap wrap-anywhere">{plan.note}</p>}
        </div>
      </details>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {tradeErrorMessage(error, 'Could not change the plan. Try again.')}
        </p>
      )}
    </article>
  )
}

export function PlansTab({
  workspaceId,
  plans,
  loading,
  failed,
  onEdit,
  onCalculator,
}: {
  workspaceId: string
  plans: TradePlan[] | undefined
  loading: boolean
  failed: boolean
  onEdit: (plan: TradePlan) => void
  onCalculator: () => void
}) {
  if (loading) return <CardsSkeleton label="Loading your plans" />
  if (failed) {
    return (
      <TabEmpty
        icon={AlertCircleIcon}
        title="Couldn’t load your plans"
        description="Close the calculator and open it again to retry."
      />
    )
  }

  const open = (plans ?? []).filter((plan) => plan.status === 'OPEN')
  if (open.length === 0) {
    return (
      <TabEmpty
        icon={NoteEditIcon}
        title="No open plans"
        description="Start in Calculator to size a position, then save it here."
        action={{ label: 'Size a position', onClick: onCalculator }}
      />
    )
  }
  return (
    <ScrollArea className="-mr-4 min-h-0 flex-1">
      <div className="grid gap-3 pt-2 pr-5 pb-3 pl-1">
        <header className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Open plans</h3>
          <Button variant="outline" size="sm" onClick={onCalculator}>
            <Plus aria-hidden />
            New plan
          </Button>
        </header>
        {open.map((plan) => (
          <PlanCard key={plan.id} workspaceId={workspaceId} plan={plan} onEdit={() => onEdit(plan)} />
        ))}
      </div>
    </ScrollArea>
  )
}
