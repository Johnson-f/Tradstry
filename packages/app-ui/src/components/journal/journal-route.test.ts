import { describe, expect, test } from "bun:test";
import { parseJournalPath, tradeUrl } from "./journal-route";

describe("parseJournalPath", () => {
	test("the journal root is Today", () => {
		expect(parseJournalPath("/dashboard/journal")).toEqual({ view: "today", legacyTradeId: null });
		expect(parseJournalPath("/dashboard/journal/")).toEqual({ view: "today", legacyTradeId: null });
	});

	test("trades and attention are their own views", () => {
		expect(parseJournalPath("/dashboard/journal/trades").view).toBe("trades");
		expect(parseJournalPath("/dashboard/journal/attention").view).toBe("attention");
	});

	test("the old review route maps to Today", () => {
		expect(parseJournalPath("/dashboard/journal/review?date=2026-01-02")).toEqual({ view: "today", legacyTradeId: null });
	});

	test("an old trade link opens that trade over Trades", () => {
		expect(parseJournalPath("/dashboard/journal/abc%20123")).toEqual({ view: "trades", legacyTradeId: "abc 123" });
	});
});

describe("tradeUrl", () => {
	test("adds the trade and keeps other parameters", () => {
		expect(tradeUrl("/dashboard/journal/trades", "?symbol=SNAP", "e1")).toBe("/dashboard/journal/trades?symbol=SNAP&trade=e1");
	});

	test("removes the trade", () => {
		expect(tradeUrl("/dashboard/journal", "?trade=e1", null)).toBe("/dashboard/journal");
		expect(tradeUrl("/dashboard/journal", "?date=2026-01-02&trade=e1", null)).toBe("/dashboard/journal?date=2026-01-02");
	});
});
