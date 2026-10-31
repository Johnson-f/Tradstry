import {
  AlertCircleIcon,
  BankIcon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  PauseCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { RefObject } from 'react'
import { ExpandHistory } from '@/components/brokerage/account-sync'
import { BrokerageError } from '@/components/brokerage/feedback'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { type SyncStatus, useSyncStatus } from '@/lib/client/brokerage/brokerage'
import {
  accountTypeLabel,
  brokerageErrorMessage,
  importModeLabel,
  taxTreatmentLabel,
} from '@/lib/client/brokerage/brokerage-model'
import { formatDate, formatDateTime } from '@/lib/format'

interface AccountWorkspace {
  id: string
  name: string
  institutionName?: string
}

export function BrokerageAccountDialog({
  workspace,
  onClose,
  returnFocus,
}: {
  workspace: AccountWorkspace
  onClose: () => void
  returnFocus: RefObject<HTMLElement | null>
}) {
  const sync = useSyncStatus(workspace.id)
  const subtitle = [workspace.institutionName, sync.data?.account.maskedNumber].filter(Boolean).join(' · ')

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        finalFocus={returnFocus}
        className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 font-[Arial,Helvetica,sans-serif] sm:max-w-lg data-open:animate-none data-closed:animate-none"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-5 pr-11">
          <div className="flex items-start gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted/30">
              <HugeiconsIcon
                icon={BankIcon}
                className="size-6 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <DialogTitle className="font-[inherit] text-lg leading-6 font-semibold break-words">
                {workspace.name}
              </DialogTitle>
              <DialogDescription className="text-xs leading-5">
                {subtitle || 'Brokerage account details'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <Separator />
        <ScrollArea className="min-h-0 overflow-hidden [&_[data-slot=scroll-area-viewport]]:max-h-[calc(100dvh-15rem)] [&_[data-slot=scroll-area-viewport]]:overscroll-contain">
          <div className="space-y-5 px-6 py-5">
            {sync.isPending ? (
              <div role="status" className="space-y-5">
                <span className="sr-only">Loading account details…</span>
                <Skeleton className="h-24 rounded-lg" />
                <Skeleton className="h-36 rounded-lg" />
              </div>
            ) : sync.isError && !sync.data ? (
              <BrokerageError
                message={brokerageErrorMessage(sync.error, 'Could not load this account.')}
                retry={() => void sync.refetch()}
                pending={sync.isFetching}
              />
            ) : sync.data ? (
              <>
                {sync.isError && (
                  <BrokerageError
                    message="Could not check for updates. Showing your saved account details."
                    retry={() => void sync.refetch()}
                    pending={sync.isFetching}
                  />
                )}
                <BrokerageAccountDetails workspace={workspace} sync={sync.data} />
              </>
            ) : (
              <p className="py-5 text-center text-sm text-muted-foreground">
                No brokerage account is linked to this workspace.
              </p>
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="m-0 shrink-0 flex-row items-center rounded-b-2xl bg-background px-6 py-4">
          <DialogClose render={<Button className="ml-auto h-9 px-5" />}>Done</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BrokerageAccountDetails({
  workspace,
  sync,
}: {
  workspace: AccountWorkspace
  sync: SyncStatus
}) {
  const { account } = sync
  const imported = sync.initialImportCompletedAt !== null
  const status = account.unlinked
    ? { label: 'Not syncing', icon: PauseCircleIcon }
    : sync.lastError
      ? { label: 'Needs attention', icon: AlertCircleIcon }
      : imported
        ? { label: 'Imported', icon: CheckmarkCircle02Icon }
        : { label: 'Importing', icon: Loading03Icon }
  const accountRows: Array<[string, string]> = [
    ...(account.name !== workspace.name ? [['Account name', account.name] as [string, string]] : []),
    ['Account type', accountTypeLabel(account) || 'Not provided'],
    [
      'Trading mode',
      account.cashOrMargin === 'CASH'
        ? 'Cash'
        : account.cashOrMargin === 'MARGIN'
          ? 'Margin'
          : 'Not provided',
    ],
    ['Tax treatment', taxTreatmentLabel(account) ?? 'Not provided'],
  ]

  return (
    <div className="space-y-5">
      <section aria-label="Account details" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Account details</h3>
          {account.isPaper && <Badge variant="outline">Paper trading</Badge>}
        </div>
        <DetailRows rows={accountRows} />
      </section>
      <Separator />
      <section aria-label="Import and sync" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Import &amp; sync</h3>
          <Badge variant="secondary" className="gap-1.5 font-normal">
            <HugeiconsIcon icon={status.icon} className="size-3" strokeWidth={1.75} aria-hidden />
            {status.label}
          </Badge>
        </div>
        <DetailRows
          rows={[
            [
              'Import range',
              account.importStartDate
                ? `Since ${formatDate(account.importStartDate)}`
                : account.importMode === 'all'
                  ? 'All available history'
                  : importModeLabel(account.importMode),
            ],
            [
              'History through',
              sync.transactionsSyncedThrough
                ? formatDate(sync.transactionsSyncedThrough)
                : 'Not imported yet',
            ],
            [
              'Last account sync',
              sync.holdingsSyncedAt ? formatDateTime(sync.holdingsSyncedAt) : 'Not synced yet',
            ],
            [
              'Next sync',
              account.unlinked
                ? 'Paused'
                : sync.nextSyncAt
                  ? formatDateTime(sync.nextSyncAt)
                  : 'Not scheduled',
            ],
          ]}
        />
        {account.unlinked ? (
          <p className="text-xs leading-5 text-muted-foreground">
            Syncing has stopped. Your imported history is kept in this workspace.
          </p>
        ) : sync.lastError ? (
          <Alert className="border-amber-500/20 bg-amber-500/5 p-3" role="status">
            <AlertDescription className="text-xs leading-5">
              The last update didn’t finish. Tradstry will retry automatically.
            </AlertDescription>
          </Alert>
        ) : !imported ? (
          <p role="status" className="text-xs leading-5 text-muted-foreground">
            Your first import is running. You can close this window while it finishes.
          </p>
        ) : null}
        {!account.unlinked && account.importStartDate && (
          <ExpandHistory
            workspaceId={workspace.id}
            accountId={account.id}
            startDate={account.importStartDate}
          />
        )}
      </section>
    </div>
  )
}

function DetailRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="space-y-3">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-6 text-sm leading-5">
          <dt className="shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 text-right font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
