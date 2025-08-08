"use client";

import { useOptions } from "@/lib/hooks/use-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OptionInDB } from "@/lib/types/trading";
import { Plus } from "lucide-react";
import { AddTradeDialog } from "./add-trade-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OptionsTableProps {
  className?: string;
}

export function OptionsTable({ className }: OptionsTableProps) {
  const { options, isLoading, error } = useOptions();

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
        Error loading options: {error.message}
      </div>
    );
  }

  return (
    <div className={`rounded-md border ${className}`}>
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold">Options Trades</h3>
        <AddTradeDialog />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Strategy</TableHead>
            <TableHead>Direction</TableHead>
            <TableHead className="text-right">Contracts</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Entry Price</TableHead>
            <TableHead className="text-right">Exit Price</TableHead>
            <TableHead className="text-right">Commissions</TableHead>
            <TableHead>Entry Date</TableHead>
            <TableHead>Exit Date</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            // Loading skeleton
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              </TableRow>
            ))
          ) : options && options.length > 0 ? (
            options.map((option) => {
              const isCall = option.option_type === "Call";
              const isOpen = option.status === "open";

              return (
                <TableRow key={option.id}>
                  <TableCell className="font-medium">{option.symbol}</TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {option.strategy_type || 'N/A'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={option.trade_direction === 'Bullish' 
                        ? 'bg-green-50 text-green-700 border-green-200' 
                        : option.trade_direction === 'Bearish'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-gray-50 text-gray-700 border-gray-200'
                      }
                    >
                      {option.trade_direction || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{option.number_of_contracts || 'N/A'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={isCall ? "outline" : "secondary"}
                      className={
                        isCall
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-purple-50 text-purple-700 border-purple-200"
                      }
                    >
                      {option.option_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {option.entry_price ? `$${option.entry_price.toFixed(2)}` : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    {option.exit_price ? `$${option.exit_price.toFixed(2)}` : 'N/A'}
                  </TableCell>
                  <TableCell className="text-right">
                    {option.commissions ? `$${option.commissions.toFixed(2)}` : 'N/A'}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {option.entry_date ? new Date(option.entry_date).toLocaleDateString() : 'N/A'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {option.exit_date ? new Date(option.exit_date).toLocaleDateString() : 'N/A'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={isOpen ? "outline" : "secondary"}
                      className={isOpen ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}
                    >
                      {option.status}
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
                No options trades found. Add your first option trade to get
                started!
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
