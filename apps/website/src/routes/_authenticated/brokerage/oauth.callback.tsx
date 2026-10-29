import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AccountSelectionDialog } from '@/components/brokerage/account-selection-dialog'
import { Outcome } from '@/components/brokerage/outcome'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAuthorizationAccountChoices,
  useAuthorizationStatus,
  useInvalidateBrokerage,
} from '@/lib/client/brokerage/brokerage'
import { authorizationStep, brokerageErrorMessage } from '@/lib/client/brokerage/brokerage-model'

export const Route = createFileRoute('/_authenticated/brokerage/oauth/callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    attempt: typeof search.attempt === 'string' ? search.attempt : undefined,
  }),
  component: AuthorizationCallback,
})

const isWaiting = (status: Parameters<typeof authorizationStep>[0]) =>
  authorizationStep(status).kind === 'waiting'

function AuthorizationCallback() {
  const navigate = useNavigate()
  const { attempt } = Route.useSearch()
  const status = useAuthorizationStatus(attempt ?? null, isWaiting)
  const step = status.isSuccess ? authorizationStep(status.data) : null
  const choices = useAuthorizationAccountChoices(attempt ?? null, step?.kind === 'choose-accounts')
  const invalidate = useInvalidateBrokerage()
  const reauthorized = step?.kind === 'reauthorized'

  useEffect(() => {
    if (reauthorized) void invalidate()
  }, [reauthorized, invalidate])

  if (step?.kind === 'choose-accounts') {
    return (
      <AccountSelectionDialog
        open
        onOpenChange={(open) => {
          if (!open) void navigate({ to: '/brokerage', replace: true })
        }}
        choices={choices.data}
        loading={choices.isPending}
        error={
          choices.isError
            ? brokerageErrorMessage(choices.error, 'Could not load your SnapTrade accounts.')
            : null
        }
        onRetry={() => void choices.refetch()}
        retrying={choices.isFetching}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-160 space-y-6 py-4 sm:py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">SnapTrade connection</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Bring your connected accounts into Tradstry with read-only access.
        </p>
      </header>
      {!attempt ? (
        <Outcome>This link is not a SnapTrade authorization.</Outcome>
      ) : status.isError ? (
        <Outcome retry={() => void status.refetch()} pending={status.isFetching}>
          {brokerageErrorMessage(status.error, 'Could not check the authorization.')}
        </Outcome>
      ) : !step || step.kind === 'waiting' ? (
        <div role="status" className="space-y-2">
          <p className="text-[13px] text-muted-foreground">Finishing up with SnapTrade…</p>
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : step.kind === 'failed' ? (
        <Outcome>{step.message}</Outcome>
      ) : (
        <Outcome>Your SnapTrade account is authorized again. Syncing picks up where it left off.</Outcome>
      )}
    </div>
  )
}
