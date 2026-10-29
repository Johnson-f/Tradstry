import { ArrowLeft, ArrowRight, Clock3, Inbox, LoaderCircle, Wallet } from 'lucide-react'
import { useState } from 'react'
import { AccountSync } from '@/components/brokerage/account-sync'
import { BrokerageError } from '@/components/brokerage/feedback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ACTIVITY_PAGE_SIZE,
  type SyncStatus,
  useActivities,
  useHoldings,
  useOrders,
} from '@/lib/client/brokerage/brokerage'
import { balanceRows, positionRows } from '@/lib/client/brokerage/brokerage-model'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format'

export function BrokerageAccountView({ workspaceId, sync }: { workspaceId: string; sync: SyncStatus }) {
  const imported = sync.initialImportCompletedAt !== null
  const live = !sync.account.unlinked
  return (
    <div className="space-y-7">
      <AccountSync workspaceId={workspaceId} sync={sync} />
      {imported ? (
        <Tabs defaultValue="holdings" className="gap-6">
          <TabsList
            variant="line"
            aria-label="Account data"
            className="h-11 w-full justify-start gap-5 border-b p-0"
          >
            <TabsTrigger value="holdings" className="flex-none px-0 pb-2 after:bottom-0!">
              Holdings
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-none px-0 pb-2 after:bottom-0!">
              Activity
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex-none px-0 pb-2 after:bottom-0!">
              Orders
            </TabsTrigger>
          </TabsList>
          <TabsContent value="holdings">
            <HoldingsView workspaceId={workspaceId} live={live} />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityView workspaceId={workspaceId} live={live} />
          </TabsContent>
          <TabsContent value="orders">
            <OrdersView workspaceId={workspaceId} live={live} />
          </TabsContent>
        </Tabs>
      ) : (
        <Card className="items-center gap-3 px-6 py-12 text-center shadow-none" role="status">
          {!live || sync.lastError ? (
            <Clock3 className="size-7 text-muted-foreground" aria-hidden />
          ) : (
            <LoaderCircle
              className="size-7 animate-spin text-muted-foreground motion-reduce:animate-none"
              aria-hidden
            />
          )}
          <h2 className="text-base font-medium">
            {!live
              ? 'This account is no longer syncing'
              : sync.lastError
                ? 'Your import needs another try'
                : 'Bringing in your account'}
          </h2>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            {!live
              ? 'The first import did not finish before this account was disconnected.'
              : sync.lastError
                ? 'Check your connection above. Tradstry will retry the import automatically.'
                : 'Your history, holdings, and recent orders are being imported. You can leave this page and come back later.'}
          </p>
        </Card>
      )}
    </div>
  )
}

function EmptyData({ title, description }: { title: string; description: string }) {
  return (
    <Card className="items-center gap-3 px-6 py-10 text-center shadow-none">
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <h3 className="font-medium">{title}</h3>
      <p className="max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </Card>
  )
}

const tableClass =
  '[&_th]:px-5 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:px-5 [&_td]:py-4'
const numeric = 'text-right tabular-nums'

