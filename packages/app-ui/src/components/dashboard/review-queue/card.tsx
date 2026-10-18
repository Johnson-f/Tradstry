"use client";

import { DashboardCardError } from "@tradstry/app-ui/components/dashboard/shared/card-error";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import {
  useJournalTrades,
  useReviewSession,
} from "@tradstry/app-ui/hooks/journal-review";
import { dayLabel } from "@tradstry/app-ui/components/journal/journal-format";
import { dayBadge, itemsToReview } from "@tradstry/app-ui/components/journal/journal-today-model";
import { useJournalAttention } from "@tradstry/app-ui/components/journal/use-journal-attention";
import { cn } from "@tradstry/app-ui/lib/utils";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import { useQuery } from "@tanstack/react-query";
import * as journalFlow from "@tradstry/app-ui/lib/service/journal-flow";

export function DashboardReviewQueueCard() {
  const workspace = useActiveWorkspace();
  const fetcher = useGraphQL();
  const platform = useTradstryPlatform();
  const status = useQuery({
    queryKey: ["journal-flow", platform.user.email, workspace?.id, "status"],
    queryFn: () => journalFlow.status(fetcher, workspace!.id),
    enabled: !!workspace,
  });
  if (!workspace) return null;
  if (status.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (status.isError)
    return (
      <DashboardCardError
        title="Daily review"
        error={status.error}
        onRetry={status.refetch}
      />
    );
  return status.data?.enabled ? (
    <DailyReviewQueue workspaceId={workspace.id} />
  ) : (
    <section className="flex h-full flex-col rounded-xl border border-border/70 bg-card/55 p-4">
      <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Daily review
      </h2>
      <p className="my-4 flex-1 py-6 text-center text-sm text-muted-foreground">
        Turn on your automatic journal to review your trading days.
      </p>
      <Button variant="outline" onClick={() => platform.navigate("/dashboard/journal")}>
        Open journal
      </Button>
    </section>
  );
}

function DailyReviewQueue({ workspaceId }: { workspaceId: string }) {
  const platform = useTradstryPlatform();
  const session = useReviewSession(workspaceId, null);
  const trades = useJournalTrades(workspaceId);
  const attention = useJournalAttention(workspaceId);
  if (session.isLoading) return <Skeleton className="h-64 rounded-xl" />;
  if (session.isError)
    return (
      <DashboardCardError
        title="Daily review"
        error={session.error}
        onRetry={session.refetch}
      />
    );
  const data = session.data;
  const pending = data ? itemsToReview(data.items) : [];
  const badge = data ? dayBadge(data) : null;
  return (
    <section className="flex h-full flex-col rounded-xl border border-border/70 bg-card/55 p-4">
      <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Daily review
      </h2>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {data ? `Latest trading day · ${dayLabel(data.date)}` : "Recorded automatically · reviewed by you"}
        </p>
        {badge && (
          <Badge
            role="status"
            className={cn(
              badge.complete
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {badge.text}
          </Badge>
        )}
      </div>
      <div className="my-4 flex-1">
        {pending.slice(0, 3).map((item) => {
          const trade = trades.data?.find((entry) => entry.id === item.entryId);
          return (
            <button
              type="button"
              key={item.entryId}
              onClick={() =>
                platform.navigate(`/dashboard/journal?trade=${encodeURIComponent(item.entryId)}`)
              }
              className="flex w-full items-center justify-between gap-3 border-b px-2 py-3 text-left text-sm hover:bg-accent/40"
            >
              <span className="min-w-0 truncate">
                {trade ? `${trade.symbol} · ${trade.direction}` : "Trade"}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">To review</span>
            </button>
          );
        })}
        {!pending.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {!data
              ? "Your trading days will appear here after brokerage sync."
              : badge?.complete
                ? "You’re caught up for the latest trading day."
                : "Nothing to review right now."}
          </p>
        )}
        {attention.count > 0 && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            {attention.count} {attention.count === 1 ? "thing needs" : "things need"} your attention.
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          className="flex-1"
          variant={pending.length ? "default" : "outline"}
          onClick={() => platform.navigate("/dashboard/journal")}
        >
          {pending.length ? `Review ${pending.length} ${pending.length === 1 ? "trade" : "trades"}` : "Open Today"}
        </Button>
        {attention.count > 0 && (
          <Button
            className="flex-1"
            variant="outline"
            onClick={() => platform.navigate("/dashboard/journal/attention")}
          >
            Needs attention · {attention.count}
          </Button>
        )}
      </div>
    </section>
  );
}
