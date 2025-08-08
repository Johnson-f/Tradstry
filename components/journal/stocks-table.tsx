"use client";

import { StockInDB } from "@/lib/types/trading";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableHead,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AddTradeDialog } from "./add-trade-dialog";

interface StocksTableProps {
  stocks: StockInDB[];
  isLoading?: boolean;
}

export function StocksTable({ stocks, isLoading = false }: StocksTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center space-x-4 p-4 border rounded-lg"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-16 ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  const hasData = stocks && stocks.length > 0;

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold">Stock Trades</h3>
        <AddTradeDialog />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Entry Price</TableHead>
            <TableHead className="text-right">Exit Price</TableHead>
            <TableHead className="text-right">Shares</TableHead>
            <TableHead className="text-right">Commissions</TableHead>
            <TableHead className="text-right">Stop Loss</TableHead>
            <TableHead className="text-right">Take Profit</TableHead>
            <TableHead>Entry Date</TableHead>
            <TableHead>Exit Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">P/L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasData ? (
            stocks.map((stock) => {
              return (
                <TableRow key={stock.id}>
                  <TableCell className="font-medium">{stock.symbol}</TableCell>
                  <TableCell className="capitalize">
                    {stock.trade_type}
                  </TableCell>
                  <TableCell className="text-right">
                    ${stock.entry_price?.toFixed(2) || "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.exit_price
                      ? `$${stock.exit_price.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.number_shares || "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.commissions
                      ? `$${stock.commissions.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.stop_loss ? `$${stock.stop_loss.toFixed(2)}` : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.take_profit
                      ? `$${stock.take_profit.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    {stock.entry_date
                      ? new Date(stock.entry_date).toLocaleDateString()
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    {stock.exit_date
                      ? new Date(stock.exit_date).toLocaleDateString()
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        stock.status === "open" ? "outline" : "secondary"
                      }
                      className={
                        stock.status === "open"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }
                    >
                      {stock.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={11}
                className="h-24 text-center text-muted-foreground"
              >
                No stock trades found. Add your first trade to get started!
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
