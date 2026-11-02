import { CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { fieldControlClass } from '@/components/trades/form-styles'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { localToday, parseLocalDay } from '@/lib/format'

const FIRST_MONTH = new Date(1990, 0)
/** Option expiries and other open-ended dates can be a few years out. */
const OPEN_ENDED_LAST_MONTH = new Date(new Date().getFullYear() + 5, 11)

/** A `YYYY-MM-DD` date chosen from a calendar, styled like the other form fields. */
export function DateField({
  id,
  value,
  onChange,
  max,
  placeholder = 'Pick a date',
  describedBy,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  /** Latest day that can be picked, `YYYY-MM-DD`. */
  max?: string
  placeholder?: string
  describedBy?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = parseLocalDay(value)
  const latest = max ? parseLocalDay(max) : undefined
  const lastMonth = latest ?? OPEN_ENDED_LAST_MONTH

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-describedby={describedBy}
        render={
          <Button
            type="button"
            variant="outline"
            className={`${fieldControlClass} w-full justify-between font-normal ${selected ? '' : 'text-muted-foreground'}`}
          />
        }
      >
        {selected
          ? selected.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
          : placeholder}
        <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 font-[Arial,Helvetica,sans-serif]">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? latest}
          captionLayout="dropdown"
          startMonth={FIRST_MONTH}
          endMonth={lastMonth}
          disabled={latest ? { after: latest } : undefined}
          onSelect={(day) => {
            onChange(day ? localToday(day) : '')
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** A local date and time as `YYYY-MM-DDTHH:mm`: a calendar for the day and a time input. */
export function DateTimeField({
  id,
  value,
  onChange,
  max,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  max?: string
}) {
  const [day = '', time = ''] = value.split('T')
  const join = (nextDay: string, nextTime: string) => onChange(nextDay ? `${nextDay}T${nextTime || '09:30'}` : '')
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2">
      <DateField id={id} value={day} max={max} onChange={(nextDay) => join(nextDay, time)} />
      <Input
        type="time"
        aria-label="Time"
        value={time}
        onChange={(event) => join(day, event.target.value)}
        className={`${fieldControlClass} tabular-nums`}
      />
    </div>
  )
}