function HoldingsView({ workspaceId, live }: { workspaceId: string; live: boolean }) {
  const holdings = useHoldings(workspaceId, true, live)
  if (holdings.isPending) return <Skeleton className="h-64 rounded-xl" aria-label="Loading holdings" />
  if (holdings.isError && !holdings.data)
    return (
      <BrokerageError
        message="Could not load holdings."
        retry={() => void holdings.refetch()}
        pending={holdings.isFetching}
      />
    )
  if (!holdings.data)
    return (
      <EmptyData
        title="No holdings imported yet"
        description="Your holdings will appear here after the next successful sync."
      />
    )
  const positions = positionRows(holdings.data.positions)
  const balances = balanceRows(holdings.data.balances)
  return (
    <div className="space-y-6">
      {holdings.isError && (
        <BrokerageError
          message="Could not check for updated holdings. Showing your last saved data."
          retry={() => void holdings.refetch()}
          pending={holdings.isFetching}
        />
      )}
      {balances.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {balances.map((balance) => (
            <Card key={balance.currency} className="gap-4 p-5 shadow-none">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wallet className="size-4" aria-hidden />
                {balance.currency} balances
              </div>
              <dl className="grid grid-cols-2 gap-4">
                <div className="min-w-0 space-y-2">
                  <dt className="text-xs text-muted-foreground">Cash</dt>
                  <dd className="text-xl font-semibold tracking-tight break-words tabular-nums">
                    {formatMoney(balance.cash, balance.currency)}
                  </dd>
                </div>
                <div className="min-w-0 space-y-2 border-l pl-4">
                  <dt className="text-xs text-muted-foreground">Buying power</dt>
                  <dd className="text-xl font-semibold tracking-tight break-words tabular-nums">
                    {formatMoney(balance.buyingPower, balance.currency)}
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          Open positions<Badge variant="secondary">{positions.length}</Badge>
        </h3>
        <p className="text-xs text-muted-foreground">As of {formatDateTime(holdings.data.capturedAt)}</p>
      </div>
      {positions.length === 0 ? (
        <EmptyData
          title="No open positions"
          description="There are no open positions in the latest account snapshot."
        />
      ) : (
        <Card className="gap-0 py-0 shadow-none">
          <Table className={tableClass} aria-label="Open positions">
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead scope="col">Symbol</TableHead>
                <TableHead scope="col" className={numeric}>
                  Units
                </TableHead>
                <TableHead scope="col" className={numeric}>
                  Price
                </TableHead>
                <TableHead scope="col" className={numeric}>
                  Average cost
                </TableHead>
                <TableHead scope="col" className={numeric}>
                  Open P&amp;L
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((position, index) => (
                <TableRow key={`${position.symbol}-${index}`}>
                  <TableCell>
                    <span className="font-medium">{position.symbol}</span>
                    {position.description && (
                      <span
                        className="mt-1 block max-w-60 truncate text-xs text-muted-foreground"
                        title={position.description}
                      >
                        {position.description}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={numeric}>{formatNumber(position.units)}</TableCell>
                  <TableCell className={numeric}>{formatMoney(position.price, position.currency)}</TableCell>
                  <TableCell className={numeric}>
                    {formatMoney(position.averagePrice, position.currency)}
                  </TableCell>
                  <TableCell
                    className={`${numeric} ${(position.openPnl ?? 0) > 0 ? 'text-emerald-700 dark:text-emerald-400' : (position.openPnl ?? 0) < 0 ? 'text-destructive' : ''}`}
                  >
                    {formatMoney(position.openPnl, position.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

function ActivityView({ workspaceId, live }: { workspaceId: string; live: boolean }) {
  const [page, setPage] = useState(0)
  const activities = useActivities(workspaceId, page, true, live)
  if (activities.isPending) return <Skeleton className="h-64 rounded-xl" aria-label="Loading activity" />
  if (activities.isError && !activities.data)
    return (
      <BrokerageError
        message="Could not load activity."
        retry={() => void activities.refetch()}
        pending={activities.isFetching}
      />
    )
  if (!activities.data) return null
  const { total, items } = activities.data
  const pages = Math.max(1, Math.ceil(total / ACTIVITY_PAGE_SIZE))
  if (total === 0)
    return (
      <EmptyData
        title="No activity in this range"
        description="Imported trades, dividends, and other account activity will appear here. You can import older history above."
      />
    )
  return (
    <div className="space-y-4" aria-busy={activities.isFetching}>
      {activities.isError && (
        <BrokerageError
          message="Could not check for updated activity. Showing your last saved data."
          retry={() => void activities.refetch()}
          pending={activities.isFetching}
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Account activity</h3>
        <span className="text-xs text-muted-foreground">
          {total.toLocaleString()} {total === 1 ? 'entry' : 'entries'}
        </span>
      </div>
      <Card className="gap-0 py-0 shadow-none">
        <Table className={tableClass} aria-label="Account activity">
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead scope="col">Date</TableHead>
              <TableHead scope="col">Type</TableHead>
              <TableHead scope="col">Symbol / description</TableHead>
              <TableHead scope="col" className={numeric}>
                Units
              </TableHead>
              <TableHead scope="col" className={numeric}>
                Price
              </TableHead>
              <TableHead scope="col" className={numeric}>
                Amount
              </TableHead>
              <TableHead scope="col" className={numeric}>
                Fee
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((activity) => (
              <TableRow key={activity.id}>
                <TableCell>{formatDate(activity.tradeDate)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {activity.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-medium">{activity.optionSymbol ?? activity.symbol ?? '—'}</span>
                  {activity.description && (
                    <span
                      className="mt-1 block max-w-56 truncate text-xs text-muted-foreground"
                      title={activity.description}
                    >
                      {activity.description}
                    </span>
                  )}
                </TableCell>
                <TableCell className={numeric}>{formatNumber(activity.units)}</TableCell>
                <TableCell className={numeric}>{formatMoney(activity.price, activity.currency)}</TableCell>
                <TableCell className={numeric}>{formatMoney(activity.amount, activity.currency)}</TableCell>
                <TableCell className={`${numeric} text-muted-foreground`}>
                  {formatMoney(activity.fee, activity.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
          <p className="text-xs text-muted-foreground" role="status">
            {activities.isPlaceholderData
              ? 'Loading activity…'
              : `${page * ACTIVITY_PAGE_SIZE + 1}–${Math.min((page + 1) * ACTIVITY_PAGE_SIZE, total)} of ${total.toLocaleString()}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Previous page"
              disabled={page === 0 || activities.isFetching}
              onClick={() => setPage((current) => current - 1)}
            >
              <ArrowLeft aria-hidden />
            </Button>
            <span className="px-1 text-xs text-muted-foreground">
              {page + 1} / {pages}
            </span>
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Next page"
              disabled={page + 1 >= pages || activities.isFetching}
              onClick={() => setPage((current) => current + 1)}
            >
              <ArrowRight aria-hidden />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function OrdersView({ workspaceId, live }: { workspaceId: string; live: boolean }) {
  const orders = useOrders(workspaceId, live)
  if (orders.isPending) return <Skeleton className="h-64 rounded-xl" aria-label="Loading orders" />
  if (orders.isError && !orders.data)
    return (
      <BrokerageError
        message="Could not load orders."
        retry={() => void orders.refetch()}
        pending={orders.isFetching}
      />
    )
  if (!orders.data) return null
  if (orders.data.length === 0)
    return (
      <EmptyData
        title="No orders imported yet"
        description="Recent orders from your brokerage will appear here after syncing."
      />
    )
  return (
    <div className="space-y-4">
      {orders.isError && (
        <BrokerageError
          message="Could not check for updated orders. Showing your last saved data."
          retry={() => void orders.refetch()}
          pending={orders.isFetching}
        />
      )}
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Recent orders</h3>
        <p className="text-xs leading-5 text-muted-foreground">
          The latest {orders.data.length === 200 ? '200 ' : ''}imported orders. Manage orders at your
          brokerage.
        </p>
      </div>
      <Card className="gap-0 py-0 shadow-none">
        <Table className={tableClass} aria-label="Recent orders">
          <TableHeader className="bg-muted/30">
            <TableRow>
              <TableHead scope="col">Placed</TableHead>
              <TableHead scope="col">Symbol</TableHead>
              <TableHead scope="col">Action</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col" className={numeric}>
                Filled / total
              </TableHead>
              <TableHead scope="col" className={numeric}>
                Fill price
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.data.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{formatDateTime(order.timePlaced)}</TableCell>
                <TableCell className="font-medium">{order.symbol ?? '—'}</TableCell>
                <TableCell>{order.action ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">
                    {order.status ?? 'Unknown'}
                  </Badge>
                </TableCell>
                <TableCell className={numeric}>
                  {formatNumber(order.filledUnits)} / {formatNumber(order.totalUnits)}
                </TableCell>
                <TableCell className={numeric}>{formatNumber(order.executionPrice)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
