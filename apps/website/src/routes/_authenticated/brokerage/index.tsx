import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { LoaderCircle } from 'lucide-react'
import { ConnectionList } from '@/components/brokerage/connection-list'
import { panelClass } from '@/components/brokerage/styles'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  startBrokerageConnection,
  startSnapTradeAuthorization,
  useBrokerageConnections,
  useBrokerageStatus,
  useRevokeSnapTrade,
} from '@/lib/client/brokerage'
import { brokerageErrorMessage } from '@/lib/client/brokerage-model'

export const Route = createFileRoute('/_authenticated/brokerage/')({
  component: BrokeragePage,
})

function BrokeragePage() {
  const status = useBrokerageStatus()
  const connections = useBrokerageConnections(status.data?.available === true)

  return (
    <div className="mx-auto w-full max-w-160 space-y-6 pt-2 pb-10 sm:pt-3">
      <div>
        <h1 className="text-lg font-semibold">Brokerage</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Import trades, holdings and balances from your brokerage. Tradstry only reads your accounts.
        </p>
      </div>

      {status.isPending ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : status.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not reach the Tradstry API: {status.error.message}
        </p>
      ) : !status.data.available ? (
        <p className={`${panelClass} px-5 py-4 text-sm`}>Brokerage linking is not available right now.</p>
      ) : (
        <>
          <ConnectOptions oauthAvailable={status.data.oauthAvailable} />
          <section aria-labelledby="connections-heading" className="space-y-2">
            <h2 id="connections-heading" className="text-[13px] font-medium">
              Connections
            </h2>
            {connections.isPending ? (
              <Skeleton className="h-28 rounded-2xl" />
            ) : connections.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {brokerageErrorMessage(connections.error, 'Could not load your connections.')}
              </p>
            ) : connections.data.length === 0 ? (
              <p className={`${panelClass} px-5 py-4 text-[13px] text-muted-foreground`}>
                No brokerages connected yet.
              </p>
            ) : (
              <ConnectionList connections={connections.data} />
            )}
          </section>
          {connections.data?.some((connection) => connection.authMode === 'oauth' && !connection.unlinked) && (
            <RevokeSnapTrade />
          )}
        </>
      )}
    </div>
  )
}

function ConnectOptions({ oauthAvailable }: { oauthAvailable: boolean }) {
  const start = useMutation({
    mutationFn: (via: 'portal' | 'oauth') =>
      via === 'oauth' ? startSnapTradeAuthorization('CONNECT') : startBrokerageConnection(),
    onSuccess: (url) => window.location.assign(url),
  })

  return (
    <section aria-labelledby="connect-heading" className="space-y-2">
      <h2 id="connect-heading" className="text-[13px] font-medium">
        Add a brokerage
      </h2>
      <div className={`${panelClass} divide-y divide-neutral-200/60 dark:divide-white/10`}>
        <ConnectOption
          title="Connect a brokerage"
          description="Sign in to your brokerage through SnapTrade, our brokerage data partner."
          action="Connect"
          pending={start.isPending && start.variables === 'portal'}
          disabled={start.isPending}
          onClick={() => start.mutate('portal')}
        />
        {oauthAvailable && (
          <ConnectOption
            title="Continue with SnapTrade"
            description="Already have a SnapTrade account? Share the brokerages you connected there."
            action="Continue"
            pending={start.isPending && start.variables === 'oauth'}
            disabled={start.isPending}
            onClick={() => start.mutate('oauth')}
          />
        )}
      </div>
      {start.isError && (
        <p role="alert" className="text-sm text-destructive">
          {brokerageErrorMessage(start.error, 'Could not start connecting. Try again.')}
        </p>
      )}
    </section>
  )
}

function ConnectOption(props: {
  title: string
  description: string
  action: string
  pending: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{props.title}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{props.description}</p>
      </div>
      <Button size="sm" className="h-7.5 px-3" disabled={props.disabled} onClick={props.onClick}>
        {props.pending && <LoaderCircle className="animate-spin" aria-hidden />}
        {props.action}
      </Button>
    </div>
  )
}

function RevokeSnapTrade() {
  const revoke = useRevokeSnapTrade()
  return (
    <section aria-labelledby="revoke-heading" className="space-y-2">
      <h2 id="revoke-heading" className="text-[13px] font-medium">
        SnapTrade account
      </h2>
      <div className={`${panelClass} flex items-center justify-between gap-4 px-5 py-3.5`}>
        <p className="min-w-0 text-[13px] text-muted-foreground">
          {revoke.isSuccess
            ? revoke.data.upstreamConfirmed
              ? 'Tradstry no longer has access to your SnapTrade account.'
              : 'Tradstry stopped using your SnapTrade account. SnapTrade did not confirm, so remove Tradstry in your SnapTrade Dashboard too.'
            : 'Stop sharing your SnapTrade account with Tradstry. Imported history stays.'}
        </p>
        {!revoke.isSuccess && (
          <Button
            size="sm"
            variant="destructive"
            className="h-7.5 px-3"
            disabled={revoke.isPending}
            onClick={() => {
              if (window.confirm('Disconnect your SnapTrade account? Every connection shared from it stops syncing.')) {
                revoke.mutate()
              }
            }}
          >
            {revoke.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            Disconnect SnapTrade
          </Button>
        )}
      </div>
      {revoke.isError && (
        <p role="alert" className="text-sm text-destructive">
          {brokerageErrorMessage(revoke.error, 'Could not disconnect SnapTrade. Try again.')}
        </p>
      )}
    </section>
  )
}
