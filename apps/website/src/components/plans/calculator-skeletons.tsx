import { Skeleton } from '@/components/ui/skeleton'

function Loading({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 py-2">
      {children}
    </div>
  )
}

function FieldSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-8 w-full" />
    </div>
  )
}

/** The calculator's shape: symbol and toggles, then the four price and risk fields. */
export function CalculatorSkeleton() {
  return (
    <Loading label="Loading the calculator">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="flex gap-4">
          <div className="grid gap-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-7 w-32" />
          </div>
          <div className="grid gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldSkeleton />
        <FieldSkeleton />
        <FieldSkeleton />
        <FieldSkeleton />
      </div>
    </Loading>
  )
}

/** Plan or history cards. */
export function CardsSkeleton({ label }: { label: string }) {
  return (
    <Loading label={label}>
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid gap-3 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
          </div>
        </div>
      ))}
    </Loading>
  )
}

/** The rule's three settings rows. */
export function RuleSkeleton() {
  return (
    <Loading label="Loading your rule">
      <Skeleton className="h-4 w-3/4" />
      <div className="divide-y divide-border rounded-lg border border-border">
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex items-center justify-between gap-6 px-4 py-3.5">
            <div className="grid gap-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
    </Loading>
  )
}
