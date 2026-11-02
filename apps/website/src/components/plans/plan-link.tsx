import { HugeiconsIcon } from '@hugeicons/react'
import { Calculator01Icon } from '@hugeicons/core-free-icons'
import { type TradePlan, matchingPlans, planSummary } from '@/lib/client/plans/plan-model'
import { useLinkPlan, useTradePlans, useUnlinkPlan } from '@/lib/client/plans/plans'
import { type TradeSummary, tradeErrorMessage } from '@/lib/client/trades/trades-model'
import { formatDate } from '@/lib/format'

const linkClass =
  'font-medium text-foreground underline underline-offset-4 disabled:pointer-events-none disabled:opacity-50'

/**
 * The plan behind a trade, or the open plans that could be. Linking is the
 * trader's call; `onLink` copies the plan's stop and risk onto the entry.
 */
export function PlanLink({
  workspaceId,
  trade,
  onLink,
}: {
  workspaceId: string
  trade: Pick<TradeSummary, 'id' | 'kind' | 'underlying' | 'direction'>
  onLink: (plan: TradePlan) => void
}) {
  const plans = useTradePlans(workspaceId)
  const link = useLinkPlan(workspaceId)
  const unlink = useUnlinkPlan(workspaceId)
  const busy = link.isPending || unlink.isPending
  const error = link.error ?? unlink.error
  const linked = plans.data?.find((plan) => plan.tradeId === trade.id)
  const matches = linked ? [] : matchingPlans(plans.data ?? [], trade).slice(0, 3)
  if (!linked && matches.length === 0) return null

  return (
    <div className="mt-4 space-y-1.5 text-xs leading-5 text-muted-foreground">
      {linked ? (
        <p className="flex items-start gap-1.5">
          <HugeiconsIcon icon={Calculator01Icon} className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
          <span>
            From your plan on {formatDate(linked.createdAt)}: {planSummary(linked)}.{' '}
            <button type="button" className={linkClass} disabled={busy} onClick={() => unlink.mutate(linked.id)}>
              Unlink
            </button>
          </span>
        </p>
      ) : (
        matches.map((plan) => (
          <p key={plan.id} className="flex items-start gap-1.5">
            <HugeiconsIcon icon={Calculator01Icon} className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
            <span>
              You {plan.status === 'SKIPPED' ? 'skipped' : 'have'} a {plan.symbol} plan from {formatDate(plan.createdAt)}:{' '}
              {planSummary(plan)}.{' '}
              <button
                type="button"
                className={linkClass}
                disabled={busy}
                onClick={() => link.mutate({ id: plan.id, tradeId: trade.id }, { onSuccess: () => onLink(plan) })}
              >
                Link it to this trade
              </button>
            </span>
          </p>
        ))
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {tradeErrorMessage(error, 'Could not change the plan link. Try again.')}
        </p>
      )}
    </div>
  )
}
