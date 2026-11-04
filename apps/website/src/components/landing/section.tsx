import { cn } from '@/lib/utils'

export function Section({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={cn('mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28', className)}>
      {children}
    </section>
  )
}

export function SectionHeading({
  title,
  children,
  align = 'center',
}: {
  title: React.ReactNode
  children?: React.ReactNode
  align?: 'center' | 'left'
}) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      <h2 className="text-4xl leading-[1.08] font-semibold tracking-[-0.03em] text-balance sm:text-5xl">{title}</h2>
      {children && <p className="mt-5 text-lg leading-relaxed text-pretty text-muted-foreground">{children}</p>}
    </div>
  )
}

/** A soft grey panel holding one claim and the screen that shows it. */
export function Panel({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-[28px] bg-muted/70 p-5 sm:p-7 dark:bg-neutral-800/50', className)}>
      {title && <h3 className="mb-4 text-xl font-semibold tracking-tight">{title}</h3>}
      {children}
    </div>
  )
}

/** A white card inside a panel, standing in for a piece of the app. */
export function Screen({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border bg-background p-4 shadow-xs sm:p-5', className)}>{children}</div>
  )
}
