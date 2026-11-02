import { useEffect, useId, useState } from 'react'
import { AffixInput, ChoiceToggle, Field, Notice, ResultRow } from '@/components/plans/calculator-bits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  type PlanAssetClass,
  type PlanForm,
  type PlanningRule,
  emptyPlanForm,
  formatSize,
  newTranche,
  sizePlan,
  stopProblem,
} from '@/lib/client/plans/plan-model'
import { type Decimal, money, toNumber } from '@/lib/client/trades/trades-model'
import { formatDate } from '@/lib/format'

const ASSETS: Array<{ value: PlanAssetClass; label: string }> = [
  { value: 'STOCK', label: 'Stock' },
  { value: 'OPTION', label: 'Option' },
]

const storageKey = (workspaceId: string) => `tradstry.position-calculator.${workspaceId}`

/** The last inputs for this workspace, so reopening the calculator picks up where you left off. */
function storedForm(workspaceId: string, fallback: PlanForm): PlanForm {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (!raw) return fallback
    const stored = JSON.parse(raw) as Partial<PlanForm> & { entry?: string }
    const entry = stored.tranches?.[0]?.entry ?? stored.entry ?? ''
    return { ...fallback, ...stored, tranches: [newTranche(entry, '100')], target: '', note: '' }
  } catch {
    return fallback
  }
}

