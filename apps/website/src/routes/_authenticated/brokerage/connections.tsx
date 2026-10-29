import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowRight, Check, Landmark, Layers, Link2, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { ConnectionList } from '@/components/brokerage/connection-list'
import { DisconnectDialog } from '@/components/brokerage/disconnect-dialog'
import { BrokerageError } from '@/components/brokerage/feedback'
import { SNAPTRADE_DASHBOARD_URL } from '@/components/brokerage/styles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  startBrokerageConnection,
  startSnapTradeAuthorization,
  useBrokerageConnections,
  useBrokerageStatus,
  useRevokeSnapTrade,
} from '@/lib/client/brokerage/brokerage'
import { brokerageErrorMessage } from '@/lib/client/brokerage/brokerage-model'

export const Route = createFileRoute('/_authenticated/brokerage/connections')({ component: BrokeragePage })

function BrokeragePage() {
  const status = useBrokerageStatus()
  const connections = useBrokerageConnections(status.data?.available === true)
  const shared = connections.data?.filter((connection) => connection.authMode === 'oauth') ?? []

  return (
    <div className="mx-auto w-full max-w-240 space-y-8 py-4 sm:py-6">
      {status.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-label="Loading brokerage options">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      ) : status.isError ? (
        <BrokerageError
          message="We couldn’t load brokerage connections. Please try again."
          retry={() => void status.refetch()}
          pending={status.isFetching}
        />
      ) : !status.data.available ? null : (
        <>
          <ConnectOptions oauthAvailable={status.data.oauthAvailable} />
          <section aria-labelledby="connections-heading" className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 id="connections-heading" className="text-base font-semibold">
                Your connections
              </h2>
              {connections.data && (
                <Badge variant="secondary" className="tabular-nums">
                  {connections.data.length}
                </Badge>
              )}
            </div>
            {connections.isPending ? (
              <Skeleton className="h-40 rounded-xl" aria-label="Loading your connections" />
            ) : connections.isError ? (
              <BrokerageError
                message={brokerageErrorMessage(connections.error, 'Could not load your connections.')}
                retry={() => void connections.refetch()}
                pending={connections.isFetching}
              />
            ) : connections.data.length === 0 ? (
              <Card className="gap-6 px-6 py-8 shadow-none sm:p-8">
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/30">
                    <Landmark className="size-6 text-muted-foreground" aria-hidden />
                  </div>
                  <h3 className="text-base font-medium">Your accounts, in one place</h3>
                  <p className="max-w-md text-sm leading-6 text-muted-foreground">
                    Connect a brokerage above to start importing. Tradstry can read your account data, but
                    cannot place trades or move money.
                  </p>
                </div>
                <ol className="grid gap-4 border-t pt-6 text-sm sm:grid-cols-3">
                  {['Connect your brokerage', 'Choose accounts and history', 'Review in your workspace'].map(
                    (step, index) => (
                      <li key={step} className="flex items-center gap-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                          {index + 1}
                        </span>
                        {step}
                      </li>
                    ),
                  )}
                </ol>
              </Card>
            ) : (
              <ConnectionList connections={connections.data} />
            )}
          </section>
          {shared.length > 0 && (
            <RevokeSnapTrade sharing={shared.some((connection) => !connection.unlinked)} />
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
    <section aria-label="Connect an account" className="space-y-4">
      <div className={`grid gap-4 ${oauthAvailable ? 'sm:grid-cols-2' : ''}`}>
        <Card className="gap-5 shadow-none [--card-spacing:--spacing(6)]">
          <CardHeader className="gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Landmark className="size-5" aria-hidden />
            </div>
            <h2 className="text-base font-semibold">Connect a brokerage</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Choose your brokerage and sign in through SnapTrade to import your accounts.
            </p>
          </CardHeader>
          <CardContent className="mt-auto">
            <Button
              className="h-10 w-full justify-between px-4"
              disabled={start.isPending}
              onClick={() => start.mutate('portal')}
            >
              {start.isPending && start.variables === 'portal' ? 'Opening SnapTrade…' : 'Connect brokerage'}
              {start.isPending && start.variables === 'portal' ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <ArrowRight aria-hidden />
              )}
            </Button>
          </CardContent>
        </Card>
        {oauthAvailable && (
          <Card className="gap-5 shadow-none [--card-spacing:--spacing(6)]">
            <CardHeader className="gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border bg-muted/30">
                <Link2 className="size-5" aria-hidden />
              </div>
              <h2 className="text-base font-semibold">Already use SnapTrade?</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Share the brokerages connected to your existing SnapTrade Personal account.
              </p>
            </CardHeader>
            <CardContent className="mt-auto">
              <Button
                variant="outline"
                className="h-10 w-full justify-between px-4"
                disabled={start.isPending}
                onClick={() => start.mutate('oauth')}
              >
                {start.isPending && start.variables === 'oauth'
                  ? 'Opening SnapTrade…'
                  : 'Continue with SnapTrade'}
                {start.isPending && start.variables === 'oauth' ? (
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <ArrowRight aria-hidden />
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      {start.isError && (
        <BrokerageError
          message={brokerageErrorMessage(start.error, 'Could not start connecting. Try again.')}
        />
      )}
    </section>
  )
}

function RevokeSnapTrade({ sharing }: { sharing: boolean }) {
  const revoke = useRevokeSnapTrade()
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <Card className="gap-0 py-0 shadow-none">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Layers className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="space-y-1">
              <h2 className="font-medium">SnapTrade account access</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {sharing
                  ? 'Manage all connections shared from your SnapTrade account.'
                  : 'Your SnapTrade connections are no longer syncing.'}
              </p>
            </div>
          </div>
          {sharing && (
            <Button
              variant="outline"
              className="h-9 px-4"
              onClick={() => {
                revoke.reset()
                setConfirm(true)
              }}
            >
              Disconnect SnapTrade
            </Button>
          )}
        </CardContent>
        {revoke.isSuccess && (
          <CardFooter className="gap-2 px-5 py-3 text-xs leading-5 text-muted-foreground" role="status">
            <Check className="size-4 shrink-0" aria-hidden />
            <span>
              {revoke.data.upstreamConfirmed ? (
                'Tradstry no longer has access to your SnapTrade account.'
              ) : (
                <>
                  Tradstry stopped using your account. SnapTrade did not confirm the change. Remove Tradstry
                  in your{' '}
                  <a
                    href={SNAPTRADE_DASHBOARD_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    SnapTrade Dashboard
                  </a>{' '}
                  too.
                </>
              )}
            </span>
          </CardFooter>
        )}
      </Card>
      <DisconnectDialog
        open={confirm}
        onOpenChange={setConfirm}
        name="SnapTrade"
        description="All connections shared from your SnapTrade account will stop syncing."
        pending={revoke.isPending}
        error={
          revoke.isError
            ? brokerageErrorMessage(revoke.error, 'Could not disconnect SnapTrade. Try again.')
            : null
        }
        onConfirm={() => {
          if (!revoke.isPending) revoke.mutate(undefined, { onSuccess: () => setConfirm(false) })
        }}
      />
    </>
  )
}
