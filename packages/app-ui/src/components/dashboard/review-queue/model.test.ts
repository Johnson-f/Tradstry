import { expect, test } from "bun:test";
import type { PendingTrade } from "@tradstry/app-ui/lib/types/brokerage";
import { buildReviewQueueModel } from "./model";

function trade(
  id: string,
  status: PendingTrade["status"],
  overrides: Partial<PendingTrade> = {},
): PendingTrade {
  return {
    id,
    episodeId: `episode-${id}`,
    symbol: id.toUpperCase(),
    direction: "long",
    status,
    openDate: "2026-08-01T14:00:00Z",
    closeDate: status === "closed" ? "2026-08-02T20:00:00Z" : null,
    entryUnits: 1,
    avgEntryPrice: 10,
    avgExitPrice: status === "closed" ? 11 : null,
    realizedPnl: status === "closed" ? 1 : null,
    transactionIds: [`transaction-${id}`],
    fillCount: status === "closed" ? 2 : 1,
    isFullyLinked: false,
    isPartiallyLinked: false,
    multiplier: 1,
    isOption: false,
    underlying: null,
    optionKind: null,
    strike: null,
    expiration: null,
    symbolName: null,
    requiresManualGrouping: false,
    blockReason: null,
    isManuallyGrouped: false,
    ...overrides,
  };
}

test("review queue prioritizes blocked groupings before ready trades and open positions", () => {
  const model = buildReviewQueueModel([
    trade("open", "open"),
    trade("ready", "closed"),
    trade("blocked", "closed", {
      requiresManualGrouping: true,
      blockReason: "A reversal fill spans two positions.",
    }),
    trade("partial", "closed", { isPartiallyLinked: true }),
  ]);

  expect(model.groupingCount).toBe(2);
  expect(model.readyCount).toBe(1);
  expect(model.openCount).toBe(1);
  expect(model.actionLabel).toBe("Fix grouping");
  expect(model.items.map((item) => item.trade.id)).toEqual([
    "blocked",
    "partial",
    "ready",
  ]);
});

test("review queue chooses the next useful action for each state", () => {
  expect(buildReviewQueueModel([trade("ready", "closed")]).actionLabel).toBe(
    "Review next trade",
  );
  expect(buildReviewQueueModel([trade("open", "open")]).actionLabel).toBe(
    "View open positions",
  );
  expect(buildReviewQueueModel([]).actionLabel).toBe("All caught up");
});
