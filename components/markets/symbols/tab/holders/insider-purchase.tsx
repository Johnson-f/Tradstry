"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { useHolders } from "@/lib/hooks/use-market-data-service";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface InsiderPurchaseProps {
  symbol: string;
  className?: string;
}

function formatNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toLocaleString();
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined) return "N/A";
  return `$${price.toFixed(2)}`;
}

function formatShares(shares: number): string {
  const absShares = Math.abs(shares);
  return `${shares >= 0 ? "+" : ""}${formatNumber(absShares)}`;
}

function Loading({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-4", className)}>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export function InsiderPurchase({ symbol, className }: InsiderPurchaseProps) {
  const { holders, isLoading } = useHolders(
    {
      symbol,
      holder_type: "insider_purchases",
    },
    !!symbol
  );

  const purchases = holders?.insider_purchases ?? [];

  if (isLoading) return <Loading className={className} />;

  if (!purchases || purchases.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        No insider purchases data available.
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border bg-card/50", className)}>
      <ScrollArea className="w-full">
        <div className="p-4 sm:p-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[25%]">Insider</TableHead>
                <TableHead className="w-[20%]">Transaction Type</TableHead>
                <TableHead className="text-right">Shares</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((purchase, index) => (
                <TableRow key={`${purchase.insider}-${purchase.date}-${index}`}>
                  <TableCell className="font-medium">
                    {purchase.insider}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400">
                      {purchase.transaction_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                    {formatShares(purchase.shares)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatPrice(purchase.price)}
                  </TableCell>
                  <TableCell className="text-right">
                    {purchase.value !== null && purchase.value !== undefined
                      ? `$${formatNumber(purchase.value)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatDate(purchase.date)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

