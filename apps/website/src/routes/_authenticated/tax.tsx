import { createFileRoute } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { ChoiceField, Pnl } from '@/components/trades/trade-bits'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { dataTableClass, numericCell } from '@/components/ui/table-styles'
import { type TaxTotals, useTaxReport } from '@/lib/client/trades/trades'
import { money, quantity, tradeErrorMessage } from '@/lib/client/trades/trades-model'
import { formatDate } from '@/lib/format'

export const Route = createFileRoute('/_authenticated/tax')({
  component: TaxPage,
})

function Totals({ label, totals }: { label: string; totals: TaxTotals }) {
  return (
    <div className="min-w-0 space-y-2">
      <h2 className="text-xs text-muted-foreground">{label}</h2>
      <p className="text-2xl font-semibold">
        <Pnl value={totals.gain} />
      </p>
      <dl className="space-y-0.5 text-xs text-muted-foreground tabular-nums">
        <div className="flex justify-between gap-3">
          <dt>Proceeds</dt>
          <dd>{money(totals.proceeds)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Cost basis</dt>
          <dd>{money(totals.cost)}</dd>
        </div>
        {totals.washDisallowed !== '0.00' && (
          <div className="flex justify-between gap-3">
            <dt>Wash sale loss disallowed</dt>
            <dd>{money(totals.washDisallowed)}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function TaxPage() {
  const id = useId()
  const [year, setYear] = useState<number | null>(null)
  const report = useTaxReport(year)
  const data = report.data
  const years = data?.years.length ? data.years : data ? [data.year] : []

  return (
    <div className="mx-auto w-full max-w-300 space-y-6 pt-2 pb-10 sm:pt-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Realized gains</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Across your taxable workspaces, with wash sales applied across all of them. Retirement accounts are left out.
          </p>
        </div>
        {data && (
          <ChoiceField
            id={`${id}-year`}
            label="Tax year"
            value={String(data.year)}
            onChange={(value) => setYear(Number(value))}
            choices={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
        )}
      </div>

      <Alert>
        <AlertDescription className="text-xs leading-5">
          An estimate from your imported and manual fills, not tax advice. Your brokerage’s 1099-B is the record. Tradstry
          treats only the same ticker as substantially identical for wash sales.
        </AlertDescription>
      </Alert>

      {report.isPending ? (
        <Skeleton className="h-72 rounded-xl" aria-label="Loading gains" />
      ) : report.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {tradeErrorMessage(report.error, 'Could not load realized gains.')}
        </p>
      ) : !data || data.rows.length === 0 ? (
        <Card className="items-center gap-2 px-6 py-12 text-center shadow-none">
          <h2 className="font-medium">No sales in {data?.year ?? 'this year'}</h2>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">Gains appear here once positions in taxable workspaces close.</p>
        </Card>
      ) : (
        <div className={`space-y-6 ${report.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}`}>
          <Card className="grid gap-6 px-5 py-5 shadow-none sm:grid-cols-3">
            <Totals label="Short-term" totals={data.shortTerm} />
            <Totals label="Long-term" totals={data.longTerm} />
            <Totals label="Total" totals={data.total} />
          </Card>
          <Card className="gap-0 py-0 shadow-none">
            <Table className={dataTableClass} aria-label={`Sales in ${data.year}`}>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead scope="col">Security</TableHead>
                  <TableHead scope="col" className={numericCell}>
                    Quantity
                  </TableHead>
                  <TableHead scope="col">Acquired</TableHead>
                  <TableHead scope="col">Sold</TableHead>
                  <TableHead scope="col" className={numericCell}>
                    Proceeds
                  </TableHead>
                  <TableHead scope="col" className={numericCell}>
                    Cost basis
                  </TableHead>
                  <TableHead scope="col" className={numericCell}>
                    Adjustment
                  </TableHead>
                  <TableHead scope="col" className={numericCell}>
                    Gain or loss
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, index) => (
                  <TableRow key={`${row.tradeId}-${row.soldAt}-${index}`}>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">{row.symbol}</span>
                        {row.direction === 'short' && (
                          <Badge variant="outline" className="font-normal">
                            Short sale
                          </Badge>
                        )}
                        <Badge variant="secondary" className="font-normal">
                          {row.term === 'long' ? 'Long-term' : 'Short-term'}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell className={numericCell}>{quantity(row.quantity)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.acquiredAt)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.soldAt)}</TableCell>
                    <TableCell className={numericCell}>{money(row.proceeds)}</TableCell>
                    <TableCell className={numericCell}>{money(row.cost)}</TableCell>
                    <TableCell className={numericCell}>
                      {row.code ? (
                        <span title={row.washPermanent ? 'Washed by a purchase in an IRA; this loss cannot be recovered' : 'Wash sale: the loss moves into the replacement shares'}>
                          {money(row.washDisallowed)} {row.code}
                          {row.washPermanent && ' (IRA)'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className={numericCell}>
                      <Pnl value={row.gain} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  )
}
