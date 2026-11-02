import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  type Decimal,
  STATUS_LABEL,
  TONE_CLASS,
  type TradeSummary,
  directionLabel,
  money,
  tone,
} from '@/lib/client/trades/trades-model'

export function Pnl({ value, signed = true, className = '' }: { value: Decimal | null; signed?: boolean; className?: string }) {
  return <span className={`tabular-nums ${TONE_CLASS[tone(value)]} ${className}`}>{money(value, { signed })}</span>
}

export function DirectionBadge({ direction }: { direction: TradeSummary['direction'] }) {
  return (
    <Badge
      variant={direction === 'short' ? 'destructive' : 'secondary'}
      className={`font-normal ${direction === 'long' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400' : ''}`}
    >
      {directionLabel(direction)}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: TradeSummary['status'] }) {
  if (status === 'closed') return null
  return (
    <Badge variant={status === 'incomplete' ? 'destructive' : 'outline'} className="font-normal">
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export interface Choice<T extends string> {
  value: T
  label: string
}

/** A labelled select over a fixed set of choices. */
export function ChoiceField<T extends string>({
  id,
  label,
  value,
  choices,
  onChange,
  hideLabel = false,
  className = 'h-8 w-36 bg-background text-xs',
  labelClassName = 'text-xs font-normal text-muted-foreground',
}: {
  id: string
  label: string
  value: T
  choices: Array<Choice<T>>
  onChange: (value: T) => void
  hideLabel?: boolean
  className?: string
  labelClassName?: string
}) {
  const current = choices.find((choice) => choice.value === value)
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className={hideLabel ? 'sr-only' : labelClassName}>
        {label}
      </Label>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next as T)
        }}
      >
        <SelectTrigger id={id} className={className}>
          <SelectValue>{current?.label ?? label}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} className="p-1 data-open:animate-none data-closed:animate-none">
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value} className="py-2">
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
