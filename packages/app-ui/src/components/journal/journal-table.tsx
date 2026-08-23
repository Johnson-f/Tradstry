"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  MoreHorizontalCircle01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentProps, useDeferredValue, useState } from "react";
import { CreateTrades } from "@tradstry/app-ui/components/journal/create-trades";
import { DeleteTrades } from "@tradstry/app-ui/components/journal/delete-trades";
import { EditTrades } from "@tradstry/app-ui/components/journal/edit-trades";
import { TagManager } from "@tradstry/app-ui/components/journal/tag-manager";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@tradstry/app-ui/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@tradstry/app-ui/components/ui/empty";
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
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import { useJournalEntriesForWorkspace } from "@tradstry/app-ui/hooks/journal";
import type {
  JournalEntry,
  JournalStatus,
  TradeType,
} from "@tradstry/app-ui/lib/types/journal";
import { cn, formatPnl } from "@tradstry/app-ui/lib/utils";

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "2-digit",
});

const rowSearchFilter: FilterFn<JournalEntry> = (
  row,
  _columnId,
  filterValue,
) => {
  const search = String(filterValue ?? "")
    .trim()
    .toLowerCase();
  if (!search) return true;

  const haystack = [
    row.original.symbol,
    row.original.symbolName,
    row.original.tradeType,
    row.original.status,
    row.original.mistakes ?? "",
    row.original.entryTactics ?? "",
    row.original.edgesSpotted ?? "",
    row.original.notes ?? "",
    ...row.original.tags.map((t) => t.name),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return dateFormatter.format(parsed);
}

function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${percentFormatter.format(value)}%`;
}

function formatCurrency(value: number) {
  return formatPnl(value, { precision: "cents" });
}

function formatDuration(seconds: number) {
  if (seconds <= 0) return "0m";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function statusClasses(status: JournalStatus) {
  return status === "profit"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
    : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300";
}

function tradeTypeClasses(type: TradeType) {
  return type === "long"
    ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300"
    : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300";
}

function valueClasses(value: number | null) {
  if (value === null) return "text-muted-foreground";
  return value >= 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
}

function SortableHeader({
  label,
  canSort,
  sortDirection,
  onClick,
}: {
  label: string;
  canSort: boolean;
  sortDirection: false | "asc" | "desc";
  onClick?: ComponentProps<"button">["onClick"];
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 text-left font-medium",
        canSort
          ? "cursor-pointer text-foreground"
          : "cursor-default text-muted-foreground",
      )}
    >
      <span>{label}</span>
      {sortDirection === "asc" ? <span>↑</span> : null}
      {sortDirection === "desc" ? <span>↓</span> : null}
    </button>
  );
}

function SummaryMetric({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="bg-card px-4 py-3.5">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
    </div>
  );
}

const columns: ColumnDef<JournalEntry>[] = [
  {
    accessorKey: "openDate",
    header: ({ column }) => (
      <SortableHeader
        label="Open Date"
        canSort={column.getCanSort()}
        sortDirection={column.getIsSorted()}
        onClick={column.getToggleSortingHandler()}
      />
    ),
    cell: ({ row }) => (
      <div className="space-y-1 whitespace-nowrap">
        <p className="font-medium text-foreground">
          {formatDate(row.original.openDate)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDate(row.original.closeDate)}
        </p>
      </div>
    ),
  },
  {
    accessorKey: "symbol",
    header: ({ column }) => (
      <SortableHeader
        label="Symbol"
        canSort={column.getCanSort()}
        sortDirection={column.getIsSorted()}
        onClick={column.getToggleSortingHandler()}
      />
    ),
    cell: ({ row }) => {
      const isOption = (row.original.contractMultiplier ?? 1) !== 1;
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold tracking-[0.12em] text-foreground uppercase">
              {row.original.symbol}
            </p>
            {isOption ? (
              <span className="inline-flex rounded-md bg-indigo-100 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                Option
              </span>
            ) : null}
          </div>
          <p className="max-w-[14rem] truncate text-xs text-muted-foreground">
            {row.original.symbolName}
          </p>
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    filterFn: "equalsString",
    header: ({ column }) => (
      <SortableHeader
        label="Status"
        canSort={column.getCanSort()}
        sortDirection={column.getIsSorted()}
        onClick={column.getToggleSortingHandler()}
      />
    ),
    cell: ({ row }) => (
      <span
        className={cn(
          "inline-flex rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em]",
          statusClasses(row.original.status),
        )}
      >
        {row.original.status}
      </span>
    ),
  },
  {
    accessorKey: "netRoi",
    header: ({ column }) => (
      <SortableHeader
        label="Net ROI"
        canSort={column.getCanSort()}
        sortDirection={column.getIsSorted()}
        onClick={column.getToggleSortingHandler()}
      />
    ),
    cell: ({ row }) => (
      <span className={cn("font-semibold", valueClasses(row.original.netRoi))}>
        {formatPercent(row.original.netRoi)}
      </span>
    ),
  },
  {
    accessorKey: "totalPl",
    header: ({ column }) => (
      <SortableHeader
        label="Net P/L"
        canSort={column.getCanSort()}
        sortDirection={column.getIsSorted()}
        onClick={column.getToggleSortingHandler()}
      />
    ),
    cell: ({ row }) => (
      <span className={cn("font-semibold", valueClasses(row.original.totalPl))}>
        {formatCurrency(row.original.totalPl)}
      </span>
    ),
  },
  {
    accessorKey: "duration",
    header: ({ column }) => (
      <SortableHeader
        label="Duration"
        canSort={column.getCanSort()}
        sortDirection={column.getIsSorted()}
        onClick={column.getToggleSortingHandler()}
      />
    ),
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatDuration(row.original.duration)}
      </span>
    ),
  },
  {
    accessorKey: "riskReward",
    header: ({ column }) => (
      <SortableHeader
        label="R:R"
        canSort={column.getCanSort()}
        sortDirection={column.getIsSorted()}
        onClick={column.getToggleSortingHandler()}
      />
    ),
    cell: ({ row }) => (
      <span
        className={cn("font-medium", valueClasses(row.original.riskReward))}
      >
        {row.original.riskReward === null
          ? "—"
          : `${row.original.riskReward.toFixed(2)}R`}
      </span>
    ),
  },
  {
    accessorKey: "tradeType",
    filterFn: "equalsString",
    header: ({ column }) => (
      <SortableHeader
        label="Type"
        canSort={column.getCanSort()}
        sortDirection={column.getIsSorted()}
        onClick={column.getToggleSortingHandler()}
      />
    ),
    cell: ({ row }) => (
      <span
        className={cn(
          "inline-flex rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em]",
          tradeTypeClasses(row.original.tradeType),
        )}
      >
        {row.original.tradeType}
      </span>
    ),
  },
  {
    id: "tags",
    header: "Tags",
    cell: ({ row }) => {
      const { tags, mistakes, entryTactics, edgesSpotted } = row.original;
      const legacyLines = [
        mistakes && `Mistakes: ${mistakes}`,
        entryTactics && `Tactics: ${entryTactics}`,
        edgesSpotted && `Edges: ${edgesSpotted}`,
      ].filter(Boolean) as string[];

      return (
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            {tags.length > 0 ? (
              <ul className="flex flex-wrap gap-1" aria-label="Trade tags">
                {tags.map((tag) => (
                  <li key={tag.id}>
                    <Badge
                      variant="outline"
                      className="border-transparent text-white"
                      style={{
                        backgroundColor: tag.color ?? "#94a3b8",
                      }}
                    >
                      {tag.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
            {legacyLines.length > 0 ? (
              <div className="space-y-0.5">
                {legacyLines.map((line) => (
                  <p
                    key={line}
                    className="max-w-[16rem] truncate text-xs text-muted-foreground italic"
                  >
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
            {tags.length === 0 && legacyLines.length === 0 ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
            <EditTrades trade={row.original} />
            <DeleteTrades trade={row.original} />
          </div>
        </div>
      );
    },
  },
];

function JournalTableLoading() {
  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <div className="grid gap-px bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
        {["summary-a", "summary-b", "summary-c", "summary-d"].map((key) => (
          <div key={key} className="space-y-3 bg-card p-4">
            <Skeleton className="h-2.5 w-20 rounded" />
            <Skeleton className="h-6 w-24 rounded-md" />
            <Skeleton className="h-2.5 w-36 rounded" />
          </div>
        ))}
      </div>
      <div className="flex h-14 items-center gap-3 border-t p-3">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
        <Skeleton className="ml-auto h-8 w-24 rounded-lg" />
      </div>
      <div className="space-y-3 border-t p-4">
        {["row-a", "row-b", "row-c", "row-d", "row-e"].map((key) => (
          <Skeleton key={key} className="h-12 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function JournalTable() {
  const activeWorkspace = useActiveWorkspace();
  const {
    data,
    isLoading,
    isPending,
    error,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useJournalEntriesForWorkspace(activeWorkspace?.id ?? null);
  const entries = data ?? [];
  const [sorting, setSorting] = useState<SortingState>([
    { id: "openDate", desc: true },
  ]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const table = useReactTable({
    data: entries,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter: deferredSearch,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: rowSearchFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 20,
      },
    },
  });

  const statusFilter =
    (table.getColumn("status")?.getFilterValue() as string | undefined) ??
    "all";
  const tradeTypeFilter =
    (table.getColumn("tradeType")?.getFilterValue() as string | undefined) ??
    "all";
  const filteredRows = table
    .getFilteredRowModel()
    .rows.map((row) => row.original);
  // Winner = realized P/L > 0, loser = < 0. Breakeven (== 0) is a scratch trade
  // and is excluded from the win rate on both sides: wins / (wins + losses).
  const profitTrades = filteredRows.filter((entry) => entry.totalPl > 0).length;
  const lossTrades = filteredRows.filter((entry) => entry.totalPl < 0).length;
  const decisiveTrades = profitTrades + lossTrades;
  const cumulativeProfit = filteredRows.reduce(
    (sum, entry) =>
      sum +
      ((entry.positionSize * entry.entryPrice * entry.totalPl) / 100) *
        (entry.contractMultiplier ?? 1),
    0,
  );
  const riskRewards = filteredRows
    .map((entry) => entry.riskReward)
    .filter((value): value is number => value !== null);
  const averageRiskReward =
    riskRewards.length === 0
      ? 0
      : riskRewards.reduce((sum, value) => sum + value, 0) / riskRewards.length;
  const lastUpdated =
    dataUpdatedAt > 0
      ? new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        }).format(new Date(dataUpdatedAt))
      : "Waiting for data";
  const hasActiveFilters =
    search.trim().length > 0 ||
    statusFilter !== "all" ||
    tradeTypeFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    table.resetColumnFilters();
    table.resetSorting();
  };

  if (isLoading || isPending) {
    return <JournalTableLoading />;
  }

  if (error instanceof Error) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <p className="text-sm font-semibold uppercase tracking-[0.22em]">
          Journal Error
        </p>
        <p className="mt-2 text-sm">{error.message}</p>
      </section>
    );
  }

  return (
    <div className="space-y-3">
      <section className="grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric
          label="Net P&L"
          value={formatCurrency(cumulativeProfit)}
          sublabel={
            activeWorkspace
              ? `Combined dollar P/L for ${activeWorkspace.name}`
              : "Select a workspace to view cumulative profit"
          }
        />
        <SummaryMetric
          label="Win Rate"
          value={
            decisiveTrades === 0
              ? "0.00%"
              : formatPercent((profitTrades / decisiveTrades) * 100)
          }
          sublabel={`${profitTrades} winning trades out of ${decisiveTrades}`}
        />
        <SummaryMetric
          label="Average R:R"
          value={`${averageRiskReward.toFixed(2)}R`}
          sublabel="Realized reward-to-risk across trades"
        />
        <SummaryMetric
          label="Total Trades"
          value={String(filteredRows.length)}
          sublabel={`${table.getRowModel().rows.length} visible on this page`}
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-border/70 bg-background">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3 md:px-4">
          <div>
            <h2 className="text-sm font-semibold">Trade ledger</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Review, filter, and update trades in{" "}
              {activeWorkspace?.name ?? "this workspace"}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TagManager />
            <CreateTrades />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-border/60 px-3 py-3 md:flex-row md:items-center md:px-4">
          <div className="flex flex-1 flex-col gap-3 md:flex-row md:items-center">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search symbol, notes, or mistakes"
              className="h-10 rounded-xl border-border bg-muted/50 text-sm md:max-w-xs"
            />
            <Select
              value={statusFilter}
              onValueChange={(value) =>
                table
                  .getColumn("status")
                  ?.setFilterValue(value === "all" ? undefined : value)
              }
            >
              <SelectTrigger className="h-10 w-full rounded-xl border-border bg-muted/50 md:w-[9rem]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="profit">Profit</SelectItem>
                <SelectItem value="loss">Loss</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={tradeTypeFilter}
              onValueChange={(value) =>
                table
                  .getColumn("tradeType")
                  ?.setFilterValue(value === "all" ? undefined : value)
              }
            >
              <SelectTrigger className="h-10 w-full rounded-xl border-border bg-muted/50 md:w-[9rem]">
                <SelectValue placeholder="Trade type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="long">Long</SelectItem>
                <SelectItem value="short">Short</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2 md:justify-end">
            <div className="text-[0.625rem] font-medium text-muted-foreground">
              {isFetching ? "Syncing..." : `Updated ${lastUpdated}`}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Journal options"
                >
                  <HugeiconsIcon
                    icon={MoreHorizontalCircle01Icon}
                    strokeWidth={2}
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void refetch()}>
                  Refresh trades
                </DropdownMenuItem>
                <DropdownMenuItem onClick={clearFilters}>
                  Reset filters
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {table.getRowModel().rows.length === 0 ? (
          <Empty className="min-h-[22rem] rounded-none border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="size-10 rounded-xl">
                <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>
                {hasActiveFilters ? "No matching trades" : "No trades yet"}
              </EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? "Try clearing the current search and filters."
                  : `Add the first journal entry for ${activeWorkspace?.name ?? "this workspace"}.`}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <CreateTrades
                  trigger={
                    <Button size="sm">
                      <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                      Add your first trade
                    </Button>
                  }
                />
              )}
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <div className="divide-y divide-border/60 md:hidden">
              {table.getRowModel().rows.map((row) => {
                const trade = row.original;
                return (
                  <article key={row.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold uppercase tracking-[0.08em]">
                            {trade.symbol}
                          </span>
                          <Badge variant="outline" className="text-[0.6rem]">
                            {trade.tradeType}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(trade.openDate)} ·{" "}
                          {formatDuration(trade.duration)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "font-mono text-sm font-semibold",
                          valueClasses(trade.totalPl),
                        )}
                      >
                        {formatCurrency(trade.totalPl)}
                      </span>
                    </div>
                    <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/45 p-2.5 text-xs">
                      <div>
                        <dt className="text-muted-foreground">ROI</dt>
                        <dd
                          className={cn(
                            "mt-0.5 font-medium",
                            valueClasses(trade.netRoi),
                          )}
                        >
                          {formatPercent(trade.netRoi)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">R:R</dt>
                        <dd className="mt-0.5 font-medium">
                          {trade.riskReward === null
                            ? "—"
                            : `${trade.riskReward.toFixed(2)}R`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="mt-0.5 font-medium capitalize">
                          {trade.status}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex justify-end gap-1">
                      <EditTrades trade={trade} />
                      <DeleteTrades trade={trade} />
                    </div>
                  </article>
                );
              })}
            </div>

            <ScrollArea
              orientation="horizontal"
              className="hidden w-full md:block"
            >
              <table className="w-full min-w-[64rem] text-sm">
                <thead className="sticky top-0 z-10 bg-background">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b">
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-4 py-3 text-left text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="group/row border-b transition-colors hover:bg-muted/30 last:border-b-0"
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3 align-top">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </>
        )}

        {filteredRows.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span>Rows per page</span>
                <Select
                  value={String(table.getState().pagination.pageSize)}
                  onValueChange={(value) => table.setPageSize(Number(value))}
                >
                  <SelectTrigger className="h-9 w-[5.5rem] rounded-xl border-border bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="8">8</SelectItem>
                    <SelectItem value="12">12</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p>
                Showing{" "}
                <span className="font-medium text-foreground">
                  {table.getRowModel().rows.length}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">
                  {filteredRows.length}
                </span>{" "}
                filtered trades
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <div className="rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount() || 1}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
