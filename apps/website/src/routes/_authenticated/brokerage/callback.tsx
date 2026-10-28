import { createFileRoute } from '@tanstack/react-router'
import { AccountPicker } from '@/components/brokerage/account-picker'
import { Outcome } from '@/components/brokerage/outcome'
import { Skeleton } from '@/components/ui/skeleton'
import { useCompleteBrokerageConnection } from '@/lib/client/brokerage'
import { brokerageErrorMessage, parsePortalReturn } from '@/lib/client/brokerage-model'

export const Route = createFileRoute('/_authenticated/brokerage/callback')({
  validateSearch: (search: Record<string, unknown>) => search,
  component: PortalCallback,
})

function PortalCallback() {
  const portal = parsePortalReturn(Route.useSearch())
  const completion = useCompleteBrokerageConnection(portal.kind === 'success' ? portal.connectionId : null)

  return (
    <div className="mx-auto w-full max-w-160 space-y-4 pt-2 pb-10 sm:pt-3">
      <h1 className="text-lg font-semibold">Choose accounts to import</h1>
      {portal.kind === 'success' ? (
        completion.isPending ? (
          <Skeleton className="h-32 rounded-2xl" />
        ) : completion.isError ? (
          <Outcome>{brokerageErrorMessage(completion.error, 'Could not finish connecting your brokerage.')}</Outcome>
        ) : (
          <AccountPicker choices={completion.data} />
        )
      ) : (
        <Outcome>
          {portal.kind === 'abandoned'
            ? 'You closed SnapTrade before connecting a brokerage.'
            : portal.kind === 'error'
              ? 'Your brokerage could not be connected. Try again, or pick a different brokerage.'
              : 'This link is not a brokerage connection.'}
        </Outcome>
      )}
    </div>
  )
}
