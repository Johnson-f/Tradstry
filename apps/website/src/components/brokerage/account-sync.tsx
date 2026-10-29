import { Link } from '@tanstack/react-router'
import { Check, Clock3, History, Layers, LoaderCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { BrokerageError } from '@/components/brokerage/feedback'
import { ImportRangeFields } from '@/components/brokerage/import-range-fields'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { type SyncStatus, useExpandHistory, useRefreshHoldings } from '@/lib/client/brokerage/brokerage'
import {
  type ImportMode,
  accountSummary,
  brokerageErrorMessage,
  importModeLabel,
  taxTreatmentLabel,
} from '@/lib/client/brokerage/brokerage-model'
import { formatDate, formatDateTime } from '@/lib/format'

export function AccountSync({ workspaceId, sync }: { workspaceId: string; sync: SyncStatus }) {
  const { account } = sync
  const refresh = useRefreshHoldings(workspaceId)
  const [refreshFrom, setRefreshFrom] = useState<string | null>(null)
  const status = account.unlinked
    ? 'Not syncing'
    : sync.lastError
      ? 'Needs attention'
      : sync.initialImportCompletedAt
        ? 'Imported'
        : 'Importing'
  return (
    <Card className="gap-0 rounded-xl py-0 shadow-none">
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-muted/30">
              <Layers className="size-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold break-words">
                  {account.name}{' '}
                  <span className="font-normal text-muted-foreground">{account.maskedNumber}</span>
                </h2>
                <Badge variant="outline" className="font-normal">
                  {status}
                </Badge>
                {account.isPaper && <Badge variant="secondary">Paper</Badge>}
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {[accountSummary(account), taxTreatmentLabel(account)].filter(Boolean).join(' · ') ||
                  'Brokerage account'}
              </p>
            </div>
          </div>
          {!account.unlinked && (
            <Button
              variant="outline"
              className="h-9 px-3"
              disabled={refresh.isPending}
              onClick={() => {
                setRefreshFrom(sync.holdingsSyncedAt)
                refresh.mutate(account.id)
              }}
            >
              {refresh.isPending ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              {refresh.isPending ? 'Requesting…' : 'Refresh holdings'}
            </Button>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-t pt-5 lg:grid-cols-4">
          {[
            [
              'History from',
              account.importStartDate
                ? formatDate(account.importStartDate)
                : importModeLabel(account.importMode),
            ],
            ['Transactions through', formatDate(sync.transactionsSyncedThrough)],
            ['Holdings updated', formatDateTime(sync.holdingsSyncedAt)],
            ['Next sync', account.unlinked ? 'Not scheduled' : formatDateTime(sync.nextSyncAt)],
          ].map(([label, value]) => (
            <div key={label} className="space-y-1.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {sync.lastError && !account.unlinked && (
          <Alert className="border-amber-500/20 bg-amber-500/5 p-3" role="status">
            <Clock3 aria-hidden />
            <AlertDescription className="leading-6">
              The last sync didn’t finish. Your saved data is still available. Tradstry will retry; check your
              connection if it needs attention.
            </AlertDescription>
          </Alert>
        )}
        {refresh.isError && (
          <BrokerageError message={brokerageErrorMessage(refresh.error, 'Could not refresh holdings.')} />
        )}
        {refresh.isSuccess && (
          <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            <Check className="size-4" aria-hidden />
            {sync.holdingsSyncedAt !== refreshFrom
              ? 'Holdings updated.'
              : 'Refresh requested. This page will update when the new data arrives.'}
          </p>
        )}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-2 px-5 py-3 sm:px-6">
        <p className="text-xs leading-5 text-muted-foreground">
          {account.unlinked
            ? 'Your imported history is kept here.'
            : 'Transactions update daily. Holdings update every six hours.'}
        </p>
        <div className="flex flex-wrap gap-1">
          {!account.unlinked && account.importStartDate && (
            <ExpandHistory
              workspaceId={workspaceId}
              accountId={account.id}
              startDate={account.importStartDate}
            />
          )}
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/brokerage/connections" />}>
            Manage connection
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}

export function ExpandHistory({
  workspaceId,
  accountId,
  startDate,
}: {
  workspaceId: string
  accountId: string
  startDate: string
}) {
  const expand = useExpandHistory(workspaceId)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<ImportMode>('ALL')
  const [date, setDate] = useState('')
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          expand.reset()
          setMode('ALL')
          setDate('')
          setOpen(true)
        }}
      >
        <History aria-hidden />
        Import older history
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!expand.isPending) setOpen(next)
        }}
      >
        <DialogContent
          showCloseButton={!expand.isPending}
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 font-[Arial,Helvetica,sans-serif] sm:max-w-md data-open:animate-none data-closed:animate-none"
        >
          <DialogHeader className="gap-3">
            <DialogTitle className="font-[inherit] text-lg font-semibold">Import older history</DialogTitle>
            <DialogDescription className="leading-6">
              Your history currently starts on {formatDate(startDate)}. Add earlier records without changing
              what’s already imported.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault()
              if (expand.isPending || (mode === 'CUSTOM' && (!date || date > startDate))) return
              expand.mutate({ accountId, importMode: mode, customStartDate: mode === 'CUSTOM' ? date : null })
            }}
          >
            {expand.isSuccess ? (
              <Alert role="status" className="p-4">
                <Check aria-hidden />
                <AlertDescription>
                  Older history has been queued for import. You can close this window while it runs.
                </AlertDescription>
              </Alert>
            ) : (
              <ImportRangeFields
                mode={mode}
                date={date}
                modes={['ALL', 'CUSTOM']}
                maxDate={startDate}
                disabled={expand.isPending}
                onModeChange={(value) => {
                  setMode(value)
                  expand.reset()
                }}
                onDateChange={(value) => {
                  setDate(value)
                  expand.reset()
                }}
              />
            )}
            {expand.isError && (
              <BrokerageError
                message={brokerageErrorMessage(expand.error, 'Could not import more history.')}
              />
            )}
            <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
              <DialogClose
                disabled={expand.isPending}
                render={<Button type="button" variant="outline" className="h-9 px-4" />}
              >
                {expand.isSuccess ? 'Done' : 'Cancel'}
              </DialogClose>
              {!expand.isSuccess && (
                <Button
                  type="submit"
                  className="h-9 px-4"
                  disabled={expand.isPending || (mode === 'CUSTOM' && !date)}
                >
                  {expand.isPending && (
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                  )}
                  {expand.isPending ? 'Requesting…' : 'Import history'}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
