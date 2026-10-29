import { useMutation } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  ChevronRight,
  Ellipsis,
  ExternalLink,
  Landmark,
  Layers,
  LoaderCircle,
  Plus,
  Unplug,
} from 'lucide-react'
import { useState } from 'react'
import { AccountSelectionDialog } from '@/components/brokerage/account-selection-dialog'
import { DisconnectDialog } from '@/components/brokerage/disconnect-dialog'
import { BrokerageError } from '@/components/brokerage/feedback'
import { SNAPTRADE_DASHBOARD_URL } from '@/components/brokerage/styles'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  startBrokerageConnection,
  startSnapTradeAuthorization,
  useConnectionAccountChoices,
  useDisconnectConnection,
} from '@/lib/client/brokerage/brokerage'
import {
  type BrokerageAccount,
  type BrokerageConnection,
  accountSummary,
  brokerageErrorMessage,
  connectionHealth,
} from '@/lib/client/brokerage/brokerage-model'
import { formatDateTime } from '@/lib/format'

export function ConnectionList({ connections }: { connections: BrokerageConnection[] }) {
  return (
    <ul className="space-y-4">
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
  const [confirm, setConfirm] = useState(false)
  const [addingAccounts, setAddingAccounts] = useState(false)
  const repair = useMutation({
    mutationFn: () =>
      health.tone === 'warning' && health.action === 'reauthorize'
        ? startSnapTradeAuthorization('REAUTHORIZE')
        : startBrokerageConnection(connection.id),
    onSuccess: (url) => window.location.assign(url),
  })
  const withoutWorkspace = connection.accounts.some((account) => !account.workspaceId && !account.unlinked)

  return (
    <>
      <Card
        role="article"
        aria-labelledby={`connection-${connection.id}`}
        className="gap-0 rounded-xl py-0 shadow-none"
      >
        <header className="flex items-start gap-3 p-5 sm:gap-4 sm:p-6">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted/30">
            <Landmark className="size-5 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h3
              id={`connection-${connection.id}`}
              className="flex flex-wrap items-center gap-2 text-base font-semibold"
            >
              {connection.institutionName}
              <Badge
                variant="outline"
                className={
                  health.tone === 'warning'
                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                    : 'font-normal text-muted-foreground'
                }
              >
                <span
                  className={`size-1.5 rounded-full ${health.tone === 'ok' ? 'bg-emerald-500' : health.tone === 'warning' ? 'bg-amber-500' : 'bg-muted-foreground'}`}
                  aria-hidden
                />
                {health.label}
              </Badge>
            </h3>
            <p className="text-xs leading-5 text-muted-foreground">
              {connection.authMode === 'oauth'
                ? 'Shared from SnapTrade Personal'
                : 'Connected through Tradstry'}
            </p>
          </div>
          {!connection.unlinked && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label={`Manage ${connection.institutionName}`} />
                }
              >
                <Ellipsis aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 p-1.5 data-open:animate-none data-closed:animate-none"
              >
                <DropdownMenuItem className="py-2" onClick={() => setAddingAccounts(true)}>
                  <Plus aria-hidden />
                  Choose accounts
                </DropdownMenuItem>
                {connection.authMode === 'oauth' && (
                  <DropdownMenuItem
                    className="py-2"
                    render={<a href={SNAPTRADE_DASHBOARD_URL} target="_blank" rel="noreferrer" />}
                  >
                    <ExternalLink aria-hidden />
                    SnapTrade Dashboard
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  className="py-2"
                  onClick={() => {
                    disconnect.reset()
                    setConfirm(true)
                  }}
                >
                  <Unplug aria-hidden />
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        {health.tone === 'warning' && (
          <div className="px-5 pb-5 sm:px-6">
            <Alert
              className="flex flex-col items-start gap-3 rounded-lg border-amber-500/20 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"
              role="status"
            >
              <AlertDescription className="leading-6">
                {health.action === 'repair-in-snaptrade'
                  ? 'Reconnect this brokerage in SnapTrade to resume updates.'
                  : 'Your connection needs attention. Reconnect to keep your accounts up to date.'}
              </AlertDescription>
              {health.action === 'repair-in-snaptrade' ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={SNAPTRADE_DASHBOARD_URL} target="_blank" rel="noreferrer" />}
                >
                  Open SnapTrade
                  <ArrowUpRight aria-hidden />
                </Button>
              ) : (
                <Button disabled={repair.isPending} onClick={() => repair.mutate()}>
                  {repair.isPending && (
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                  )}
                  {health.action === 'reauthorize' ? 'Authorize again' : 'Reconnect'}
                </Button>
              )}
            </Alert>
          </div>
        )}
        {repair.isError && (
          <div className="px-5 pb-5 sm:px-6">
            <BrokerageError
              message={brokerageErrorMessage(repair.error, 'Could not reconnect. Try again.')}
            />
          </div>
        )}
        {connection.accounts.length > 0 ? (
          <ul className="divide-y border-t">
            {connection.accounts.map((account) => (
              <li key={account.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
                <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium break-words">
                    {account.name}{' '}
                    <span className="font-normal text-muted-foreground">{account.maskedNumber}</span>
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {[accountSummary(account) || null, accountStatus(account)].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {account.workspaceId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    nativeButton={false}
                    aria-label={`Open ${account.name} workspace`}
                    render={<Link to="/w/$workspaceId" params={{ workspaceId: account.workspaceId }} />}
                  >
                    <ChevronRight aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t px-5 py-5 text-sm text-muted-foreground sm:px-6">
            No accounts imported from this connection yet.
          </p>
        )}
        {!connection.unlinked && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3 sm:px-6">
            <p className="text-xs leading-5 text-muted-foreground">
              {connection.newAccountsAvailable
                ? 'New accounts are available to import.'
                : withoutWorkspace
                  ? 'An account needs a workspace. Choose it again to restore one.'
                  : connection.checkedAt
                    ? `Connection checked ${formatDateTime(connection.checkedAt)}`
                    : 'Choose which accounts to bring into Tradstry.'}
            </p>
            <Button variant="ghost" size="sm" onClick={() => setAddingAccounts(true)}>
              <Plus aria-hidden />
              Choose accounts
            </Button>
          </div>
        )}
      </Card>
      <DisconnectDialog
        open={confirm}
        onOpenChange={setConfirm}
        name={connection.institutionName}
        description="This connection will stop syncing new data."
        pending={disconnect.isPending}
        error={
          disconnect.isError
            ? brokerageErrorMessage(disconnect.error, 'Could not disconnect. Try again.')
            : null
        }
        onConfirm={() => {
          if (!disconnect.isPending) disconnect.mutate(connection.id, { onSuccess: () => setConfirm(false) })
        }}
      />
      {addingAccounts && <NewAccounts connectionId={connection.id} onOpenChange={setAddingAccounts} />}
    </>
  )
}

function accountStatus(account: BrokerageAccount): string {
  if (account.unlinked) return 'Not syncing · History saved'
  if (!account.workspaceId) return 'No workspace'
  return account.initialImportCompletedAt ? 'Imported' : 'Importing…'
}

function NewAccounts({
  connectionId,
  onOpenChange,
}: {
  connectionId: string
  onOpenChange: (open: boolean) => void
}) {
  const choices = useConnectionAccountChoices(connectionId)
  return (
    <AccountSelectionDialog
      open
      onOpenChange={onOpenChange}
      choices={choices.data}
      loading={choices.isPending}
      error={choices.isError ? brokerageErrorMessage(choices.error, 'Could not load the accounts.') : null}
      onRetry={() => void choices.refetch()}
      retrying={choices.isFetching}
    />
  )
}
