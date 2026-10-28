import { Tabs } from '@base-ui/react/tabs'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { dividedPanelClass, panelClass } from '@/components/brokerage/styles'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { tabClass, tabListClass } from '@/components/ui/tab-styles'
import {
  ACTIVITY_PAGE_SIZE,
  type SyncStatus,
  useActivities,
  useExpandHistory,
  useHoldings,
  useRefreshHoldings,
} from '@/lib/client/brokerage'
import {
  type ImportMode,
  IMPORT_MODE_LABELS,
  balanceRows,
  brokerageErrorMessage,
  importModeLabel,
  positionRows,
} from '@/lib/client/brokerage-model'
import { formatDate, formatDateTime, formatMoney, formatNumber, localToday } from '@/lib/format'

export function BrokerageAccountView({ workspaceId, sync }: { workspaceId: string; sync: SyncStatus }) {
  const imported = sync.initialImportCompletedAt !== null
  return (
    <>
      <SyncPanel workspaceId={workspaceId} sync={sync} />
      {imported ? (
        <Tabs.Root defaultValue="holdings">
          <Tabs.List aria-label="Account data" className={tabListClass}>
            <Tabs.Tab value="holdings" className={tabClass}>
              Holdings
            </Tabs.Tab>
            <Tabs.Tab value="activity" className={tabClass}>
              Activity
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="holdings" className="pt-5 outline-none">
            <HoldingsView workspaceId={workspaceId} />
          </Tabs.Panel>
          <Tabs.Panel value="activity" className="pt-5 outline-none">
            <ActivityView workspaceId={workspaceId} />
          </Tabs.Panel>
        </Tabs.Root>
      ) : (
        <p role="status" className="text-[13px] text-muted-foreground">
          Importing your history. This page updates when it is done.
        </p>
      )}
    </>
  )
}

function SyncPanel({ workspaceId, sync }: { workspaceId: string; sync: SyncStatus }) {
  const refresh = useRefreshHoldings(workspaceId)
  const { account } = sync
  const facts: Array<[string, string]> = [
    ['Account', [account.name, account.maskedNumber].filter(Boolean).join(' ')],
    [
      'History from',
      account.importStartDate ? formatDate(account.importStartDate) : importModeLabel(account.importMode),
    ],
    ['Transactions through', formatDate(sync.transactionsSyncedThrough)],
    ['Holdings updated', formatDateTime(sync.holdingsSyncedAt)],
    ['Next sync', account.unlinked ? 'Not syncing' : formatDateTime(sync.nextSyncAt)],
  ]

  return (
    <section aria-labelledby="sync-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <h2 id="sync-heading" className="text-[13px] font-medium">
          Sync
        </h2>
        {!account.unlinked && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7.5 px-3"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate(account.id)}
          >
            {refresh.isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            Refresh holdings
          </Button>
        )}
      </div>
      <div className={dividedPanelClass}>
        <dl className="grid gap-x-6 gap-y-3 px-5 py-3.5 sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm break-words">{value}</dd>
            </div>
          ))}
        </dl>
        {sync.lastError && (
          <p className="px-5 py-3 text-[13px] text-muted-foreground">
            The last sync did not finish. Tradstry will try again.
          </p>
        )}
        {!account.unlinked && <ExpandHistory workspaceId={workspaceId} accountId={account.id} />}
      </div>
      {refresh.isError && (
        <p role="alert" className="text-sm text-destructive">
          {brokerageErrorMessage(refresh.error, 'Could not refresh holdings.')}
        </p>
      )}
    </section>
  )
}

function ExpandHistory({ workspaceId, accountId }: { workspaceId: string; accountId: string }) {
  const expand = useExpandHistory(workspaceId)
  const [importMode, setImportMode] = useState<ImportMode>('TWO_YEARS')
  const [customStartDate, setCustomStartDate] = useState('')
  const today = localToday()

  return (
    <form
      className="flex flex-wrap items-center gap-2 px-5 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        expand.mutate({
          accountId,
          importMode,
          customStartDate: importMode === 'CUSTOM' ? customStartDate || null : null,
        })
      }}
    >
      <label htmlFor="expand-mode" className="mr-auto text-[13px] text-muted-foreground">
        Import further back
      </label>
      <select
        id="expand-mode"
        value={importMode}
        onChange={(event) => setImportMode(event.target.value as ImportMode)}
        className="h-7.5 rounded-lg border border-border bg-background px-2 text-[13px] dark:bg-input/30"
      >
        {(Object.keys(IMPORT_MODE_LABELS) as ImportMode[]).map((mode) => (
          <option key={mode} value={mode}>
            {IMPORT_MODE_LABELS[mode]}
          </option>
        ))}
      </select>
      {importMode === 'CUSTOM' && (
        <>
          <label htmlFor="expand-start" className="sr-only">
            Import from
          </label>
          <input
            id="expand-start"
            type="date"
            required
            max={today}
            value={customStartDate}
            onChange={(event) => setCustomStartDate(event.target.value)}
            className="h-7.5 rounded-lg border border-border bg-background px-2 text-[13px] dark:bg-input/30"
          />
        </>
      )}
      <Button type="submit" size="sm" variant="secondary" className="h-7.5 px-3" disabled={expand.isPending}>
        {expand.isPending && <LoaderCircle className="animate-spin" aria-hidden />}
        Import
      </Button>
      {expand.isError && (
        <p role="alert" className="w-full text-sm text-destructive">
          {brokerageErrorMessage(expand.error, 'Could not import more history.')}
        </p>
      )}
      {expand.isSuccess && (
        <p role="status" className="w-full text-[13px] text-muted-foreground">
          Importing the earlier history now.
        </p>
      )}
    </form>
  )
}

