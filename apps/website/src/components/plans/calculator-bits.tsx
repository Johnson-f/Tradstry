import type { IconSvgElement } from '@hugeicons/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  aside,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: React.ReactNode
  error?: string | null
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/** A shadcn input with a fixed `$` or `%` beside the number. */
export function AffixInput({
  prefix,
  suffix,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { prefix?: string; suffix?: string }) {
  return (
    <div className="relative">
      {prefix && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        inputMode="decimal"
        autoComplete="off"
        {...props}
        className={cn('tabular-nums', prefix && 'pl-6', suffix && 'pr-7', className)}
      />
      {suffix && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  )
}

/** A single-choice shadcn toggle group; pressing the chosen item again keeps it. */
export function ChoiceToggle<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'sm',
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string; title?: string }>
  onChange: (value: T) => void
  size?: 'sm' | 'default'
}) {
  return (
    <ToggleGroup
      aria-label={label}
      variant="outline"
      size={size}
      spacing={0}
      value={[value]}
      onValueChange={(next) => {
        const chosen = next[0] as T | undefined
        if (chosen) onChange(chosen)
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} aria-label={option.title ?? option.label}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function ResultRow({ label, value, strong, tone }: { label: string; value: React.ReactNode; strong?: boolean; tone?: 'bad' }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-sm tabular-nums',
          strong ? 'text-base font-semibold' : 'font-medium',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.625rem] tracking-[0.06em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium tabular-nums">{value}</p>
    </div>
  )
}

/** A tab with nothing to show yet: what it holds, and the one step that fills it. */
export function TabEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: IconSvgElement
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <Empty className="min-h-72">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-10 rounded-xl border border-border bg-muted/40 text-muted-foreground">
          <HugeiconsIcon icon={icon} strokeWidth={1.5} className="size-5" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && (
        <EmptyContent>
          <Button type="button" size="sm" variant="outline" onClick={action.onClick}>
            {action.label}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}
