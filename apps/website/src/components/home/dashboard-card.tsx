import { Info } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** An ⓘ that explains a number and shows its formula. Needs a TooltipProvider above it. */
export function MetricHelp({ title, description, formula }: { title: string; description: string; formula: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={`About ${title}`}
        className="inline-flex rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Info className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-72 flex-col items-start gap-1.5 px-3 py-2.5 text-left font-sans data-open:animate-none data-closed:animate-none"
      >
        <span className="font-medium">{description}</span>
        <span className="font-mono text-[10px] text-background/75">Formula: {formula}</span>
      </TooltipContent>
    </Tooltip>
  )
}

/** A dashboard panel: small caps title with its ⓘ, the range on the right, then the body. */
export function DashboardCard({
  title,
  description,
  formula,
  aside,
  dimmed = false,
  className = '',
  children,
}: {
  title: string
  description: string
  formula: string
  aside?: React.ReactNode
  dimmed?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      className={`min-w-0 rounded-xl border border-border/70 bg-card p-4 transition-opacity duration-200 ${dimmed ? 'opacity-60' : ''} ${className}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">{title}</h2>
          <MetricHelp title={title} description={description} formula={formula} />
        </div>
        {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

export function DashboardCardSkeleton({ height }: { height: string }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-4 w-32" />
      <Skeleton className={`mt-4 w-full rounded-xl ${height}`} />
    </section>
  )
}

/** Placeholder inside a card when there is nothing to chart yet. */
export function EmptyChart({ children, className = 'h-56' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`mt-4 flex items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 text-center ${className}`}
    >
      <p className="max-w-sm text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
