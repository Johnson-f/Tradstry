import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { AffixInput, ChoiceToggle, Field, Notice } from '@/components/plans/calculator-bits'
import { DirectionBadge } from '@/components/trades/trade-bits'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  MAX_TRANCHES,
  type PlanForm,
  type TradePlan,
  formatSize,
  planInput,
  rebalanceLast,
  sizePlan,
  splitLastEntry,
  stopProblem,
  updateTranche,
} from '@/lib/client/plans/plan-model'
import { useSavePlan } from '@/lib/client/plans/plans'
import { money, price, tradeErrorMessage } from '@/lib/client/trades/trades-model'

export interface PlanSeed {
  draftId: string
  form: PlanForm
  balance: number | null
  editing: TradePlan | null
}

export function PlanComposer({
  workspaceId,
  seed,
  maxStop,
  onCancel,
  onSaved,
}: {
  workspaceId: string
  seed: PlanSeed
  maxStop: number | null
  onCancel: () => void
  onSaved: () => void
}) {
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  const save = useSavePlan(workspaceId)
  const [form, setForm] = useState(seed.form)
  const [editPrices, setEditPrices] = useState(Boolean(seed.editing))
  const [problem, setProblem] = useState<string | null>(null)
  const set = (change: Partial<PlanForm>) => {
    setForm((current) => ({ ...current, ...change }))
    setProblem(null)
    if (save.isError) save.reset()
  }
  const down = sizePlan({ ...form, roundUp: false }, seed.balance)
  const up = sizePlan({ ...form, roundUp: true }, seed.balance)
  const sizing = form.roundUp ? up : down
  const stopError = stopProblem(form)
  const multiple = form.tranches.length > 1
  const option = form.assetClass === 'OPTION'
  const entryLabel = option ? 'Entry premium' : 'Entry price'
  const stopLabel = option ? 'Stop premium' : 'Stop loss'
  const saveError =
    problem ?? (save.error ? tradeErrorMessage(save.error, 'Could not save the plan. Try again.') : null)

  const savePlan = (event: React.FormEvent) => {
    event.preventDefault()
    if (save.isPending) return
    const result = planInput(form, seed.balance)
    if (!result.ok) {
      setProblem(result.message)
      return
    }
    save.mutate({ id: seed.editing?.id ?? null, input: result.input }, { onSuccess: onSaved })
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={savePlan}>
      <ScrollArea className="-mr-4 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] [&>[data-slot=scroll-area-viewport]]:h-auto">
        <fieldset disabled={save.isPending} className="grid min-w-0 content-start gap-5 pt-3 pr-5 pb-5 pl-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">
              {form.symbol}
            </h3>
            <DirectionBadge direction={form.direction === 'LONG' ? 'long' : 'short'} />
            <span className="text-sm text-muted-foreground">{option ? 'Option' : 'Stock'}</span>
          </div>
          <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.65fr)]">
            <div className="grid min-w-0 gap-5">
              <section aria-labelledby={`${id}-setup`} className="grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <h4 id={`${id}-setup`} className="text-sm font-semibold">
                    Trade setup
                  </h4>
                  {!editPrices && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditPrices(true)}>
                      <Pencil aria-hidden /> Edit setup
                    </Button>
                  )}
                </div>
                {editPrices ? (
                  <>
                    <div className="grid grid-cols-2 items-start gap-3">
                      {!multiple && (
                        <Field label={entryLabel} htmlFor={`${id}-entry`}>
                          <AffixInput
                            id={`${id}-entry`}
                            prefix="$"
                            value={form.tranches[0].entry}
                            onChange={(e) =>
                              set({
                                tranches: updateTranche(form.tranches, form.tranches[0].id, {
                                  entry: e.target.value,
                                }),
                              })
                            }
                          />
                        </Field>
                      )}
                      <Field label={stopLabel} htmlFor={`${id}-stop`} error={stopError}>
                        <AffixInput
                          id={`${id}-stop`}
                          prefix="$"
                          value={form.stop}
                          aria-invalid={Boolean(stopError)}
                          aria-describedby={stopError ? `${id}-stop-error` : undefined}
                          onChange={(e) => set({ stop: e.target.value })}
                        />
                      </Field>
                    </div>
                    {multiple && (
                      <div className="grid gap-3 md:grid-cols-2">
                        {form.tranches.map((entry, index) => {
                          const sized = sizing.ok ? sizing.tranches[index] : null
                          const name = `Entry ${index + 1}`
                          return (
                            <div className="min-w-0 space-y-2 rounded-lg border p-3 md:space-y-1.5 md:p-2.5" key={entry.id}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">{name}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label={`Remove ${name.toLowerCase()}`}
                                  onClick={() =>
                                    set({
                                      tranches: rebalanceLast(
                                        form.tranches.filter((row) => row.id !== entry.id),
                                      ),
                                    })
                                  }
                                >
                                  <Trash2 aria-hidden />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <Field label={option ? 'Premium' : 'Price'} htmlFor={`${id}-price-${entry.id}`}>
                                  <AffixInput
                                    id={`${id}-price-${entry.id}`}
                                    aria-label={`${name} price`}
                                    prefix="$"
                                    value={entry.entry}
                                    onChange={(e) =>
                                      set({
                                        tranches: updateTranche(form.tranches, entry.id, {
                                          entry: e.target.value,
                                        }),
                                      })
                                    }
                                  />
                                </Field>
                                <Field label="Share of risk" htmlFor={`${id}-share-${entry.id}`}>
                                  <AffixInput
                                    id={`${id}-share-${entry.id}`}
                                    aria-label={`${name} share of risk`}
                                    suffix="%"
                                    value={entry.percent}
                                    onChange={(e) =>
                                      set({
                                        tranches: updateTranche(form.tranches, entry.id, {
                                          percent: e.target.value,
                                        }),
                                      })
                                    }
                                  />
                                </Field>
                              </div>
                              {sized && (
                                <p className="text-xs text-muted-foreground tabular-nums">
                                  {formatSize(sized.quantity, form.assetClass)} · {money(String(sized.risk))} at
                                  stop · {money(String(sized.riskPerUnit))}/{option ? 'contract' : 'share'}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">{entryLabel}</dt>
                      <dd className="mt-1 text-lg font-medium tabular-nums">
                        {price(form.tranches[0].entry)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{stopLabel}</dt>
                      <dd className="mt-1 text-lg font-medium tabular-nums">{price(form.stop)}</dd>
                    </div>
                  </dl>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="justify-self-start"
                  disabled={form.tranches.length >= MAX_TRANCHES}
                  onClick={() => {
                    setEditPrices(true)
                    set({ tranches: splitLastEntry(form.tranches) })
                  }}
                >
                  <Plus aria-hidden /> Add entry
                </Button>
                {editPrices && up.ok && (!down.ok || up.quantity !== down.quantity) && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Round {option ? 'contracts' : 'shares'}
                    </span>
                    <ChoiceToggle
                      label="Round sizes"
                      value={form.roundUp ? 'UP' : 'DOWN'}
                      options={[
                        { value: 'DOWN', label: `Down (${down.ok ? down.quantity : 0})` },
                        { value: 'UP', label: `Up (${up.quantity})` },
                      ]}
                      onChange={(choice) => set({ roundUp: choice === 'UP' })}
                    />
                  </div>
                )}
              </section>
              <details className="group border-t pt-3" open={Boolean(seed.form.target || seed.form.note)}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm py-1 text-sm font-medium focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  Target and note
                  <ChevronDown className="size-4 text-muted-foreground group-open:rotate-180" aria-hidden />
                </summary>
                <div className="grid gap-3 pt-3">
                  <Field label="Profit target (optional)" htmlFor={`${id}-target`}>
                    <AffixInput
                      id={`${id}-target`}
                      prefix="$"
                      placeholder="0.00"
                      value={form.target}
                      onChange={(e) => set({ target: e.target.value })}
                    />
                  </Field>
                  <Field label="Trade note (optional)" htmlFor={`${id}-note`}>
                    <Textarea
                      id={`${id}-note`}
                      rows={2}
                      maxLength={2000}
                      value={form.note}
                      onChange={(e) => set({ note: e.target.value })}
                    />
                  </Field>
                </div>
              </details>
            </div>
            <section
              aria-label="Plan summary"
              aria-live="polite"
              className="min-w-0 rounded-xl border bg-muted/30 p-4"
            >
              <p className="text-xs text-muted-foreground">Planned position</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                {sizing.ok ? formatSize(sizing.quantity, form.assetClass) : '—'}
              </p>
              <dl className="mt-4 grid gap-2.5 border-t pt-3 text-xs [&>div]:flex [&>div]:flex-wrap [&>div]:justify-between [&>div]:gap-1 [&_dd]:font-medium [&_dd]:tabular-nums [&_dt]:text-muted-foreground">
                <div>
                  <dt>Position value</dt>
                  <dd>{sizing.ok ? money(String(sizing.cost)) : '—'}</dd>
                </div>
                {multiple && (
                  <div>
                    <dt>Average entry</dt>
                    <dd>{sizing.ok ? price(String(sizing.entry)) : '—'}</dd>
                  </div>
                )}
                {!multiple && sizing.ok && (
                  <div>
                    <dt>Risk per {option ? 'contract' : 'share'}</dt>
                    <dd>{money(String(sizing.tranches[0].riskPerUnit))}</dd>
                  </div>
                )}
                <div>
                  <dt>Risk at stop</dt>
                  <dd>{sizing.ok ? money(String(sizing.actualRisk)) : '—'}</dd>
                </div>
                <div>
                  <dt>Risk budget</dt>
                  <dd>{money(form.risk)}</dd>
                </div>
                {sizing.ok && sizing.rewardRisk !== null && (
                  <div>
                    <dt>Reward / risk</dt>
                    <dd>{sizing.rewardRisk.toFixed(1)}R</dd>
                  </div>
                )}
              </dl>
            </section>
          </div>
          {!sizing.ok && !stopError && (
            <p role="status" className="text-sm text-destructive">
              {sizing.message ?? 'Enter a price for each entry and a stop to size this plan.'}
            </p>
          )}
          {sizing.ok && sizing.actualRisk - sizing.riskDollars >= 0.005 && (
            <Notice>
              Rounding up puts the planned risk {money(String(sizing.actualRisk - sizing.riskDollars))} over
              budget.
            </Notice>
          )}
          {sizing.ok && maxStop !== null && sizing.stopPercent > maxStop && (
            <Notice>
              Stop distance ({sizing.stopPercent.toFixed(2)}%) exceeds your {maxStop}% rule.
            </Notice>
          )}
        </fieldset>
      </ScrollArea>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
        {saveError && (
          <p role="alert" className="w-full text-xs text-destructive">
            {saveError}
          </p>
        )}
        <Button type="button" variant="ghost" disabled={save.isPending} onClick={onCancel}>
          {seed.editing ? 'Cancel' : 'Back to calculator'}
        </Button>
        <Button type="submit" disabled={save.isPending || !sizing.ok} aria-busy={save.isPending}>
          {save.isPending ? 'Saving…' : seed.editing ? 'Save changes' : 'Save plan'}
        </Button>
      </footer>
    </form>
  )
}
