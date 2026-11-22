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

/** Symbol and toggles, followed by the entry and stop prices. */
export function CalculatorSkeleton() {
  return (
    <Loading label="Loading the calculator">
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-4">
        <div className="col-span-2 sm:col-span-1">
          <FieldSkeleton />
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-7 w-24" />
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-7 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
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

/** Workspace balance and risk budget, then the two percentage fields. */
export function RuleSkeleton() {
  return (
    <Loading label="Loading your rule">
      <div className="grid gap-4 rounded-xl border bg-muted/30 p-4 sm:px-5">
        <div className="grid gap-2 border-b pb-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FieldSkeleton />
        <FieldSkeleton />
      </div>
    </Loading>
  )
}
