import { useNavigate, useSearch } from '@tanstack/react-router'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { Fragment } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PERIODS, type Period, isPeriod } from '@/lib/client/home/home-model'
import { useDefaultPeriod } from '@/lib/client/settings'

/** The time window for the dashboard or analytics, kept in the URL. */
export function PeriodMenu({ workspaceId, section }: { workspaceId: string; section: 'home' | 'analytics' }) {
  const search: { period?: unknown } = useSearch({ strict: false })
  const defaultPeriod = useDefaultPeriod()
  const period = isPeriod(search.period) ? search.period : defaultPeriod
  const navigate = useNavigate()
  const current = PERIODS.find((option) => option.value === period) ?? PERIODS[2]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" />}
        aria-label={`Period: ${current.label}`}
        className="h-8 shrink-0 gap-2 px-2.5 sm:min-w-36"
      >
        <CalendarDays className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="flex-1 text-left max-sm:hidden">{current.label}</span>
        <span className="sm:hidden">{current.short}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        aria-label="Time period"
        className="w-48 max-w-[calc(100vw-24px)] rounded-xl p-1 font-[Arial,Helvetica,sans-serif] shadow-lg ring-border/70 data-open:animate-none data-closed:animate-none"
      >
        <DropdownMenuRadioGroup
          value={period}
          onValueChange={(next: unknown) => {
            if (!isPeriod(next)) return
            const chosen: Period = next
            if (section === 'home') {
              void navigate({ to: '/w/$workspaceId', params: { workspaceId }, search: { period: chosen }, replace: true })
            } else {
              void navigate({
                to: '/w/$workspaceId/analytics',
                params: { workspaceId },
                search: (previous) => ({ ...previous, period: chosen }),
                replace: true,
              })
            }
          }}
        >
          {PERIODS.map((option) => (
            <Fragment key={option.value}>
              {option.value === 'all' && <DropdownMenuSeparator className="mx-2 my-1" />}
              <DropdownMenuRadioItem
                value={option.value}
                label={option.label}
                showIndicator={false}
                className="min-h-8 gap-2 rounded-md px-2 py-1.5 text-[13px] data-checked:bg-accent data-checked:font-medium data-highlighted:bg-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring/60"
              >
                <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
                  {current.value === option.value && <Check className="size-3.5" strokeWidth={2} />}
                </span>
                <span className="flex-1">{option.label}</span>
              </DropdownMenuRadioItem>
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
