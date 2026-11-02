import { AlertCircleIcon, Cancel01Icon, Delete02Icon, NoteEditIcon, PencilEdit02Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId, useState } from 'react'
import { AffixInput, ChoiceToggle, Field, Metric, TabEmpty } from '@/components/plans/calculator-bits'
import { CardsSkeleton } from '@/components/plans/calculator-skeletons'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  MAX_TRANCHES,
  type PlanForm,
  type TradePlan,
  type TrancheDraft,
  formatSize,
  multiplierOf,
  newTranche,
  planInput,
  rebalanceLast,
  sizePlan,
  stopProblem,
  updateTranche,
} from '@/lib/client/plans/plan-model'
import { useDeletePlan, useSavePlan, useSkipPlan } from '@/lib/client/plans/plans'
import { money, price, toNumber, tradeErrorMessage } from '@/lib/client/trades/trades-model'
import { formatDate } from '@/lib/format'

/** What the composer starts from: a sized position from the calculator, or a plan being edited. */
export interface PlanSeed {
  form: PlanForm
  balance: number | null
  editing: TradePlan | null
}

const ASSET_TAG = { STOCK: null, OPTION: 'option' } as const

function PlanComposer({ workspaceId, seed, onDone }: { workspaceId: string; seed: PlanSeed; onDone: () => void }) {
  const id = useId()
  const save = useSavePlan(workspaceId)
  const [form, setForm] = useState(seed.form)
  const [problem, setProblem] = useState<string | null>(null)
  const set = (change: Partial<PlanForm>) => {
    setForm((current) => ({ ...current, ...change }))
    setProblem(null)
    if (save.isError) save.reset()
  }
  const setTranches = (change: (tranches: TrancheDraft[]) => TrancheDraft[]) =>
    setForm((current) => ({ ...current, tranches: change(current.tranches) }))
  const down = sizePlan({ ...form, roundUp: false }, null)
  const up = sizePlan({ ...form, roundUp: true }, null)
  const sizing = form.roundUp ? up : down
  const stopError = stopProblem(form)
  const risk = toNumber(form.risk)
  const isOption = form.assetClass === 'OPTION'
  const unit = isOption ? 'contract' : 'share'
  const error = problem ?? (save.error ? tradeErrorMessage(save.error, 'Could not save the plan. Try again.') : null)

  return (
    <form
      className="grid gap-3 py-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (save.isPending) return
        const result = planInput(form, null)
        if (!result.ok) {
          setProblem(result.message)
          return
        }
        save.mutate({ id: seed.editing?.id ?? null, input: result.input }, { onSuccess: onDone })
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {form.symbol} <span className="text-muted-foreground">{form.direction === 'LONG' ? 'Long' : 'Short'}</span>
            {ASSET_TAG[form.assetClass] && (
              <span className="ml-1.5 text-[0.6875rem] text-muted-foreground uppercase">{ASSET_TAG[form.assetClass]}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">Allocate the trade’s risk across planned entries.</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          disabled={save.isPending || form.tranches.length >= MAX_TRANCHES}
          onClick={() => setTranches((tranches) => rebalanceLast([...tranches, newTranche(tranches[tranches.length - 1]?.entry ?? '')]))}
        >
          <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} className="mr-1 size-3" />
          Add tranche
        </Button>
      </div>

      <fieldset disabled={save.isPending} className="grid min-w-0 gap-3">
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-start gap-4">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Risk guardrail</p>
              <p className="mt-1 text-sm tabular-nums">
                {risk !== null ? money(risk.toFixed(2)) : '—'} maximum loss
                {risk !== null && seed.balance !== null && (
                  <>
                    <span className="px-1.5 text-muted-foreground">·</span>
                    {((risk / seed.balance) * 100).toFixed(2)}% of {money(String(seed.balance))}
                  </>
                )}
              </p>
            </div>
            <Field label="Stop loss" htmlFor={`${id}-stop`}>
              <AffixInput
                id={`${id}-stop`}
                prefix="$"
                className="h-8"
                aria-invalid={stopError ? true : undefined}
                value={form.stop}
                onChange={(event) => set({ stop: event.target.value })}
              />
            </Field>
          </div>
          {stopError && <p className="mt-2 text-xs text-destructive">{stopError}</p>}
          {sizing.ok && (
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/70 pt-3 sm:grid-cols-4">
              <Metric label="Weighted entry" value={price(sizing.entry.toFixed(4))} />
              <Metric label="Planned size" value={formatSize(sizing.quantity, form.assetClass)} />
              <Metric label="Planned risk" value={money(sizing.actualRisk.toFixed(2))} />
              <Metric label="Position value" value={money(sizing.cost.toFixed(2))} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-[5rem_7.5rem_minmax(0,1fr)_1.75rem] gap-2 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <span>Risk</span>
          <span>Entry</span>
          <span>Entry → stop</span>
          <span />
        </div>
        {form.tranches.map((tranche, index) => {
          const sized = sizing.ok ? sizing.tranches.find((t) => t.id === tranche.id) : undefined
          return (
            <div
              key={tranche.id}
              className="grid grid-cols-[5rem_7.5rem_minmax(0,1fr)_1.75rem] items-center gap-2 rounded-md border border-border/70 p-2"
            >
              <AffixInput
                aria-label={`Entry ${index + 1} share of the risk`}
                suffix="%"
                className="h-8"
                value={tranche.percent}
                onChange={(event) => setTranches((tranches) => updateTranche(tranches, tranche.id, { percent: event.target.value }))}
              />
              <AffixInput
                aria-label={`Entry ${index + 1} price`}
                prefix="$"
                className="h-8"
                value={tranche.entry}
                onChange={(event) => setTranches((tranches) => updateTranche(tranches, tranche.id, { entry: event.target.value }))}
              />
              <div className="min-w-0 text-xs tabular-nums">
                {sized ? (
                  <>
                    <p className="truncate font-medium">
                      {price(String(sized.entry))} → {price(form.stop)}
                      <span className="px-1.5 text-muted-foreground">·</span>
                      {money(sized.riskPerUnit.toFixed(2))}/{unit}
                    </p>
                    <p className="truncate text-muted-foreground">
                      {formatSize(sized.quantity, form.assetClass)}
                      <span className="px-1.5">·</span>
                      {money(sized.risk.toFixed(2))} risk
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground">—</p>
                )}
              </div>
              {form.tranches.length > 1 ? (
                <IconAction
                  icon={Delete02Icon}
                  label={`Remove entry ${index + 1}`}
                  danger
                  onClick={() => setTranches((tranches) => rebalanceLast(tranches.filter((t) => t.id !== tranche.id)))}
                />
              ) : (
                <span />
              )}
            </div>
          )
        })}
        {!sizing.ok && sizing.message && !stopError && <p className="text-xs text-destructive">{sizing.message}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Target (optional)" htmlFor={`${id}-target`}>
            <AffixInput
              id={`${id}-target`}
              prefix="$"
              placeholder="0.00"
              value={form.target}
              onChange={(event) => set({ target: event.target.value })}
            />
          </Field>
          <Field
            label="Round sizes"
            hint={
              form.roundUp && up.ok
                ? `Up risks ${money((up.actualRisk - up.riskDollars).toFixed(2))} more than you chose.`
                : sizing.ok && sizing.rewardRisk !== null
                  ? `${sizing.rewardRisk.toFixed(1)}R to the target`
                  : undefined
            }
          >
            <ChoiceToggle
              label="Round sizes"
              size="default"
              value={form.roundUp ? 'UP' : 'DOWN'}
              options={[
                { value: 'DOWN', label: down.ok ? `Down (${down.quantity.toLocaleString()})` : 'Down' },
                { value: 'UP', label: up.ok ? `Up (${up.quantity.toLocaleString()})` : 'Up' },
              ]}
              onChange={(choice) => set({ roundUp: choice === 'UP' })}
            />
          </Field>
        </div>
      </fieldset>

      <Field label="Why this trade" htmlFor={`${id}-note`}>
        <Textarea
          id={`${id}-note`}
          rows={2}
          maxLength={2000}
          disabled={save.isPending}
          placeholder="Breakout over yesterday’s high on strong volume"
          value={form.note}
          onChange={(event) => set({ note: event.target.value })}
        />
      </Field>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" disabled={save.isPending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending || !sizing.ok} aria-busy={save.isPending}>
          {save.isPending ? 'Saving…' : seed.editing ? 'Save changes' : 'Create plan'}
        </Button>
      </div>
    </form>
  )
}

function IconAction({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: typeof Delete02Icon
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`size-7 text-muted-foreground ${danger ? 'hover:text-destructive' : 'hover:text-foreground'}`}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3.5" />
    </Button>
  )
}

function PlanCard({ workspaceId, plan, onEdit }: { workspaceId: string; plan: TradePlan; onEdit: () => void }) {
  const skip = useSkipPlan(workspaceId)
  const remove = useDeletePlan(workspaceId)
  const busy = skip.isPending || remove.isPending
  const error = skip.error ?? remove.error
  const quantity = toNumber(plan.quantity) ?? 0
  const reward =
    plan.target === null
      ? null
      : Math.abs((toNumber(plan.target) ?? 0) - (toNumber(plan.entry) ?? 0)) /
        Math.abs((toNumber(plan.entry) ?? 0) - (toNumber(plan.stop) ?? 0))

  return (
    <article className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {plan.symbol}{' '}
            <span className="text-muted-foreground">{plan.direction === 'LONG' ? 'Long' : 'Short'}</span>
            {ASSET_TAG[plan.assetClass] && (
              <span className="ml-1.5 text-[0.6875rem] text-muted-foreground uppercase">{ASSET_TAG[plan.assetClass]}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatSize(quantity, plan.assetClass)}
            <span className="px-1.5">·</span>stop {price(plan.stop)}
            <span className="px-1.5">·</span>
            {money(plan.actualRisk ?? plan.risk)} risk — waiting for the trade
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <IconAction icon={PencilEdit02Icon} label={`Edit the ${plan.symbol} plan`} disabled={busy} onClick={onEdit} />
          <IconAction
            icon={Cancel01Icon}
            label={`Skip the ${plan.symbol} plan`}
            disabled={busy}
            onClick={() => skip.mutate({ id: plan.id, skipped: true })}
          />
          <IconAction
            icon={Delete02Icon}
            label={`Delete the ${plan.symbol} plan`}
            danger
            disabled={busy}
            onClick={() => remove.mutate(plan.id)}
          />
        </div>
      </div>
      <div className="mt-2 grid gap-1">
        {plan.tranches.map((tranche, index) => {
          const perUnit = Math.abs((toNumber(tranche.entry) ?? 0) - (toNumber(plan.stop) ?? 0)) * multiplierOf(plan.assetClass)
          return (
            <div key={index} className="rounded bg-muted/40 px-2 py-2 text-xs">
              <p className="tabular-nums">
                <span className="font-medium">{Number(tranche.percent).toLocaleString()}% risk</span>
                <span className="text-muted-foreground">
                  {' '}
                  — {formatSize(toNumber(tranche.quantity) ?? 0, plan.assetClass)} @ {price(tranche.entry)}
                </span>
              </p>
              <p className="mt-1 truncate text-muted-foreground tabular-nums">
                {price(tranche.entry)} → {price(plan.stop)}
                <span className="px-1.5">·</span>
                {money(perUnit.toFixed(2))}/{plan.assetClass === 'OPTION' ? 'contract' : 'share'}
                <span className="px-1.5">·</span>
                {money(tranche.risk)} risk
              </p>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
        {plan.target && (
          <>
            Target {price(plan.target)}
            {reward !== null && Number.isFinite(reward) && ` (${reward.toFixed(1)}R)`}
            <span className="px-1.5">·</span>
          </>
        )}
        {plan.roundUp && (
          <>
            Rounded up<span className="px-1.5">·</span>
          </>
        )}
        {plan.note ? `${plan.note} · ` : ''}
        {formatDate(plan.createdAt)}
      </p>
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
  seed,
  onEdit,
  onDone,
  onCalculator,
}: {
  workspaceId: string
  plans: TradePlan[] | undefined
  loading: boolean
  failed: boolean
  seed: PlanSeed | null
  onEdit: (plan: TradePlan) => void
  onDone: () => void
  onCalculator: () => void
}) {
  if (seed) {
    return <PlanComposer key={seed.editing?.id ?? 'new'} workspaceId={workspaceId} seed={seed} onDone={onDone} />
  }
  if (loading) return <CardsSkeleton label="Loading your plans" />
  if (failed) {
    return (
      <TabEmpty
        icon={AlertCircleIcon}
        title="Couldn’t load your plans"
        description="Something went wrong on our side. Close the calculator and open it again to retry."
      />
    )
  }

  const open = (plans ?? []).filter((plan) => plan.status === 'OPEN')
  if (open.length === 0) {
    return (
      <TabEmpty
        icon={NoteEditIcon}
        title="No open plans"
        description="Size a position in the Calculator, then choose “Plan this position” to save it here until you take the trade."
        action={{ label: 'Go to Calculator', onClick: onCalculator }}
      />
    )
  }
  return (
    <ScrollArea className="py-2 [&>[data-slot=scroll-area-viewport]]:max-h-[26rem]">
      <div className="grid gap-3 pr-3">
        {open.map((plan) => (
          <PlanCard key={plan.id} workspaceId={workspaceId} plan={plan} onEdit={() => onEdit(plan)} />
        ))}
        <p className="text-center text-xs text-muted-foreground">
          Once you take a trade, link its plan from the trade in the journal.
        </p>
      </div>
    </ScrollArea>
  )
}
