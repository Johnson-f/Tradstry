"use client";

import {
  Alert02Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  buildReviewQueueModel,
  type ReviewQueueItem,
} from "@tradstry/app-ui/components/dashboard/review-queue/model";
import { DashboardCardError } from "@tradstry/app-ui/components/dashboard/shared/card-error";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import { usePendingTrades } from "@tradstry/app-ui/hooks/brokerage";
import { cn, formatPnl } from "@tradstry/app-ui/lib/utils";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";
import { useGraphQL } from "@tradstry/app-ui/platform";
import { useQuery } from "@tanstack/react-query";
import * as journalFlow from "@tradstry/app-ui/lib/service/journal-flow";

function QueueCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "warning" | "primary" | "neutral";
}) {
  return (
    <div className="rounded-xl border bg-background/70 px-3 py-2.5">
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "primary" && "text-foreground",
          tone === "neutral" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[0.625rem] text-muted-foreground">{label}</p>
    </div>
  );
}

const ITEM_PRESENTATION = {
  grouping: {
    label: "Needs grouping",
    icon: Alert02Icon,
    className: "text-amber-600 dark:text-amber-400",
  },
  ready: {
    label: "Ready to review",
    icon: Task01Icon,
    className: "text-foreground",
  },
  open: {
    label: "Still open",
    icon: Clock01Icon,
    className: "text-muted-foreground",
  },
} as const;

function QueueItem({ item }: { item: ReviewQueueItem }) {
  const presentation = ITEM_PRESENTATION[item.kind];
  const { trade } = item;

  return (
    <li className="flex items-center gap-3 border-t py-2.5 first:border-t-0">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/50",
          presentation.className,
        )}
      >
        <HugeiconsIcon
          icon={presentation.icon}
          className="size-4"
          strokeWidth={2}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-xs font-semibold">
            {trade.symbolName ?? trade.symbol}
          </span>
          <span className="text-[0.6rem] text-muted-foreground">
            {trade.direction}
          </span>
        </div>
        <p className={cn("mt-0.5 text-[0.625rem]", presentation.className)}>
          {presentation.label}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 font-mono text-xs font-semibold tabular-nums",
          trade.realizedPnl === null
            ? "text-muted-foreground"
            : trade.realizedPnl < 0
              ? "text-rose-600"
              : "text-emerald-600",
        )}
      >
        {trade.realizedPnl === null
          ? "—"
          : formatPnl(trade.realizedPnl, { precision: "cents" })}
      </span>
    </li>
  );
}

export function DashboardReviewQueueCard() {
  const workspace = useActiveWorkspace();
  const fetcher = useGraphQL();
  const platform = useTradstryPlatform();
  const status = useQuery({queryKey:["journal-flow",platform.user.email,workspace?.id,"status"],queryFn:()=>journalFlow.status(fetcher,workspace!.id),enabled:!!workspace});
  if (!workspace) return null;
  if (status.isLoading) return <Skeleton className="h-64 rounded-xl"/>;
  if (status.isError) return <DashboardCardError title="Review queue" error={status.error} onRetry={status.refetch}/>;
  return status.data?.enabled ? <AutomaticReviewQueue workspaceId={workspace.id}/> : <LegacyReviewQueue/>;
}