const headerCell = 'px-3 py-2 text-left text-[13px] font-medium text-muted-foreground first:pl-5 last:pr-5'
const numberHeaderCell = `${headerCell} text-right`
const cell = 'px-3 py-2.5 first:pl-5 last:pr-5'
const numberCell = `${cell} text-right tabular-nums`

function HoldingsView({ workspaceId }: { workspaceId: string }) {
  const holdings = useHoldings(workspaceId, true)
  if (holdings.isPending) return <Skeleton className="h-32 rounded-2xl" />
  if (holdings.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load holdings.
      </p>
    )
  }
  if (!holdings.data) {
    return <p className="text-[13px] text-muted-foreground">No holdings yet.</p>
  }
  const positions = positionRows(holdings.data.positions)
  const balances = balanceRows(holdings.data.balances)

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground">As of {formatDateTime(holdings.data.capturedAt)}</p>
      {balances.length > 0 && (
        <dl className={`${panelClass} grid gap-x-6 gap-y-3 px-5 py-3.5 sm:grid-cols-3`}>
          {balances.map((balance) => (
            <div key={balance.currency}>
              <dt className="text-[13px] text-muted-foreground">Cash · {balance.currency}</dt>
              <dd className="mt-0.5 text-sm tabular-nums">{formatMoney(balance.cash, balance.currency)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className={`${panelClass} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200/60 dark:border-white/10">
            <tr>
              <th scope="col" className={headerCell}>Symbol</th>
              <th scope="col" className={numberHeaderCell}>Units</th>
              <th scope="col" className={numberHeaderCell}>Price</th>
              <th scope="col" className={numberHeaderCell}>Avg cost</th>
              <th scope="col" className={numberHeaderCell}>Open P&amp;L</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200/60 dark:divide-white/10">
            {positions.length === 0 ? (
              <tr>
                <td colSpan={5} className={`${cell} text-[13px] text-muted-foreground`}>
                  No open positions.
                </td>
              </tr>
            ) : (
              positions.map((position, index) => (
                <tr key={`${position.symbol}-${index}`}>
                  <td className={cell}>
                    <span className="font-medium">{position.symbol}</span>
                    {position.description && (
                      <span className="block max-w-64 truncate text-[13px] text-muted-foreground">
                        {position.description}
                      </span>
                    )}
                  </td>
                  <td className={numberCell}>{formatNumber(position.units)}</td>
                  <td className={numberCell}>{formatMoney(position.price, position.currency)}</td>
                  <td className={numberCell}>{formatMoney(position.averagePrice, position.currency)}</td>
                  <td className={numberCell}>{formatMoney(position.openPnl, position.currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ActivityView({ workspaceId }: { workspaceId: string }) {
  const [page, setPage] = useState(0)
  const activities = useActivities(workspaceId, page, true)
  if (activities.isPending) return <Skeleton className="h-32 rounded-2xl" />
  if (activities.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load activity.
      </p>
    )
  }
  const { total, items } = activities.data
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE))
  if (total === 0) return <p className="text-[13px] text-muted-foreground">No activity imported yet.</p>

  return (
    <div className="space-y-3">
      <div className={`${panelClass} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200/60 dark:border-white/10">
            <tr>
              <th scope="col" className={headerCell}>Date</th>
              <th scope="col" className={headerCell}>Type</th>
              <th scope="col" className={headerCell}>Symbol</th>
              <th scope="col" className={numberHeaderCell}>Units</th>
              <th scope="col" className={numberHeaderCell}>Price</th>
              <th scope="col" className={numberHeaderCell}>Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200/60 dark:divide-white/10">
            {items.map((activity) => (
              <tr key={activity.id}>
                <td className={`${cell} whitespace-nowrap`}>{formatDate(activity.tradeDate)}</td>
                <td className={cell}>{activity.type}</td>
                <td className={cell}>
                  {activity.optionSymbol ?? activity.symbol ?? (
                    <span className="block max-w-64 truncate text-[13px] text-muted-foreground">
                      {activity.description ?? '—'}
                    </span>
                  )}
                </td>
                <td className={numberCell}>{formatNumber(activity.units)}</td>
                <td className={numberCell}>{formatMoney(activity.price, activity.currency)}</td>
                <td className={numberCell}>{formatMoney(activity.amount, activity.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-[13px] text-muted-foreground">
        <span>
          {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-7 px-2.5" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2.5"
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
