import { useId, useState } from 'react'
import { AffixInput } from '@/components/plans/calculator-bits'
import { Button } from '@/components/ui/button'
import type { PlanningRule } from '@/lib/client/plans/plan-model'
import { useSavePlanningRule } from '@/lib/client/plans/plans'
import { money, toNumber, tradeErrorMessage } from '@/lib/client/trades/trades-model'
import { formatDate } from '@/lib/format'

const clean = (value: string) => value.replace(/[$,%\s]/g, '')

function RuleRow({
  title,
  htmlFor,
  description,
  children,
}: {
  title: string
  htmlFor?: string
  description: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3.5">
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium">
            {title}
          </label>
        ) : (
          <p className="text-sm font-medium">{title}</p>
        )}
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** The workspace's defaults: balance, percent risked per trade, and the widest stop before a warning. */
export function RuleTab({ workspaceId, workspaceName, rule }: { workspaceId: string; workspaceName: string; rule: PlanningRule }) {
  const id = useId()
  const save = useSavePlanningRule(workspaceId)
  const synced = rule.source === 'BROKERAGE'
  const [balance, setBalance] = useState(rule.manualBalance ?? '')
  const [riskPercent, setRiskPercent] = useState(rule.riskPercent ?? '')
  const [maxStop, setMaxStop] = useState(rule.maxStopPercent ?? '')
  const [saved, setSaved] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const balanceValue = synced ? toNumber(rule.balance) : toNumber(clean(balance) || null)
  const riskValue = toNumber(clean(riskPercent) || null)
  const maxStopValue = toNumber(clean(maxStop) || null)
  const riskAmount =
    balanceValue !== null && riskValue !== null && balanceValue > 0 && riskValue > 0 ? balanceValue * (riskValue / 100) : null
  const dirty =
    (!synced && clean(balance) !== clean(rule.manualBalance ?? '')) ||
    clean(riskPercent) !== clean(rule.riskPercent ?? '') ||
    clean(maxStop) !== clean(rule.maxStopPercent ?? '')
  const edit = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value)
    setSaved(false)
    setProblem(null)
  }

  const submit = () => {
    const fields: Array<[string, number | null]> = [
      ['balance', synced ? null : toNumber(clean(balance) || null)],
      ['risk per trade', riskValue],
      ['maximum stop', maxStopValue],
    ]
    const bad = fields.find(([, value]) => value !== null && (Number.isNaN(value) || value <= 0))
    if (bad) return setProblem(`Enter a ${bad[0]} above zero, or leave it empty.`)
    save.mutate(
      {
        manualBalance: synced ? rule.manualBalance : clean(balance) || null,
        riskPercent: clean(riskPercent) || null,
        maxStopPercent: clean(maxStop) || null,
      },
      { onSuccess: () => setSaved(true) },
    )
  }

  return (
    <form
      className="grid gap-4 py-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <p className="text-sm text-muted-foreground">
        Defaults for {workspaceName}. The calculator starts from these, and you can change them there for a single
        calculation.
      </p>

      <fieldset
        disabled={save.isPending}
        className="min-w-0 divide-y divide-border overflow-hidden rounded-lg border border-border"
      >
        <RuleRow
          title="Account balance"
          htmlFor={synced ? undefined : `${id}-balance`}
          description={
            synced
              ? `Synced from your brokerage${rule.asOf ? ` · ${formatDate(rule.asOf)}` : ''}`
              : 'What percent risk is measured against.'
          }
        >
          {synced ? (
            <p className="text-sm font-medium tabular-nums">{money(rule.balance)}</p>
          ) : (
            <AffixInput
              id={`${id}-balance`}
              prefix="$"
              placeholder="10,000.00"
              value={balance}
              onChange={edit(setBalance)}
              className="w-36"
            />
          )}
        </RuleRow>
        <RuleRow
          title="Risk per trade"
          htmlFor={`${id}-risk`}
          description={
            riskAmount !== null ? (
              <>
                <span className="font-medium text-foreground tabular-nums">{money(riskAmount.toFixed(2))}</span> of your
                balance on each trade.
              </>
            ) : (
              'The share of your balance you’re willing to lose on one trade.'
            )
          }
        >
          <AffixInput id={`${id}-risk`} suffix="%" placeholder="1.00" value={riskPercent} onChange={edit(setRiskPercent)} className="w-24" />
        </RuleRow>
        <RuleRow
          title="Max stop distance"
          htmlFor={`${id}-max-stop`}
          description="Warn when the stop is further than this from the entry."
        >
          <AffixInput id={`${id}-max-stop`} suffix="%" placeholder="2.00" value={maxStop} onChange={edit(setMaxStop)} className="w-24" />
        </RuleRow>
      </fieldset>

      <div className="flex items-center justify-end gap-3">
        {(problem || save.error) && (
          <p role="alert" className="mr-auto text-xs text-destructive">
            {problem ?? tradeErrorMessage(save.error, 'Could not save the rule. Try again.')}
          </p>
        )}
        {saved && !dirty && (
          <span role="status" className="text-xs text-muted-foreground">
            Saved
          </span>
        )}
        <Button type="submit" size="sm" disabled={save.isPending || !dirty} aria-busy={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save rule'}
        </Button>
      </div>
    </form>
  )
}
