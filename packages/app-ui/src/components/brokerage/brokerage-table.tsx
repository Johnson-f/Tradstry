"use client";

import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Checkbox } from "@tradstry/app-ui/components/ui/checkbox";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tradstry/app-ui/components/ui/select";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { RANGE_PRESETS } from "@tradstry/app-ui/lib/range-presets";
import type { AnalyticsRange } from "@tradstry/app-ui/lib/types/analytics";
import type { BrokerageTransaction } from "@tradstry/app-ui/lib/types/brokerage";
import { cn } from "@tradstry/app-ui/lib/utils";
import { Fragment, useId, useMemo, useState } from "react";

interface BrokerageTableProps {
  transactions: BrokerageTransaction[];
  total: number;
  offset: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  onPageSizeChange: (size: number) => void;
  isLoading: boolean;
  linkedTransactionIds?: Set<string>;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  dateRange?: AnalyticsRange;
  onDateRangeChange?: (range: AnalyticsRange) => void;
  symbolSearch?: string;
  onSymbolSearchChange?: (value: string) => void;
  scopeControl?: React.ReactNode;
}

export function updateBrokerageSelection(
  selectedIds: Set<string>,
  transactionIds: string[],
  linkedIds: Set<string>,
  checked: boolean,
): Set<string> {
  const next = new Set(selectedIds);
  for (const id of transactionIds) {
    if (linkedIds.has(id)) continue;
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

function fmtCurrency(value: number | null, currency: string, signed = false) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value);
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function fmtMonth(value: string) {
  if (value === "unknown") return "Unknown date";
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

const EMPTY_LINKED_IDS = new Set<string>();
const SKELETON_ROWS = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function BrokerageTable({
  transactions,
  total,
  offset,
  page,
  pageSize,
  hasNextPage,
  hasPrevPage,
  onNextPage,
  onPrevPage,
  onPageSizeChange,
  isLoading,
  linkedTransactionIds = EMPTY_LINKED_IDS,
  selectedIds,
  onSelectedIdsChange,
  dateRange = "ALL",
  onDateRangeChange,
  symbolSearch = "",
  onSymbolSearchChange,
  scopeControl,
}: BrokerageTableProps) {
  const symbolSearchId = useId();
  const monthGroups = useMemo(() => {
    const months = new Map<string, Map<string, BrokerageTransaction[]>>();
    for (const tx of transactions) {
      const month = tx.tradeDate?.slice(0, 7) ?? "unknown";
      const symbol = tx.symbol ?? "Other activity";
      let symbols = months.get(month);
      if (!symbols) {
        symbols = new Map();
        months.set(month, symbols);
      }
      const group = symbols.get(symbol);
      if (group) group.push(tx);
      else symbols.set(symbol, [tx]);
    }
    return months;
  }, [transactions]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const groupKeys = [...monthGroups].flatMap(([month, symbols]) =>
    [...symbols.keys()].map((symbol) => `${month}:${symbol}`),
  );
  const allExpanded =
    groupKeys.length > 0 && groupKeys.every((key) => expandedGroups.has(key));

  function toggleGroup(key: string) {
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function select(ids: string[], checked: boolean) {
    onSelectedIdsChange(
      updateBrokerageSelection(selectedIds, ids, linkedTransactionIds, checked),
    );
  }

  const visibleStart = total === 0 ? 0 : offset + 1;
  const visibleEnd = Math.min(offset + transactions.length, total);
  const rangeLabel =
    dateRange === "ALL"
      ? "All time"
      : dateRange === "CUSTOM"
        ? "Custom dates"
        : RANGE_PRESETS.find((preset) => preset.value === dateRange)
            ?.description;

  return (
    <section
      aria-label="Brokerage execution ledger"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-muted/50"
    >
      <div className="shrink-0 px-4 pb-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {onSymbolSearchChange && (
            <label
              htmlFor={symbolSearchId}
              className="relative w-full sm:max-w-56"
            >
              <span className="sr-only">Search by symbol</span>
              <HugeiconsIcon
                icon={Search01Icon}
                strokeWidth={1.8}
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id={symbolSearchId}
                placeholder="Search ticker…"
                value={symbolSearch}
                onChange={(event) => onSymbolSearchChange(event.target.value)}
                className="h-8 rounded-lg bg-background pl-8 shadow-none"
              />
            </label>
          )}
          <div className="flex max-w-full flex-wrap items-center gap-2 sm:ml-auto">
            {scopeControl}
            {onDateRangeChange && (
              <Select
                value={dateRange}
                onValueChange={(value) =>
                  onDateRangeChange(value as AnalyticsRange)
                }
              >
                <SelectTrigger
                  aria-label="Date range"
                  className="h-8 w-36 bg-background text-xs shadow-none"
                >
                  <SelectValue>{rangeLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {dateRange === "CUSTOM" && (
                    <SelectItem value="CUSTOM" disabled>
                      Custom dates
                    </SelectItem>
                  )}
                  {RANGE_PRESETS.map((preset) => (
                    <SelectItem key={preset.value} value={preset.value}>
                      {preset.value === "ALL" ? "All time" : preset.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <p aria-live="polite">
            {isLoading ? "Loading fills…" : `${total.toLocaleString()} fills`}
          </p>
          <button
            type="button"
            disabled={isLoading || !groupKeys.length}
            onClick={() =>
              setExpandedGroups((previous) => {
                const next = new Set(previous);
                for (const key of groupKeys) {
                  if (allExpanded) next.delete(key);
                  else next.add(key);
                }
                return next;
              })
            }
            className="rounded-sm text-xs text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>
      {isLoading ? (
        <div className="min-h-0 flex-1 overflow-hidden" aria-live="polite">
          <span className="sr-only">Loading transactions</span>
          {SKELETON_ROWS.map((key) => (
            <div key={key} className="border-t border-border/60 py-4">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <ScrollArea
            orientation="both"
            type="auto"
            className="min-h-0 min-w-0 flex-1 [&>[data-slot=scroll-area-viewport]]:overscroll-contain [&>[data-slot=scroll-area-viewport]>div]:block! [&>[data-slot=scroll-area-scrollbar]]:z-30"
          >
            <table className="w-full min-w-[40rem] table-fixed border-separate border-spacing-0 text-xs tabular-nums">
              <colgroup>
                <col className="w-10" />
                <col className="w-[36%]" />
                <col className="w-[15%]" />
                <col className="w-[10%]" />
                <col className="w-[15%]" />
                <col />
              </colgroup>
              <thead className="sticky top-0 z-20 bg-muted shadow-[0_1px_0_var(--border)]">
                <tr className="text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground [&>th]:h-10 [&>th]:border-t [&>th]:border-border/60 [&>th]:px-3 [&>th]:font-medium">
                  <th scope="col">
                    <SelectionCheckbox
                      label="Select all visible transactions"
                      transactions={transactions}
                      linkedIds={linkedTransactionIds}
                      selectedIds={selectedIds}
                      onChange={select}
                    />
                  </th>
                  <th scope="col" className="text-left">
                    Security / Date
                  </th>
                  <th scope="col" className="text-left">
                    Side
                  </th>
                  <th scope="col" className="text-right">
                    Quantity
                  </th>
                  <th scope="col" className="text-right">
                    Price
                  </th>
                  <th scope="col" className="text-right">
                    Cash amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <p className="text-sm font-medium">No matching fills</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Try another ticker, date range, or journal status.
                      </p>
                    </td>
                  </tr>
                ) : (
                  [...monthGroups].map(([month, symbols]) => {
                    const monthTransactions = [...symbols.values()].flat();
                    return (
                      <Fragment key={month}>
                        <tr className="bg-muted/60">
                          <td className="h-10 border-b border-border/50 px-3">
                            <SelectionCheckbox
                              label={`Select all fills in ${fmtMonth(month)}`}
                              transactions={monthTransactions}
                              linkedIds={linkedTransactionIds}
                              selectedIds={selectedIds}
                              onChange={select}
                            />
                          </td>
                          <th
                            scope="rowgroup"
                            colSpan={5}
                            className="border-b border-border/50 px-3 text-left text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground"
                          >
                            {fmtMonth(month)}
                          </th>
                        </tr>
                        {[...symbols].map(([symbol, txs]) => {
                          const key = `${month}:${symbol}`;
                          const expanded = expandedGroups.has(key);
                          const linkedCount = txs.filter((tx) =>
                            linkedTransactionIds.has(tx.id),
                          ).length;
                          return (
                            <Fragment key={key}>
                              <tr className="transition-colors hover:bg-accent">
                                <td className="border-b border-border/60 px-3">
                                  <SelectionCheckbox
                                    label={`Select all ${symbol} fills in ${fmtMonth(month)}`}
                                    transactions={txs}
                                    linkedIds={linkedTransactionIds}
                                    selectedIds={selectedIds}
                                    onChange={select}
                                  />
                                </td>
                                <td
                                  colSpan={5}
                                  className="border-b border-border/60"
                                >
                                  <button
                                    type="button"
                                    aria-expanded={expanded}
                                    onClick={() => toggleGroup(key)}
                                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30"
                                  >
                                    <HugeiconsIcon
                                      icon={ArrowDown01Icon}
                                      strokeWidth={1.8}
                                      className={cn(
                                        "size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                                        !expanded && "-rotate-90",
                                      )}
                                    />
                                    <span className="shrink-0 font-medium">
                                      {symbol}
                                    </span>
                                    {txs[0]?.symbolDescription && (
                                      <span className="min-w-0 truncate text-muted-foreground">
                                        {txs[0].symbolDescription}
                                      </span>
                                    )}
                                    <span className="ml-auto flex shrink-0 items-center gap-3 text-[0.6875rem] text-muted-foreground">
                                      {linkedCount > 0 && (
                                        <span>
                                          {linkedCount === txs.length
                                            ? "In journal"
                                            : `${linkedCount} in journal`}
                                        </span>
                                      )}
                                      <span>
                                        {txs.length}{" "}
                                        {txs.length === 1 ? "fill" : "fills"}
                                      </span>
                                    </span>
                                  </button>
                                </td>
                              </tr>
                              {expanded &&
                                txs.map((tx) => {
                                  const isLinked = linkedTransactionIds.has(
                                    tx.id,
                                  );
                                  const side = tx.transactionType.replaceAll(
                                    "_",
                                    " ",
                                  );
                                  return (
                                    <tr
                                      key={tx.id}
                                      className={cn(
                                        "transition-colors hover:bg-accent [&>td]:h-10 [&>td]:border-b [&>td]:border-border/50 [&>td]:px-3 [&>td]:py-2",
                                        selectedIds.has(tx.id) &&
                                          "bg-accent/70",
                                      )}
                                    >
                                      <td>
                                        <Checkbox
                                          aria-label={`${isLinked ? "In journal" : "Select"} ${tx.symbol ?? "transaction"}, ${fmtDate(tx.tradeDate)}, ${side}, ${Math.abs(tx.units)} at ${fmtCurrency(tx.price, tx.currency)}`}
                                          checked={selectedIds.has(tx.id)}
                                          disabled={isLinked}
                                          onCheckedChange={(checked) =>
                                            select([tx.id], checked === true)
                                          }
                                        />
                                      </td>
                                      <td>
                                        <div className="pl-6 text-muted-foreground">
                                          {fmtDate(tx.tradeDate)}
                                          {!tx.symbol && tx.description && (
                                            <p className="mt-0.5 whitespace-normal text-[0.6875rem]">
                                              {tx.description}
                                            </p>
                                          )}
                                        </div>
                                      </td>
                                      <td className="whitespace-normal break-words">
                                        <span className="text-[0.6875rem]">
                                          {side === "BUY"
                                            ? "Buy"
                                            : side === "SELL"
                                              ? "Sell"
                                              : side}
                                        </span>
                                      </td>
                                      <td className="text-right">
                                        {tx.units !== 0
                                          ? Math.abs(tx.units).toLocaleString()
                                          : "—"}
                                      </td>
                                      <td className="whitespace-nowrap text-right">
                                        {fmtCurrency(tx.price, tx.currency)}
                                      </td>
                                      <td className="whitespace-nowrap text-right">
                                        <span>
                                          {fmtCurrency(
                                            tx.amount,
                                            tx.currency,
                                            true,
                                          )}
                                        </span>
                                        {tx.fee !== 0 && (
                                          <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                                            Fee{" "}
                                            {fmtCurrency(tx.fee, tx.currency)}
                                          </p>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </ScrollArea>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-[0.6875rem] text-muted-foreground tabular-nums">
              <span className="font-medium text-foreground">
                {visibleStart}–{visibleEnd}
              </span>{" "}
              of {total.toLocaleString()} fills
            </p>
            <div className="flex items-center gap-3">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => onPageSizeChange(Number(value))}
              >
                <SelectTrigger
                  aria-label="Fills per page"
                  className="h-7 w-32 bg-background text-[0.6875rem] shadow-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 per page</SelectItem>
                  <SelectItem value="100">100 per page</SelectItem>
                  <SelectItem value="1000">1000 per page</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={!hasPrevPage}
                  onClick={onPrevPage}
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={1.8} />
                </Button>
                <span className="min-w-12 text-center text-[0.6875rem] text-muted-foreground tabular-nums">
                  Page {page + 1}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={!hasNextPage}
                  onClick={onNextPage}
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={1.8} />
                </Button>
              </div>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}

function SelectionCheckbox({
  label,
  transactions,
  linkedIds,
  selectedIds,
  onChange,
}: {
  label: string;
  transactions: BrokerageTransaction[];
  linkedIds: Set<string>;
  selectedIds: Set<string>;
  onChange: (ids: string[], checked: boolean) => void;
}) {
  const ids = transactions
    .filter((tx) => !linkedIds.has(tx.id))
    .map((tx) => tx.id);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
  const someSelected = ids.some((id) => selectedIds.has(id));
  return (
    <Checkbox
      aria-label={label}
      disabled={ids.length === 0}
      checked={allSelected ? true : someSelected ? "indeterminate" : false}
      onCheckedChange={(checked) => onChange(ids, checked === true)}
    />
  );
}
