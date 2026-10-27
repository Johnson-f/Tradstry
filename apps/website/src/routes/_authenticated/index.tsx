import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { graphql } from '@/lib/client/backend'

export const Route = createFileRoute('/_authenticated/')({
  component: Dashboard,
})

interface Me {
  stytchUserId: string
  email: string | null
  fullName: string | null
}

function Dashboard() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () =>
      graphql<{ me: Me }>('query Me { me { stytchUserId email fullName } }'),
    select: (data) => data.me,
  })

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {me.isPending ? (
        <Skeleton className="h-5 w-64" />
      ) : me.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not reach the Tradstry API: {me.error.message}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Signed in as {me.data.fullName || me.data.email}.
        </p>
      )}
    </div>
  )
}
