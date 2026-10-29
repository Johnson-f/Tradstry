import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AccountSelectionDialog } from '@/components/brokerage/account-selection-dialog'
import { Outcome } from '@/components/brokerage/outcome'
import { useCompleteBrokerageConnection } from '@/lib/client/brokerage/brokerage'
import { brokerageErrorMessage, parsePortalReturn } from '@/lib/client/brokerage/brokerage-model'

export const Route = createFileRoute('/_authenticated/brokerage/callback')({
  validateSearch: (search: Record<string, unknown>) => search,
  component: PortalCallback,
})

function PortalCallback() {
  const navigate = useNavigate()
  const portal = parsePortalReturn(Route.useSearch())
  const completion = useCompleteBrokerageConnection(portal.kind === 'success' ? portal.connectionId : null)

  if (portal.kind === 'success') {
    return (
      <AccountSelectionDialog
        open
        onOpenChange={(open) => {
          if (!open) void navigate({ to: '/brokerage', replace: true })
        }}
        choices={completion.data}
        loading={completion.isPending}
        error={
          completion.isError
            ? brokerageErrorMessage(completion.error, 'Could not load your brokerage accounts.')
            : null
        }
        onRetry={() => void completion.refetch()}
        retrying={completion.isFetching}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-160 space-y-6 py-4 sm:py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Brokerage connection</h1>
      </header>
      <Outcome>
        {portal.kind === 'abandoned'
          ? 'You closed SnapTrade before connecting a brokerage.'
          : portal.kind === 'error'
            ? 'Your brokerage could not be connected. Try again, or pick a different brokerage.'
            : 'This link is not a brokerage connection.'}
      </Outcome>
    </div>
  )
}