function AutomaticReviewQueue({workspaceId}:{workspaceId:string}) {
  const fetcher=useGraphQL();
  const platform=useTradstryPlatform();
  const trades=useQuery({queryKey:["journal-flow",platform.user.email,workspaceId,"trades"],queryFn:()=>journalFlow.trades(fetcher,workspaceId)});
  if(trades.isLoading)return <Skeleton className="h-64 rounded-xl"/>;
  if(trades.isError)return <DashboardCardError title="Review queue" error={trades.error} onRetry={trades.refetch}/>;
  const all=trades.data??[];
  const attention=all.filter((trade)=>trade.lifecycleState==="incomplete");
  const review=all.filter((trade)=>trade.lifecycleState==="closed" && trade.reviewState!=="reviewed");
  const open=all.filter((trade)=>trade.lifecycleState==="open");
  const items=[...attention,...review].slice(0,3);
  return <section className="flex h-full flex-col rounded-xl border border-border/70 bg-card/55 p-4"><h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Review queue</h2><p className="mt-1 text-xs text-muted-foreground">Recorded automatically · reviewed by you</p><div className="mt-4 grid grid-cols-3 gap-2"><QueueCount label="Needs attention" value={attention.length} tone="warning"/><QueueCount label="To review" value={review.length} tone="primary"/><QueueCount label="Open trades" value={open.length} tone="neutral"/></div><div className="my-4 flex-1">{items.map((trade)=><button type="button" key={trade.id} onClick={()=>platform.navigate(`/dashboard/journal/${encodeURIComponent(trade.id)}`)} className="flex w-full items-center justify-between border-b px-2 py-3 text-left text-sm hover:bg-accent/40"><span>{trade.symbol} · {trade.direction}</span><span className="text-xs text-muted-foreground">{trade.lifecycleState==="incomplete"?"Resolve history":trade.reviewState==="outdated"?"Results changed":"Add your takeaway"}</span></button>)}{!items.length && <p className="py-6 text-center text-sm text-muted-foreground">{all.length?"You’re caught up. Open trades update as fills arrive.":"Your trades will appear here after brokerage sync."}</p>}</div><Button variant="outline" onClick={()=>platform.navigate(attention.length?"/dashboard/journal?status=incomplete":review.length?"/dashboard/journal/review":"/dashboard/journal")}>{attention.length?"Resolve trade history":review.length?"Review latest trading day":"Open journal"}</Button></section>;
}

function LegacyReviewQueue() {
  const workspace = useActiveWorkspace();
  const { navigate } = useTradstryPlatform();
  const { data, isLoading, error, refetch } = usePendingTrades(
    workspace?.id ?? null,
  );

  if (!workspace) return null;

  if (isLoading) {
    return (
      <section className="rounded-xl border border-border/70 bg-card/55 p-4">
        <Skeleton className="h-4 w-28" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {["a", "b", "c"].map((key) => (
            <Skeleton key={key} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-4 h-28 rounded-xl" />
      </section>
    );
  }

  if (error) {
    return (
      <DashboardCardError
        title="Review Queue"
        error={error}
        onRetry={refetch}
        className="min-h-[24rem]"
      />
    );
  }

  const model = buildReviewQueueModel(data ?? []);
  const caughtUp = model.actionLabel === "All caught up";

  return (
    <section className="flex h-full flex-col rounded-xl border border-border/70 bg-card/55 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Review Queue
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Current brokerage work · not date-filtered
          </p>
        </div>
        {caughtUp ? (
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            className="size-5 text-emerald-600"
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <QueueCount
          label="Needs grouping"
          value={model.groupingCount}
          tone="warning"
        />
        <QueueCount
          label="Ready to review"
          value={model.readyCount}
          tone="primary"
        />
        <QueueCount label="Still open" value={model.openCount} tone="neutral" />
      </div>

      {model.items.length > 0 ? (
        <ul className="mt-3">
          {model.items.map((item) => (
            <QueueItem key={item.trade.id} item={item} />
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-xl bg-emerald-500/[0.06] px-3 py-4 text-center">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Everything is reviewed
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            New broker trades will appear here after sync.
          </p>
        </div>
      )}

      <Button
        type="button"
        className="mt-auto w-full"
        variant={model.groupingCount > 0 ? "default" : "outline"}
        disabled={caughtUp}
        onClick={() => navigate("/dashboard/brokerage")}
      >
        {model.actionLabel}
        {!caughtUp ? (
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="size-3.5"
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
      </Button>
    </section>
  );
}
