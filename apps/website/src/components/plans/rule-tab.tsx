import { useId, useState } from 'react'
import { Landmark } from 'lucide-react'
import { AffixInput, Field } from '@/components/plans/calculator-bits'
import { Button } from '@/components/ui/button'
import { DialogClose } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { PlanningRule } from '@/lib/client/plans/plan-model'
import { useSavePlanningRule } from '@/lib/client/plans/plans'
import { money, toNumber, tradeErrorMessage } from '@/lib/client/trades/trades-model'
import { formatDate } from '@/lib/format'

const clean = (value: string) => value.replace(/[$,%\s]/g, '')

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
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <ScrollArea className="min-h-0 flex-1">
        <fieldset disabled={save.isPending} className="grid min-w-0 gap-6 px-1 pt-3 pb-5">
          <section aria-labelledby={`${id}-workspace`} className="rounded-xl border bg-muted/30 px-4 py-4 sm:px-5">
            <div className="flex items-center gap-3 border-b pb-3">
              <Landmark aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <h3 id={`${id}-workspace`} className="text-sm font-semibold wrap-anywhere">{workspaceName}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {synced
                    ? `Synced from your brokerage${rule.asOf ? ` · ${formatDate(rule.asOf)}` : ''}`
                    : 'Manual balance'}
                </p>
              </div>
            </div>
            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              {synced ? (
                <div>
                  <p className="text-xs text-muted-foreground">Account balance</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{money(rule.balance)}</p>
                </div>
              ) : (
                <div className="grid min-w-0 content-start gap-1.5">
                  <label htmlFor={`${id}-balance`} className="text-xs text-muted-foreground">Account balance</label>
                  <AffixInput
                    id={`${id}-balance`}
                    prefix="$"
                    placeholder="10,000.00"
                    value={balance}
                    onChange={edit(setBalance)}
                    className="bg-background"
                  />
                </div>
              )}
              <div className="sm:border-l sm:pl-5">
                <p id={`${id}-budget`} className="text-xs text-muted-foreground">Risk budget per trade</p>
                <output
                  aria-labelledby={`${id}-budget`}
                  htmlFor={synced ? `${id}-risk` : `${id}-balance ${id}-risk`}
                  className="mt-1 block text-2xl font-semibold tracking-tight tabular-nums"
                >
                  {riskAmount === null ? '—' : money(riskAmount.toFixed(2))}
                </output>
              </div>
            </div>
          </section>
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            <Field
              label="Risk per trade"
              htmlFor={`${id}-risk`}
              hint={<span id={`${id}-risk-hint`}>Percent of your balance to risk on one trade.</span>}
            >
              <AffixInput
                id={`${id}-risk`}
                suffix="%"
                placeholder="1.00"
                value={riskPercent}
                onChange={edit(setRiskPercent)}
                aria-describedby={`${id}-risk-hint`}
                className="h-10"
              />
            </Field>
            <Field
              label="Max stop distance"
              htmlFor={`${id}-max-stop`}
              hint={<span id={`${id}-stop-hint`}>Warn if your stop is farther from entry than this percentage.</span>}
            >
              <AffixInput
                id={`${id}-max-stop`}
                suffix="%"
                placeholder="2.00"
                value={maxStop}
                onChange={edit(setMaxStop)}
                aria-describedby={`${id}-stop-hint`}
                className="h-10"
              />
            </Field>
          </div>
        </fieldset>
      </ScrollArea>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t pt-3">
        {(problem || save.error) && (
          <p role="alert" className="mr-auto text-xs text-destructive">
            {problem ?? tradeErrorMessage(save.error, 'Could not save the rule. Try again.')}
          </p>
        )}
        {saved && !dirty && (
          <span role="status" className="mr-auto text-xs text-muted-foreground">
            Rule saved
          </span>
        )}
        <DialogClose render={<Button type="button" variant="outline" />}>Close</DialogClose>
        <Button type="submit" disabled={save.isPending || !dirty} aria-busy={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save rule'}
        </Button>
      </div>
    </form>
  )
}
