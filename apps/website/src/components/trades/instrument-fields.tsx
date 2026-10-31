import { ChoiceField } from '@/components/trades/trade-bits'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FillForm } from '@/lib/client/trades/trades-model'

export type InstrumentForm = Pick<FillForm, 'assetClass' | 'symbol' | 'expiry' | 'right' | 'strike'>

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
      <div className="grid grid-cols-2 gap-3">
        <ChoiceField
          id={`${id}-asset`}
          label="Instrument"
          value={value.assetClass}
          onChange={(assetClass) => onChange({ assetClass })}
          className="h-9 w-full bg-background text-sm"
          choices={[
            { value: 'STOCK', label: 'Stock or ETF' },
            { value: 'OPTION', label: 'Option' },
            { value: 'CRYPTO', label: 'Crypto' },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-symbol`} className="text-xs font-normal text-muted-foreground">
            {value.assetClass === 'OPTION' ? 'Underlying' : 'Ticker'}
          </Label>
          <Input
            id={`${id}-symbol`}
            value={value.symbol}
            autoFocus={autoFocus}
            autoCapitalize="characters"
            placeholder="AAPL"
            onChange={(event) => onChange({ symbol: event.target.value })}
            className="h-9 bg-background uppercase"
          />
        </div>
      </div>
      {value.assetClass === 'OPTION' && (
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-expiry`} className="text-xs font-normal text-muted-foreground">
              Expiry
            </Label>
            <Input
              id={`${id}-expiry`}
              type="date"
              value={value.expiry}
              onChange={(event) => onChange({ expiry: event.target.value })}
              className="h-9 bg-background"
            />
          </div>
          <ChoiceField
            id={`${id}-right`}
            label="Type"
            value={value.right}
            onChange={(right) => onChange({ right })}
            className="h-9 w-full bg-background text-sm"
            choices={[
              { value: 'CALL', label: 'Call' },
              { value: 'PUT', label: 'Put' },
            ]}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-strike`} className="text-xs font-normal text-muted-foreground">
              Strike
            </Label>
            <Input
              id={`${id}-strike`}
              inputMode="decimal"
              value={value.strike}
              onChange={(event) => onChange({ strike: event.target.value })}
              className="h-9 bg-background"
            />
          </div>
        </div>
      )}
    </>
  )
}
