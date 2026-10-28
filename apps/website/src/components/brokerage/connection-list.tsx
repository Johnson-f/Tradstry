import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { AccountPicker } from '@/components/brokerage/account-picker'
import { SNAPTRADE_DASHBOARD_URL, dividedPanelClass } from '@/components/brokerage/styles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  startBrokerageConnection,
  startSnapTradeAuthorization,
  useConnectionAccountChoices,
  useDisconnectConnection,
} from '@/lib/client/brokerage'
import {
  type BrokerageConnection,
  brokerageErrorMessage,
  connectionHealth,
} from '@/lib/client/brokerage-model'
import { formatDateTime } from '@/lib/format'

export function ConnectionList({ connections }: { connections: BrokerageConnection[] }) {
  return (
    <ul className="space-y-3">
      {connections.map((connection) => (
        <li key={connection.id}>
          <ConnectionCard connection={connection} />
        </li>
      ))}
    </ul>
  )
}

function ConnectionCard({ connection }: { connection: BrokerageConnection }) {
  const health = connectionHealth(connection)
  const disconnect = useDisconnectConnection()
  const [addingAccounts, setAddingAccounts] = useState(false)
  const repair = useMutation({
    mutationFn: () =>
      health.tone === 'warning' && health.action === 'reauthorize'
        ? startSnapTradeAuthorization('REAUTHORIZE')
        : startBrokerageConnection(connection.id),
    onSuccess: (url) => window.location.assign(url),
  })
  const error = repair.error ?? disconnect.error
  const withoutWorkspace = connection.accounts.some((account) => !account.workspaceId && !account.unlinked)

  return (
    <article aria-labelledby={`connection-${connection.id}`} className={dividedPanelClass}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div className="min-w-0">
          <h3 id={`connection-${connection.id}`} className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {connection.institutionName}
            <Badge
              variant={health.tone === 'ok' ? 'secondary' : health.tone === 'warning' ? 'destructive' : 'outline'}
            >
              {health.label}
            </Badge>
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {connection.authMode === 'oauth' ? 'Shared from your SnapTrade account' : 'Connected through Tradstry'}
            {connection.checkedAt && ` · Checked ${formatDateTime(connection.checkedAt)}`}
          </p>
        </div>
        {!connection.unlinked && (
          <div className="flex flex-wrap gap-2">
            {health.tone === 'warning' && health.action !== 'repair-in-snaptrade' && (
              <Button size="sm" className="h-7.5 px-3" disabled={repair.isPending} onClick={() => repair.mutate()}>
                {repair.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
                {health.action === 'reauthorize' ? 'Authorize again' : 'Reconnect'}
              </Button>
            )}
            {connection.authMode === 'oauth' && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7.5 px-3"
                render={<a href={SNAPTRADE_DASHBOARD_URL} target="_blank" rel="noreferrer" />}
                nativeButton={false}
              >
                SnapTrade Dashboard
                <ExternalLink aria-hidden />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7.5 px-3"
              disabled={disconnect.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Stop syncing ${connection.institutionName}? Its workspaces and imported history stay in Tradstry.`,
                  )
                ) {
                  disconnect.mutate(connection.id)
                }
              }}
            >
              Disconnect
            </Button>
          </div>
        )}
      </header>

      {health.tone === 'warning' && health.action === 'repair-in-snaptrade' && (
        <p className="px-5 py-3 text-[13px] text-muted-foreground">
          This brokerage needs to be reconnected in your SnapTrade Dashboard. Tradstry picks it up again once it is
          fixed there.
        </p>
      )}

      {error && (
        <p role="alert" className="px-5 py-3 text-sm text-destructive">
          {brokerageErrorMessage(error, 'Something went wrong. Try again.')}
        </p>
      )}

      {connection.accounts.length > 0 && (
        <ul className="divide-y divide-neutral-200/60 dark:divide-white/10">
          {connection.accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm break-words">
                  {account.name}
                  {account.maskedNumber && <span className="ml-1.5 text-muted-foreground">{account.maskedNumber}</span>}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {account.unlinked
                    ? 'No longer at the brokerage'
                    : !account.workspaceId
                      ? 'No workspace'
                      : account.initialImportCompletedAt
                      ? 'Imported'
                      : 'Importing…'}
                </p>
              </div>
              {account.workspaceId && (
                <Link
                  to="/w/$workspaceId"
                  params={{ workspaceId: account.workspaceId }}
                  className="shrink-0 text-[13px] underline-offset-4 hover:underline"
                >
                  Open workspace
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {(connection.newAccountsAvailable || withoutWorkspace) && !connection.unlinked && (
        <div className="space-y-3 px-5 py-3.5">
          {addingAccounts ? (
            <NewAccounts connectionId={connection.id} />
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-[13px]">
                {connection.newAccountsAvailable
                  ? 'This brokerage has accounts you have not imported.'
                  : 'An account here has no workspace. Import it again to get one back.'}
              </p>
              <Button size="sm" variant="secondary" className="h-7.5 px-3" onClick={() => setAddingAccounts(true)}>
                Choose accounts
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function NewAccounts({ connectionId }: { connectionId: string }) {
  const choices = useConnectionAccountChoices(connectionId)
  if (choices.isPending) return <Skeleton className="h-14 rounded-lg" />
  if (choices.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {brokerageErrorMessage(choices.error, 'Could not load the accounts. Try again.')}
      </p>
    )
  }
  return <AccountPicker choices={choices.data} />
}
