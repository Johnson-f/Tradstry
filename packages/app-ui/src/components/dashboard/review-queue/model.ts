import type { PendingTrade } from "@tradstry/app-ui/lib/types/brokerage";

type ReviewQueueKind = "grouping" | "ready" | "open";

export interface ReviewQueueItem {
  trade: PendingTrade;
  kind: ReviewQueueKind;
}

export interface ReviewQueueModel {
  groupingCount: number;
  readyCount: number;
  openCount: number;
  actionLabel:
    | "Fix grouping"
    | "Review next trade"
    | "View open positions"
    | "All caught up";
  items: ReviewQueueItem[];
}

function needsGrouping(trade: PendingTrade) {
  return trade.requiresManualGrouping || trade.isPartiallyLinked;
}

export function buildReviewQueueModel(
  trades: PendingTrade[],
): ReviewQueueModel {
  const grouping = trades.filter(
    (trade) => trade.status === "closed" && needsGrouping(trade),
  );
  const ready = trades.filter(
    (trade) => trade.status === "closed" && !needsGrouping(trade),
  );
  const open = trades.filter((trade) => trade.status === "open");
  const items: ReviewQueueItem[] = [
    ...grouping.map((trade) => ({ trade, kind: "grouping" as const })),
    ...ready.map((trade) => ({ trade, kind: "ready" as const })),
    ...open.map((trade) => ({ trade, kind: "open" as const })),
  ].slice(0, 3);

  return {
    groupingCount: grouping.length,
    readyCount: ready.length,
    openCount: open.length,
    actionLabel:
      grouping.length > 0
        ? "Fix grouping"
        : ready.length > 0
          ? "Review next trade"
          : open.length > 0
            ? "View open positions"
            : "All caught up",
    items,
  };
}
