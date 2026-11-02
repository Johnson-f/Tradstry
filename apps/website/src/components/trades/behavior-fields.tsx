import { useId } from 'react'
import { MARKET_REGIMES, type TradeBehavior } from '@/lib/client/trades/trades-model'

const SCORES = [1, 2, 3, 4, 5]
const YES_NO = [
  { value: true, label: 'Yes' },
  { value: false, label: 'No' },
]

/** Buttons where one can be picked; picking it again clears it, because every field is optional. */
function Toggles<T extends string | number | boolean>({
  labelledBy,
  describedBy,
  value,
  options,
  onChange,
}: {
  labelledBy: string
  describedBy?: string
  value: T | null
  options: Array<{ value: T; label: string }>
  onChange: (value: T | null) => void
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="flex w-fit rounded-lg bg-muted/70 p-0.5 dark:bg-white/8"
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(value === option.value ? null : option.value)}
          className="flex h-8 min-w-9 items-center justify-center rounded-md px-2.5 text-[13px] text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-background aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-xs dark:aria-pressed:bg-white/12"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: (ids: { labelledBy: string; describedBy?: string }) => React.ReactNode
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-xs text-muted-foreground">
        {label}
      </span>
      {children({ labelledBy: `${id}-label`, describedBy: hint ? `${id}-hint` : undefined })}
      {hint && (
        <span id={`${id}-hint`} className="text-[11px] text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  )
}

function Question({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (value: boolean | null) => void
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <span id={id} className="text-sm">
        {label}
      </span>
      <Toggles labelledBy={id} value={value} options={YES_NO} onChange={onChange} />
    </div>
  )
}

/** Conviction, market, plan, revenge, the 30-minute rule and rule adherence for one trade. */
export function BehaviorFields({
  value,
  onChange,
}: {
  value: TradeBehavior
  onChange: (change: Partial<TradeBehavior>) => void
}) {
  const scores = SCORES.map((score) => ({ value: score, label: String(score) }))
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Conviction before entry" hint="1 unsure · 5 certain">
          {(ids) => (
            <Toggles {...ids} value={value.conviction} options={scores} onChange={(conviction) => onChange({ conviction })} />
          )}
        </Field>
        <Field label="Followed your rules" hint="1 not at all · 5 completely">
          {(ids) => (
            <Toggles
              {...ids}
              value={value.ruleAdherence}
              options={scores}
              onChange={(ruleAdherence) => onChange({ ruleAdherence })}
            />
          )}
        </Field>
      </div>
      <Field label="Market">
        {(ids) => (
          <Toggles
            {...ids}
            value={value.marketRegime}
            options={MARKET_REGIMES}
            onChange={(marketRegime) => onChange({ marketRegime })}
          />
        )}
      </Field>
      <div className="space-y-2.5">
        <Question
          label="Planned before the open?"
          value={value.plannedPreMarket}
          onChange={(plannedPreMarket) => onChange({ plannedPreMarket })}
        />
        <Question
          label="Revenge trade?"
          value={value.revengeTrade}
          onChange={(revengeTrade) => onChange({ revengeTrade })}
        />
        <Question
          label="Broke your 30-minute rule?"
          value={value.brokeThirtyMinuteRule}
          onChange={(brokeThirtyMinuteRule) => onChange({ brokeThirtyMinuteRule })}
        />
      </div>
    </div>
  )
}