function percentText(value: number): string {
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

export function CalculatorTab({
  workspaceId,
  rule,
  defaultRisk,
  onPlan,
}: {
  workspaceId: string
  rule: PlanningRule
  defaultRisk: Decimal | null
  onPlan: (form: PlanForm, balance: number | null) => void
}) {
  const id = useId()
  const [form, setForm] = useState(() => storedForm(workspaceId, emptyPlanForm(defaultRisk, rule.riskPercent)))
  const [balanceInput, setBalanceInput] = useState(rule.balance ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    const { target: _target, note: _note, ...kept } = form
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(kept))
  }, [form, workspaceId])

  const set = (change: Partial<PlanForm>) => {
    setForm((current) => ({ ...current, ...change }))
    setProblem(null)
  }
  const balance = toNumber(balanceInput.replace(/[$,\s]/g, '') || null)
  const usableBalance = balance !== null && balance > 0 ? balance : null
  const down = sizePlan({ ...form, roundUp: false }, usableBalance)
  const up = sizePlan({ ...form, roundUp: true }, usableBalance)
  const sizing = form.roundUp ? up : down
  const canRound = up.ok && (!down.ok || down.quantity !== up.quantity)
  const entry = form.tranches[0]?.entry ?? ''
  const stopError = stopProblem(form)
  const isOption = form.assetClass === 'OPTION'
  const maxStop = toNumber(rule.maxStopPercent)
  const ruleBalance = toNumber(rule.balance)
  const overridden = ruleBalance !== null && balance !== ruleBalance

  const balanceHint = overridden ? (
    <>
      Overridden ·{' '}
      <button
        type="button"
        className="underline underline-offset-2 hover:text-foreground"
        onClick={() => setBalanceInput(rule.balance ?? '')}
      >
        Reset to {money(rule.balance)}
      </button>
    </>
  ) : rule.source === 'BROKERAGE' ? (
    `↻ Synced from your brokerage${rule.asOf ? ` · ${formatDate(rule.asOf)}` : ''}`
  ) : rule.source === 'MANUAL' ? (
    'Default from your Rule'
  ) : (
    'Set a default balance in the Rule tab.'
  )

  return (
    <div className="grid gap-4 py-2">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Field label={isOption ? 'Underlying' : 'Symbol'} htmlFor={`${id}-symbol`}>
          <Input
            id={`${id}-symbol`}
            value={form.symbol}
            onChange={(event) => set({ symbol: event.target.value.toUpperCase() })}
            placeholder="AAPL"
            autoComplete="off"
            spellCheck={false}
            className="w-40"
          />
        </Field>
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">Asset</span>
            <ChoiceToggle label="Asset" value={form.assetClass} options={ASSETS} onChange={(assetClass) => set({ assetClass })} />
          </div>
          <div className="grid gap-2">
            <span className="text-sm leading-none font-medium">Position Type</span>
            <ChoiceToggle
              label="Position type"
              value={form.direction}
              options={[
                { value: 'LONG', label: 'Long' },
                { value: 'SHORT', label: 'Short' },
              ]}
              onChange={(direction) => set({ direction })}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isOption ? 'Entry Premium' : 'Entry Price'} htmlFor={`${id}-entry`}>
          <AffixInput
            id={`${id}-entry`}
            prefix="$"
            placeholder="0.00"
            value={entry}
            onChange={(event) => set({ tranches: [{ ...form.tranches[0], entry: event.target.value, percent: '100' }] })}
          />
        </Field>
        <Field label={isOption ? 'Stop Premium' : 'Stop Loss'} htmlFor={`${id}-stop`} error={stopError}>
          <AffixInput
            id={`${id}-stop`}
            prefix="$"
            placeholder="0.00"
            value={form.stop}
            aria-invalid={stopError ? true : undefined}
            aria-describedby={stopError ? `${id}-stop-error` : undefined}
            onChange={(event) => set({ stop: event.target.value })}
          />
        </Field>
        <Field label="Workspace Balance (USD)" htmlFor={`${id}-balance`} hint={balanceHint}>
          <AffixInput
            id={`${id}-balance`}
            prefix="$"
            placeholder="10,000.00"
            value={balanceInput}
            onChange={(event) => setBalanceInput(event.target.value)}
          />
        </Field>
        <Field
          label={form.riskMode === 'PERCENT' ? 'Workspace Risk (%)' : 'Risk per Trade ($)'}
          htmlFor={`${id}-risk`}
          hint={
            sizing.ok && form.riskMode === 'PERCENT'
              ? `${money(sizing.riskDollars.toFixed(2))} at risk`
              : sizing.ok && usableBalance !== null
                ? `${percentText((sizing.riskDollars / usableBalance) * 100)} of your balance`
                : undefined
          }
          aside={
            <ChoiceToggle
              label="Risk in"
              value={form.riskMode}
              options={[
                { value: 'PERCENT', label: '%', title: 'Percent of balance' },
                { value: 'DOLLARS', label: '$', title: 'Dollars' },
              ]}
              onChange={(riskMode) => set({ riskMode, risk: riskMode === 'PERCENT' ? (rule.riskPercent ?? '') : (defaultRisk ?? '') })}
            />
          }
        >
          <AffixInput
            id={`${id}-risk`}
            prefix={form.riskMode === 'DOLLARS' ? '$' : undefined}
            suffix={form.riskMode === 'PERCENT' ? '%' : undefined}
            placeholder={form.riskMode === 'PERCENT' ? '1.00' : '200.00'}
            value={form.risk}
            onChange={(event) => set({ risk: event.target.value })}
          />
        </Field>
      </div>

      {(sizing.ok || canRound || (sizing.message && !stopError)) && <Separator />}

      {!sizing.ok && sizing.message && !stopError && <Notice>{sizing.message}</Notice>}

      {canRound && up.ok && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            Round {isOption ? 'contracts' : 'shares'}?
            {form.roundUp && ` Up risks ${money((up.actualRisk - up.riskDollars).toFixed(2))} more than you chose.`}
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
        <div role="status" aria-live="polite" className="grid gap-4">
          {maxStop !== null && sizing.stopPercent > maxStop && (
            <Notice>
              Stop loss distance ({percentText(sizing.stopPercent)}) exceeds your rule maximum of {percentText(maxStop)}.
            </Notice>
          )}
          {sizing.overBalance && usableBalance !== null && (
            <Notice>
              Position value ({money(sizing.cost.toFixed(2))}) exceeds your account balance ({money(String(usableBalance))}).
            </Notice>
          )}
          <div className="grid gap-1">
            {sizing.exactQuantity !== sizing.quantity && (
              <ResultRow
                label={`${isOption ? 'Contracts' : 'Shares'} (raw)`}
                value={sizing.exactQuantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              />
            )}
            <ResultRow
              label={isOption ? 'Contracts to buy' : 'Shares to buy'}
              value={formatSize(sizing.quantity, form.assetClass)}
              strong
            />
            <ResultRow
              label="Risk"
              value={
                <>
                  {money(sizing.actualRisk.toFixed(2))}
                  <span className="px-2 text-muted-foreground">·</span>
                  {percentText(sizing.stopPercent)}
                </>
              }
            />
            <ResultRow label="Position value" value={money(sizing.cost.toFixed(2))} />
            {sizing.accountPercent !== null && (
              <ResultRow
                label="% of account"
                value={percentText(sizing.accountPercent)}
                tone={sizing.overBalance ? 'bad' : undefined}
              />
            )}
          </div>
          {problem && (
            <p role="alert" className="text-right text-xs text-destructive">
              {problem}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (!form.symbol.trim()) {
                  setProblem('Enter a symbol to plan this position.')
                  return
                }
                onPlan(form, usableBalance)
              }}
            >
              Plan this position
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
