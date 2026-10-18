"use client";

import {
  brokerageJournalFilter,
  currentBrokerageQuery,
  type BrokerageJournalStatus,
} from "@tradstry/app-ui/components/brokerage/brokerage-query";
import { BrokerageTable } from "@tradstry/app-ui/components/brokerage/brokerage-table";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tradstry/app-ui/components/ui/select";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import {
  useBrokerageTransactions,
  useBrokerageTransactionsByIds,
  useLinkedBrokerageTransactionIds,
} from "@tradstry/app-ui/hooks/brokerage";
import type { AnalyticsRange } from "@tradstry/app-ui/lib/types/analytics";
import type { TransactionFilters } from "@tradstry/app-ui/lib/types/brokerage";
import { cn } from "@tradstry/app-ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useGraphQL,useTradstryPlatform } from "@tradstry/app-ui/platform";
import * as journalFlow from "@tradstry/app-ui/lib/service/journal-flow";
import { useEffect, useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 100;

type BrokerageTab = "pending" | "all" | "journalled";

function formatClosedDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function BrokerageTransactions() {
  const account = useActiveWorkspace();
  const workspaceId = account?.id ?? null;
  const fetcher=useGraphQL();const platform=useTradstryPlatform();
  const flow=useQuery({queryKey:["journal-flow",platform.user.email,workspaceId,"status"],queryFn:()=>journalFlow.status(fetcher,workspaceId!),enabled:!!workspaceId});
  const automatic=flow.data?.enabled??false;
  const [initialQuery] = useState(currentBrokerageQuery);

  const [tab, setTab] = useState<BrokerageTab>(initialQuery.tab);
  const [dateRange, setDateRange] = useState<AnalyticsRange>(
    initialQuery.range,
  );
  const [journalStatus, setJournalStatus] =
    useState<BrokerageJournalStatus>("all");

  // Server-side filters (sent to GraphQL)
  const [filters, setFilters] = useState<TransactionFilters>({
    offset: 0,
    limit: DEFAULT_PAGE_SIZE,
    sortBy: "symbol",
    symbol: initialQuery.symbol,
    range: initialQuery.episodeClosedDate ? undefined : initialQuery.range,
    startDate: initialQuery.startDate,
    endDate: initialQuery.endDate,
    episodeClosedDate: initialQuery.episodeClosedDate,
    isJournalled: brokerageJournalFilter(initialQuery.tab, journalStatus),
  });

  // Track page offsets so "previous" works after trimming
  const [pageOffsets, setPageOffsets] = useState<number[]>([0]);
  useEffect(()=>{
    if(!automatic)return;
    const search=window.location.search;
    if(new URLSearchParams(search).get("tab")==="pending"){
      platform.navigate(`/dashboard/journal${initialQuery.episodeClosedDate?`?date=${initialQuery.episodeClosedDate}`:""}`);return;
    }
    setTab("all");setFilters((previous)=>({...previous,isJournalled:undefined,offset:0}));setPageOffsets([0]);
  },[automatic]);

  function handleDateRangeChange(range: AnalyticsRange) {
    setDateRange(range);
    setPageOffsets([0]);
    setFilters((prev) => ({
      ...prev,
      range,
      startDate: undefined,
      endDate: undefined,
      episodeClosedDate: undefined,
      offset: 0,
    }));
  }

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Symbol search drives the server-side filter (filters.symbol).
  const [symbolSearch, setSymbolSearch] = useState(initialQuery.symbol ?? "");

  function handleTabChange(next: BrokerageTab) {
    if (next === tab) return;
    setTab(next);
    setSelectedIds(new Set());
    setPageOffsets([0]);
    const isJournalled = brokerageJournalFilter(next, journalStatus);
    setFilters((prev) => ({ ...prev, isJournalled, offset: 0 }));
  }

  function handleJournalStatusChange(next: BrokerageJournalStatus) {
    if (next === journalStatus) return;
    setJournalStatus(next);
    setSelectedIds(new Set());
    setPageOffsets([0]);
    setFilters((prev) => ({
      ...prev,
      isJournalled: brokerageJournalFilter(tab, next),
      offset: 0,
    }));
  }

  // Fetch transactions
  const { data, isLoading, error } = useBrokerageTransactions(
    workspaceId,
    filters,
  );

  // Debounce symbol search into the server-side filter (resets pagination).
  useEffect(() => {
    const handle = setTimeout(() => {
      const next = symbolSearch.trim().toUpperCase() || undefined;
      setPageOffsets([0]);
      setFilters((prev) =>
        prev.symbol === next ? prev : { ...prev, symbol: next, offset: 0 },
      );
    }, 300);
    return () => clearTimeout(handle);
  }, [symbolSearch]);

  const rawTransactions = data?.data ?? [];
  const total = data?.total ?? 0;

  // Trim trailing month+symbol group if it might be split across pages.
  // The backend sorts by month DESC, symbol ASC, so a split only happens at the end.
  const { displayTransactions, nextOffset } = useMemo(() => {
    const offset = filters.offset ?? 0;
    if (!rawTransactions.length) {
      return { displayTransactions: rawTransactions, nextOffset: offset };
    }
    const isLastPage = offset + rawTransactions.length >= total;
    if (isLastPage) {
      return {
        displayTransactions: rawTransactions,
        nextOffset: offset + rawTransactions.length,
      };
    }
    const groupKey = (tx: (typeof rawTransactions)[0]) =>
      `${tx.tradeDate?.slice(0, 7) ?? ""}:${tx.symbol ?? ""}`;
    const lastKey = groupKey(rawTransactions[rawTransactions.length - 1]);
    let trimIndex = rawTransactions.length;
    for (let i = rawTransactions.length - 1; i >= 0; i--) {
      if (groupKey(rawTransactions[i]) !== lastKey) {
        trimIndex = i + 1;
        break;
      }
      if (i === 0) {
        // Entire page is one month+symbol — don't trim
        return {
          displayTransactions: rawTransactions,
          nextOffset: offset + rawTransactions.length,
        };
      }
    }
    return {
      displayTransactions: rawTransactions.slice(0, trimIndex),
      nextOffset: offset + trimIndex,
    };
  }, [rawTransactions, filters.offset, total]);

  const transactions = displayTransactions;

  // Fetch linked transaction IDs
  const { data: linkedIds } = useLinkedBrokerageTransactionIds(workspaceId);
  const linkedSet = useMemo(() => new Set(linkedIds ?? []), [linkedIds]);

  const currentPage = pageOffsets.length - 1;
  const hasNextPage = nextOffset < total;
  const hasPrevPage = currentPage > 0;

  // A selection can span several server-side pages. The current page's
  // `transactions` only covers on-screen rows, so hydrate the full selected set
  // by id and union it with the page-local rows. The union keeps same-page
  // selections instant (no fetch wait) while still pulling in off-page picks —
  // without it, the merge silently drops any selected trade not on this page.
  const selectedIdList = useMemo(() => [...selectedIds].sort(), [selectedIds]);
  const { data: hydratedSelected } =
    useBrokerageTransactionsByIds(selectedIdList);

  const selectedTxs = useMemo(() => {
    const byId = new Map<string, (typeof transactions)[number]>();
    for (const t of transactions) {
      if (selectedIds.has(t.id)) byId.set(t.id, t);
    }
    for (const t of hydratedSelected ?? []) {
      if (selectedIds.has(t.id)) byId.set(t.id, t);
    }
    return [...byId.values()];
  }, [transactions, hydratedSelected, selectedIds]);
  const symbols = new Set(selectedTxs.map((t) => t.symbol).filter(Boolean));
  const sameSymbol = symbols.size === 1;
  const symbol = sameSymbol ? [...symbols][0] : null;

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 p-6 text-center">
          <p className="font-medium text-rose-700 dark:text-rose-300">
            Failed to load transactions
          </p>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
            {error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="shrink-0 px-4 pt-4">
        {automatic?<div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-medium">Broker records</h2><p className="mt-1 text-xs text-muted-foreground">Inspect original executions and manage your connection. Grouping and review live in Journal.</p></div><Button size="sm" variant="outline" onClick={()=>platform.navigate("/dashboard/journal")}>Open Journal</Button></div>:<div
          aria-label="Brokerage views"
          role="tablist"
          className="flex h-9 w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted p-1"
        >
          <TabButton
            active={tab === "pending"}
            onClick={() => handleTabChange("pending")}
          >
            Review
          </TabButton>
          <TabButton
            active={tab === "all"}
            onClick={() => handleTabChange("all")}
          >
            Trades
          </TabButton>
          <TabButton
            active={tab === "journalled"}
            onClick={() => handleTabChange("journalled")}
          >
            In journal
          </TabButton>
        </div>}
      </div>

      {tab === "pending" && !automatic ? (
        <div className="grid flex-1 place-content-center gap-3 p-8 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            Trade review now lives in your journal. Turn on the automatic journal to review your trades.
          </p>
          <Button variant="outline" onClick={() => platform.navigate("/dashboard/journal")}>
            Open Journal
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          <BrokerageTable
            transactions={transactions}
            symbolSearch={symbolSearch}
            onSymbolSearchChange={setSymbolSearch}
            total={total}
            offset={filters.offset ?? 0}
            page={currentPage}
            pageSize={filters.limit ?? DEFAULT_PAGE_SIZE}
            hasNextPage={hasNextPage}
            hasPrevPage={hasPrevPage}
            onNextPage={() => {
              setPageOffsets((prev) => [...prev, nextOffset]);
              setFilters((prev) => ({ ...prev, offset: nextOffset }));
            }}
            onPrevPage={() => {
              setPageOffsets((prev) => {
                const next = prev.slice(0, -1);
                setFilters((f) => ({ ...f, offset: next[next.length - 1] }));
                return next;
              });
            }}
            onPageSizeChange={(size) => {
              setPageOffsets([0]);
              setFilters({ ...filters, limit: size, offset: 0 });
            }}
            isLoading={isLoading}
            linkedTransactionIds={linkedSet}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            scopeControl={
              <>
                {filters.episodeClosedDate ? (
                  <span className="inline-flex h-8 items-center rounded-lg border bg-background px-2.5 text-[0.6875rem] font-medium text-foreground">
                    Closed {formatClosedDate(filters.episodeClosedDate)}
                  </span>
                ) : null}
                {tab === "all" && !automatic ? (
                  <Select
                    value={journalStatus}
                    onValueChange={(value) =>
                      handleJournalStatusChange(value as BrokerageJournalStatus)
                    }
                  >
                    <SelectTrigger
                      aria-label="Journal status"
                      className="h-8 w-auto min-w-36 bg-background text-xs shadow-none"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Journal status: All</SelectItem>
                      <SelectItem value="unjournalled">
                        Needs journal
                      </SelectItem>
                      <SelectItem value="journalled">In journal</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
              </>
            }
          />
          {selectedIds.size>0 && <div className="mt-3 flex items-center justify-between rounded-lg border p-3 text-sm"><span>Change trade grouping in your journal.</span><Button size="sm" onClick={()=>platform.navigate(`/dashboard/journal/trades${symbol?`?symbol=${encodeURIComponent(symbol)}`:""}`)}>{symbol?`Find ${symbol} in Journal`:"Open Journal"}</Button></div>}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "h-7 shrink-0 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30",
        active
          ? "bg-background text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
