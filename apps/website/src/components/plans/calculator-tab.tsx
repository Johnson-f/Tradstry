import { useEffect, useId, useState } from 'react'
import { AffixInput, ChoiceToggle, Field, Notice } from '@/components/plans/calculator-bits'
import { Button } from '@/components/ui/button'
import { DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  type PlanAssetClass,
  type PlanForm,
  type PlanningRule,
  formatSize,
  newTranche,
  sizePlan,
  stopProblem,
} from '@/lib/client/plans/plan-model'
import { money, toNumber } from '@/lib/client/trades/trades-model'

const ASSETS: Array<{ value: PlanAssetClass; label: string }> = [
  { value: 'STOCK', label: 'Stock' },
  { value: 'OPTION', label: 'Option' },
]

const storageKey = (workspaceId: string) => `tradstry.position-calculator.${workspaceId}`

type CalculatorTrade = Pick<PlanForm, 'symbol' | 'assetClass' | 'direction' | 'tranches' | 'stop' | 'roundUp'>

/** Restore trade inputs only. Older drafts may also contain a risk override. */
function storedTrade(workspaceId: string): CalculatorTrade {
  let stored: Partial<CalculatorTrade> & { entry?: string } = {}
  try {
    stored = JSON.parse(localStorage.getItem(storageKey(workspaceId)) ?? '{}') ?? {}
  } catch {
    // Start with empty trade inputs if the saved draft cannot be read.
  }
  return {
    symbol: stored.symbol ?? '',
    assetClass: stored.assetClass ?? 'STOCK',
    direction: stored.direction ?? 'LONG',
    tranches: [newTranche(stored.tranches?.[0]?.entry ?? stored.entry ?? '', '100')],
    stop: stored.stop ?? '',
    roundUp: stored.roundUp ?? false,
  }
}

