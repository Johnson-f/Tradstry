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
import { DEFAULT_PERIOD, PERIODS, type Period, isPeriod } from '@/lib/client/home/home-model'

/** The dashboard's time window, kept in the URL. Only rendered on the dashboard. */
export function PeriodMenu({ workspaceId }: { workspaceId: string }) {
  const { period = DEFAULT_PERIOD } = useSearch({ from: '/_authenticated/w/$workspaceId/' })
  const navigate = useNavigate()
  const current = PERIODS.find((option) => option.value === period) ?? PERIODS.find((option) => option.value === DEFAULT_PERIOD)!

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
            void navigate({
              to: '/w/$workspaceId',
              params: { workspaceId },
              search: next === DEFAULT_PERIOD ? {} : { period: next as Period },
              replace: true,
            })
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
