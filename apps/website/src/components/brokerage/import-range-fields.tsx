import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IMPORT_MODE_LABELS, type ImportMode } from '@/lib/client/brokerage/brokerage-model'
import { localToday } from '@/lib/format'

export function ImportRangeFields({
  mode,
  date,
  onModeChange,
  onDateChange,
  disabled = false,
  maxDate = localToday(),
  modes = Object.keys(IMPORT_MODE_LABELS) as ImportMode[],
  compact = false,
}: {
  mode: ImportMode
  date: string
  onModeChange: (mode: ImportMode) => void
  onDateChange: (date: string) => void
  disabled?: boolean
  maxDate?: string
  modes?: ImportMode[]
  compact?: boolean
}) {
  const id = useId()
  return (
    <div className={compact ? 'flex min-w-0 flex-wrap items-center gap-2' : 'grid gap-4 sm:grid-cols-2'}>
      <div className={compact ? 'flex min-w-0 items-center gap-2' : 'space-y-2'}>
        <Label
          htmlFor={`${id}-range`}
          className={compact ? 'text-xs font-normal text-muted-foreground' : undefined}
        >
          {compact ? 'History' : 'History to import'}
        </Label>
        <Select
          value={mode}
          onValueChange={(value) => {
            if (value) onModeChange(value)
          }}
          disabled={disabled}
        >
          <SelectTrigger
            id={`${id}-range`}
            className={compact ? 'h-8 w-36 bg-background text-xs' : 'h-10 w-full bg-background'}
          >
            <SelectValue>{IMPORT_MODE_LABELS[mode]}</SelectValue>
          </SelectTrigger>
          <SelectContent
            alignItemWithTrigger={false}
            className="p-1 data-open:animate-none data-closed:animate-none"
          >
            {modes.map((value) => (
              <SelectItem key={value} value={value} className="py-2">
                {IMPORT_MODE_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {mode === 'CUSTOM' && (
        <div className={compact ? 'min-w-0' : 'space-y-2'}>
          <Label htmlFor={`${id}-date`} className={compact ? 'sr-only' : undefined}>
            Start date
          </Label>
          <Input
            id={`${id}-date`}
            type="date"
            required
            max={maxDate}
            value={date}
            disabled={disabled}
            onChange={(event) => onDateChange(event.target.value)}
            className={compact ? 'h-8 w-36 min-w-0 bg-background text-xs' : 'h-10 min-w-0 bg-background'}
          />
        </div>
      )}
    </div>
  )
}
