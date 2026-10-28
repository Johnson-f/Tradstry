import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AccountPicker } from '@/components/brokerage/account-picker'
import { Outcome } from '@/components/brokerage/outcome'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAuthorizationAccountChoices,
  useAuthorizationStatus,
  useInvalidateBrokerage,
} from '@/lib/client/brokerage'
import { authorizationStep, brokerageErrorMessage } from '@/lib/client/brokerage-model'

export const Route = createFileRoute('/_authenticated/brokerage/oauth/callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    attempt: typeof search.attempt === 'string' ? search.attempt : undefined,
  }),
  component: AuthorizationCallback,
})

const isWaiting = (status: Parameters<typeof authorizationStep>[0]) => authorizationStep(status).kind === 'waiting'

function AuthorizationCallback() {
  const { attempt } = Route.useSearch()
  const status = useAuthorizationStatus(attempt ?? null, isWaiting)
  const step = status.isSuccess ? authorizationStep(status.data) : null
  const choices = useAuthorizationAccountChoices(attempt ?? null, step?.kind === 'choose-accounts')
  const invalidate = useInvalidateBrokerage()
  const reauthorized = step?.kind === 'reauthorized'

  useEffect(() => {
    if (reauthorized) void invalidate()
  }, [reauthorized, invalidate])

  return (
    <div className="mx-auto w-full max-w-160 space-y-4 pt-2 pb-10 sm:pt-3">
      <h1 className="text-lg font-semibold">SnapTrade</h1>
      {!attempt ? (
        <Outcome>This link is not a SnapTrade authorization.</Outcome>
      ) : status.isError ? (
        <Outcome>{brokerageErrorMessage(status.error, 'Could not check the authorization.')}</Outcome>
      ) : !step || step.kind === 'waiting' ? (
        <div role="status" className="space-y-2">
          <p className="text-[13px] text-muted-foreground">Finishing up with SnapTrade…</p>
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : step.kind === 'failed' ? (
        <Outcome>{step.message}</Outcome>
      ) : step.kind === 'reauthorized' ? (
        <Outcome>Your SnapTrade account is authorized again. Syncing picks up where it left off.</Outcome>
      ) : choices.isPending ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : choices.isError ? (
        <Outcome>{brokerageErrorMessage(choices.error, 'Could not load your SnapTrade accounts.')}</Outcome>
      ) : choices.data.length === 0 ? (
        <Outcome>
          Your SnapTrade account has no brokerages connected. Connect one in your SnapTrade Dashboard, then continue
          with SnapTrade again.
        </Outcome>
      ) : (
        <>
          <p className="text-[13px] text-muted-foreground">Choose the accounts to import.</p>
          <AccountPicker choices={choices.data} />
        </>
      )}
    </div>
  )
}