function percentText(value: number): string {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

export function CalculatorTab({
  workspaceId,
  rule,
  onPlan,
}: {
  workspaceId: string
  rule: PlanningRule
  onPlan: (form: PlanForm, balance: number | null) => void
}) {
  const id = useId()
  const [draft, setDraft] = useState(() => storedTrade(workspaceId))
  const [problem, setProblem] = useState<string | null>(null)
  const form: PlanForm = { ...draft, riskMode: 'PERCENT', risk: rule.riskPercent ?? '', note: '', target: '' }

  useEffect(() => {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(draft))
  }, [draft, workspaceId])

  const set = (change: Partial<CalculatorTrade>) => {
    setDraft((current) => ({ ...current, ...change }))
    setProblem(null)
  }
  const balance = toNumber(rule.balance)
  const usableBalance = balance !== null && balance > 0 ? balance : null
  const needsRule = rule.riskPercent === null || usableBalance === null
  const down = sizePlan({ ...form, roundUp: false }, usableBalance)
  const up = sizePlan({ ...form, roundUp: true }, usableBalance)
  const sizing = form.roundUp ? up : down
  const canRound = up.ok && (!down.ok || down.quantity !== up.quantity)
  const entry = form.tranches[0]?.entry ?? ''
  const stopError = stopProblem(form)
  const isOption = form.assetClass === 'OPTION'
  const maxStop = toNumber(rule.maxStopPercent)
  const plan = () => {
    if (!form.symbol.trim()) {
      setProblem('Enter a symbol to plan this position.')
      document.getElementById(`${id}-symbol`)?.focus()
      return
    }
    if (sizing.ok) onPlan(form, usableBalance)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="-mr-4 min-h-0 flex-1">
        <div className="grid gap-5 pt-3 pr-5 pb-5 pl-1">
          <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-4">
            <div className="col-span-2 sm:col-span-1">
              <Field label={isOption ? 'Underlying' : 'Symbol'} htmlFor={`${id}-symbol`} error={problem}>
                <Input
                  id={`${id}-symbol`}
                  value={form.symbol}
                  onChange={(event) => set({ symbol: event.target.value.toUpperCase() })}
                  placeholder="AAPL"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(problem)}
                  aria-describedby={problem ? `${id}-symbol-error` : undefined}
                />
              </Field>
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Asset</span>
              <ChoiceToggle label="Asset" value={form.assetClass} options={ASSETS} onChange={(assetClass) => set({ assetClass })} />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Side</span>
              <ChoiceToggle
                label="Side"
                value={form.direction}
                options={[{ value: 'LONG', label: 'Long' }, { value: 'SHORT', label: 'Short' }]}
                onChange={(direction) => set({ direction })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <Field label={isOption ? 'Entry premium' : 'Entry price'} htmlFor={`${id}-entry`}>
              <AffixInput
                id={`${id}-entry`}
                prefix="$"
                placeholder="0.00"
                value={entry}
                onChange={(event) => set({ tranches: [{ ...form.tranches[0], entry: event.target.value, percent: '100' }] })}
              />
            </Field>
            <Field label={isOption ? 'Stop premium' : 'Stop loss'} htmlFor={`${id}-stop`} error={stopError}>
              <AffixInput
                id={`${id}-stop`}
                prefix="$"
                placeholder="0.00"
                value={form.stop}
                aria-invalid={Boolean(stopError)}
                aria-describedby={stopError ? `${id}-stop-error` : undefined}
                onChange={(event) => set({ stop: event.target.value })}
              />
            </Field>
          </div>

          {needsRule ? (
            <Notice>Set your balance and risk in the Rule tab to calculate a position.</Notice>
          ) : !sizing.ok && sizing.message && !stopError && <Notice>{sizing.message}</Notice>}
          {canRound && up.ok && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {form.roundUp
                  ? `Rounding up adds ${money((up.actualRisk - up.riskDollars).toFixed(2))} over budget.`
                  : `Round ${isOption ? 'contracts' : 'shares'}`}
              </span>
              <ChoiceToggle
                label="Round the size"
                value={form.roundUp ? 'UP' : 'DOWN'}
                options={[
                  { value: 'DOWN', label: `Down (${down.ok ? down.quantity.toLocaleString() : 0})` },
                  { value: 'UP', label: `Up (${up.quantity.toLocaleString()})` },
                ]}
                onChange={(choice) => set({ roundUp: choice === 'UP' })}
              />
            </div>
          )}

          {sizing.ok && (
            <>
              <section aria-label="Calculated position" role="status" className="rounded-xl border bg-muted/30 px-4 py-4">
                <p className="text-xs text-muted-foreground">Position size</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{formatSize(sizing.quantity, form.assetClass)}</p>
                {sizing.exactQuantity !== sizing.quantity && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {sizing.exactQuantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} before rounding
                  </p>
                )}
                <dl className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">Risk at stop</dt>
                    <dd className="mt-1 font-medium tabular-nums">{money(sizing.actualRisk.toFixed(2))}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Stop distance</dt>
                    <dd className="mt-1 font-medium tabular-nums">{percentText(sizing.stopPercent)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Position value</dt>
                    <dd className="mt-1 font-medium tabular-nums">{money(sizing.cost.toFixed(2))}</dd>
                  </div>
                  {sizing.accountPercent !== null && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Account used</dt>
                      <dd className={`mt-1 font-medium tabular-nums ${sizing.overBalance ? 'text-destructive' : ''}`}>{percentText(sizing.accountPercent)}</dd>
                    </div>
                  )}
                </dl>
              </section>
              {maxStop !== null && sizing.stopPercent > maxStop && (
                <Notice>Stop distance ({percentText(sizing.stopPercent)}) exceeds your rule maximum of {percentText(maxStop)}.</Notice>
              )}
              {sizing.overBalance && usableBalance !== null && (
                <Notice>Position value ({money(sizing.cost.toFixed(2))}) exceeds your account balance ({money(String(usableBalance))}).</Notice>
              )}
            </>
          )}
        </div>
      </ScrollArea>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t pt-3">
        <DialogClose render={<Button type="button" variant="outline" />}>Close</DialogClose>
        <Button type="button" disabled={!sizing.ok} onClick={plan}>Plan this position</Button>
      </div>
    </div>
  )
}
