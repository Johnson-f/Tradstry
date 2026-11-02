import { DateField } from '@/components/trades/date-field'
import { ChoiceField } from '@/components/trades/trade-bits'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fieldControlClass, fieldLabelClass, fieldSelectClass } from '@/components/trades/form-styles'
import type { FillForm } from '@/lib/client/trades/trades-model'

export type InstrumentForm = Pick<FillForm, 'assetClass' | 'symbol' | 'expiry' | 'right' | 'strike'>


/** A labelled form control with an optional hint below it, which the control should name in `aria-describedby`. */
export function FormField({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className={fieldLabelClass}>
        {label}
      </Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/** An amount input with a leading currency sign. */
export function MoneyInput({ className = '', ...props }: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
      >
        $
      </span>
      <Input inputMode="decimal" {...props} className={`${fieldControlClass} pl-7 tabular-nums ${className}`} />
    </div>
  )
}

export function InstrumentFields({
  id,
  value,
  onChange,
  autoFocus = false,
}: {
  id: string
  value: InstrumentForm
  onChange: (change: Partial<InstrumentForm>) => void
  autoFocus?: boolean
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceField
          id={`${id}-asset`}
          label="Instrument"
          value={value.assetClass}
          onChange={(assetClass) => onChange({ assetClass })}
          className={fieldSelectClass}
          labelClassName={fieldLabelClass}
          choices={[
            { value: 'STOCK', label: 'Stock or ETF' },
            { value: 'OPTION', label: 'Option' },
            { value: 'CRYPTO', label: 'Crypto' },
          ]}
        />
        <FormField id={`${id}-symbol`} label={value.assetClass === 'OPTION' ? 'Underlying' : 'Ticker'}>
          <Input
            id={`${id}-symbol`}
            value={value.symbol}
            autoFocus={autoFocus}
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="e.g. AAPL"
            onChange={(event) => onChange({ symbol: event.target.value })}
            className={`${fieldControlClass} uppercase placeholder:normal-case`}
          />
        </FormField>
      </div>
      {value.assetClass === 'OPTION' && (
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id={`${id}-expiry`} label="Expiry">
            <DateField id={`${id}-expiry`} value={value.expiry} onChange={(expiry) => onChange({ expiry })} />
          </FormField>
          <ChoiceField
            id={`${id}-right`}
            label="Type"
            value={value.right}
            onChange={(right) => onChange({ right })}
            className={fieldSelectClass}
            labelClassName={fieldLabelClass}
            choices={[
              { value: 'CALL', label: 'Call' },
              { value: 'PUT', label: 'Put' },
            ]}
          />
          <FormField id={`${id}-strike`} label="Strike">
            <MoneyInput
              id={`${id}-strike`}
              value={value.strike}
              onChange={(event) => onChange({ strike: event.target.value })}
            />
          </FormField>
        </div>
      )}
    </>
  )
}
