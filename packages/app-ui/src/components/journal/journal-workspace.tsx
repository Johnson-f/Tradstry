"use client";

import * as React from "react";
import { Alert02Icon, CheckmarkCircle02Icon, Clock01Icon, Layers01Icon, ListViewIcon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { Progress } from "@tradstry/app-ui/components/ui/progress";
import { ScrollArea } from "@tradstry/app-ui/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@tradstry/app-ui/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectLabel, SelectGroup, SelectTrigger, SelectValue } from "@tradstry/app-ui/components/ui/select";
import { cn } from "@tradstry/app-ui/lib/utils";
import { CreateTrades } from "./create-trades";
import { TradeDetail } from "./journal-trade-detail";
import { GroupingDialog } from "./journal-grouping";
import * as flow from "@tradstry/app-ui/lib/service/journal-flow";
import { money, tradeDate } from "./journal-format";
import { JournalSetup } from "./journal-setup";

const TRADE_STATUSES = [
  { value: "all", label: "All trades", description: "Open, closed, and needs attention", icon: Layers01Icon },
  { value: "open", label: "Open", description: "Positions that are still open", icon: Clock01Icon },
  { value: "closed", label: "Closed", description: "Positions that have been fully exited", icon: CheckmarkCircle02Icon },
  { value: "incomplete", label: "Needs attention", description: "History or grouping needs a check", icon: Alert02Icon },
] as const;

const REVIEW_STATUSES = [
  { value: "all", label: "Any review status", description: "Show every review state", icon: ListViewIcon },
  { value: "unreviewed", label: "Not reviewed", description: "No completed review yet", icon: Clock01Icon },
  { value: "reviewed", label: "Reviewed", description: "Reviewed against the current results", icon: CheckmarkCircle02Icon },
  { value: "outdated", label: "Results changed", description: "Results or context changed after review", icon: RefreshIcon },
] as const;

function StatusFilter({ label, value, onChange, options, className }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string; description: string; icon: IconSvgElement }[];
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={cn("h-9 gap-2.5 rounded-lg bg-background px-3 text-sm shadow-none hover:bg-muted/40", value !== "all" && "border-foreground/25 bg-muted/50", className)}
      >
        {selected && <HugeiconsIcon icon={selected.icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
        <span className="min-w-0 flex-1 text-left"><SelectValue>{selected?.label}</SelectValue></span>
      </SelectTrigger>
      <SelectContent position="popper" align="start" sideOffset={6} className="w-64 max-w-[calc(100vw-2rem)] rounded-xl p-1">
        <SelectGroup>
          <SelectLabel className="px-2 pb-1.5 text-[11px] text-muted-foreground">{label}</SelectLabel>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} className="rounded-lg py-2.5 pr-8">
              <span className="flex items-start gap-2.5">
                <HugeiconsIcon icon={option.icon} aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{option.description}</span>
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function JournalWorkspace({ workspaceId }: { workspaceId: string }) {
  const fetcher = useGraphQL();
  const platform = useTradstryPlatform();
  const cache = useQueryClient();
  const owner = platform.user.email;
  const base = ["journal-flow", owner, workspaceId];
  const status = useQuery({ queryKey: [...base, "status"], queryFn: () => flow.status(fetcher, workspaceId), refetchInterval: 8_000 });
  const trades = useQuery({ queryKey: [...base, "trades"], queryFn: () => flow.trades(fetcher, workspaceId), refetchInterval: 15_000 });
  const route=platform.pathname.split("?")[0]??platform.pathname;
  const [params]=React.useState(()=>new URLSearchParams(platform.kind==="desktop"?platform.pathname.split("?")[1]??"":typeof window==="undefined"?"":window.location.search));
  const [search, setSearch] = React.useState(params.get("symbol")??"");
  const [lifecycle, setLifecycle] = React.useState(params.get("status")??"all");
  const [reviewState, setReviewState] = React.useState("all");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [grouping, setGrouping] = React.useState(false);
  const entryId = route.split("/dashboard/journal/")[1]?.split("/")[0];
  const view = entryId === "review" ? "review" : "trades";
  const entries = trades.data ?? [];
  const filtered = entries.filter((trade) => (!search || `${trade.symbol} ${trade.symbolName}`.toLowerCase().includes(search.toLowerCase())) && (lifecycle === "all" || trade.lifecycleState === lifecycle) && (reviewState === "all" || trade.reviewState === reviewState));
  const reload = async () => { await cache.invalidateQueries({ queryKey: base }); };
  if (entryId && entryId!=="review") return <TradeDetail key={`${workspaceId}:${entryId}`} workspaceId={workspaceId} entryId={decodeURIComponent(entryId)} onBack={() => platform.navigate("/dashboard/journal")} onChanged={reload} />;
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-3 md:p-5">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(value) => { platform.navigate(value==="review"?"/dashboard/journal/review":"/dashboard/journal"); }}>
          <TabsList><TabsTrigger value="trades">Trades</TabsTrigger><TabsTrigger value="review">Review</TabsTrigger></TabsList>
        </Tabs>
        {view === "trades" && <div className="ml-auto flex items-center gap-4">
        <div className="hidden text-xs text-muted-foreground md:block" aria-live="polite">
          {status.isError ? "Sync status unavailable" : status.data?.importState === "offline" ? "Offline · showing saved trades" : status.data?.importState === "failed" ? "Sync needs attention" : status.data && status.data.sourceRevision > status.data.projectionRevision ? (
            <>
              <span className="sr-only">Updating your journal…</span>
              <Progress value={null} aria-label="Updating your journal" className="h-1.5 w-36" />
            </>
          ) : status.data?.enabled ? "Trades sync automatically" : "Automatic journal is not enabled yet"}
        </div>
        <CreateTrades trigger={<Button variant="outline" size="sm">Add a manual trade</Button>} />
        </div>}
      </div>
      {view === "trades" && status.data && !status.data.enabled && <JournalSetup workspaceId={workspaceId} onDone={reload}/>}
      {view === "trades" ? <>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Search trades" placeholder="Search symbol or company…" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 max-w-xs" />
          <StatusFilter label="Trade status" value={lifecycle} onChange={setLifecycle} options={TRADE_STATUSES} className="min-w-44" />
          <StatusFilter label="Review status" value={reviewState} onChange={setReviewState} options={REVIEW_STATUSES} className="min-w-48" />
          {(lifecycle !== "all" || reviewState !== "all") && (
            <Button type="button" variant="ghost" size="sm" className="h-9 px-3 text-muted-foreground" aria-label="Reset both status filters" title="Reset both status filters" onClick={() => { setLifecycle("all"); setReviewState("all"); }}>Reset</Button>
          )}
          {selected.length > 1 && <Button size="sm" variant="outline" disabled={!status.data?.enabled} onClick={() => setGrouping(true)}>Merge {selected.length} trades</Button>}
          <span role="status" className="ml-auto text-xs text-muted-foreground">{filtered.length} trades</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
          {trades.isLoading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading your trades…</p> : trades.isError ? <div className="p-8 text-center"><p>We couldn’t load your journal.</p><Button className="mt-3" variant="outline" onClick={() => void trades.refetch()}>Retry</Button></div> : filtered.length === 0 ? <div className="grid min-h-64 flex-1 place-content-center gap-3 p-8 text-center"><h2 className="font-medium">{entries.length ? "No trades match these filters" : "Your trading story starts here"}</h2><p className="max-w-sm text-sm text-muted-foreground">{entries.length ? "Try another symbol or clear the status filters." : "Connect your brokerage to bring in your executions, or add a trade yourself."}</p>{!entries.length && <Button variant="outline" onClick={() => platform.navigate("/dashboard/brokerage")}>Go to brokerage</Button>}</div> : <ScrollArea className="min-h-0 flex-1" orientation="both">
            <table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 z-10 bg-muted/90 text-xs text-muted-foreground"><tr><th className="w-10 px-3 py-3"><span className="sr-only">Select</span></th><th className="px-3 py-3 text-left font-medium">Trade</th><th className="px-3 py-3 text-left font-medium">Date</th><th className="px-3 py-3 text-left font-medium">Status</th><th className="px-3 py-3 text-right font-medium">Open quantity</th><th className="px-3 py-3 text-right font-medium">Realized net</th><th className="px-3 py-3 text-left font-medium">Review</th></tr></thead><tbody>
              {filtered.map((trade) => <tr key={trade.id} className="border-t transition-colors hover:bg-accent/50" onClick={() => platform.navigate(`/dashboard/journal/${encodeURIComponent(trade.id)}`)}>
                <td className="px-3 py-4" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Select ${trade.symbol} trade`} checked={selected.includes(trade.id)} disabled={!trade.episodeId || trade.lifecycleState === "incomplete"} onChange={(event) => setSelected(event.target.checked ? [...selected, trade.id] : selected.filter((id) => id !== trade.id))} /></td>
                <td className="px-3 py-4"><button className="text-left font-medium hover:underline focus-visible:outline-ring" onClick={(event) => { event.stopPropagation(); platform.navigate(`/dashboard/journal/${encodeURIComponent(trade.id)}`); }}>{trade.symbol}</button><p className="mt-0.5 max-w-60 truncate text-xs text-muted-foreground">{trade.symbolName} · {trade.direction}</p></td>
                <td className="px-3 py-4 text-muted-foreground">{tradeDate(trade.closeDate ?? trade.openDate, status.data?.timezone)}</td>
                <td className="px-3 py-4"><span className={`rounded-md px-2 py-1 text-xs ${trade.lifecycleState === "incomplete" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>{trade.lifecycleState === "incomplete" ? "Needs attention" : trade.lifecycleState === "open" ? "Open" : "Closed"}</span></td>
                <td className="px-3 py-4 text-right tabular-nums">{trade.remainingQuantity ?? "—"}</td><td className={`px-3 py-4 text-right font-medium tabular-nums ${Number(trade.realizedNet) < 0 ? "text-rose-600" : Number(trade.realizedNet) > 0 ? "text-emerald-600" : ""}`}>{money(trade.realizedNet, trade.currency)}</td>
                <td className="px-3 py-4 text-xs text-muted-foreground">{trade.reviewState === "reviewed" ? "Reviewed" : trade.reviewState === "outdated" ? "Results changed" : trade.lifecycleState === "open" ? "When it closes" : "Not reviewed"}</td>
              </tr>)}
            </tbody></table>
          </ScrollArea>}
        </div>
      </> : null}
      <GroupingDialog open={grouping} onOpenChange={setGrouping} workspaceId={workspaceId} entries={entries.filter((trade) => selected.includes(trade.id))} mode="merge" onDone={async () => { setSelected([]); await reload(); }} />
    </section>
  );
}
