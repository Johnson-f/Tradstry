import { describe, expect, test } from "bun:test";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { netTone, reviewBadge, stateBadge } from "./journal-display";

const trade = (overrides: Partial<JournalTrade>) =>
	({ reviewState: "unreviewed", lifecycleState: "closed", retiredAt: null, ...overrides }) as JournalTrade;

describe("reviewBadge", () => {
	test("names the review state", () => {
		expect(reviewBadge(trade({ reviewState: "reviewed" })).text).toBe("Reviewed");
		expect(reviewBadge(trade({ reviewState: "outdated" })).tone).toBe("warn");
	});

	test("a skip shows its reason when known", () => {
		expect(reviewBadge(trade({ reviewState: "skipped" }), "too_small").text).toBe("Skipped · Too small");
		expect(reviewBadge(trade({ reviewState: "skipped" })).text).toBe("Skipped");
	});

	test("an unreviewed trade depends on whether it has exited", () => {
		expect(reviewBadge(trade({ lifecycleState: "open" })).text).toBe("When it exits");
		expect(reviewBadge(trade({ lifecycleState: "incomplete" })).text).toBe("Needs attention");
		expect(reviewBadge(trade({})).text).toBe("Not reviewed");
	});
});

describe("stateBadge", () => {
	test("a retired trade is a previous grouping", () => {
		expect(stateBadge(trade({ retiredAt: "2026-01-01T00:00:00Z" })).text).toBe("Previous grouping");
		expect(stateBadge(trade({ lifecycleState: "open" })).text).toBe("Open");
	});
});

describe("netTone", () => {
	test("wins are good and losses are bad", () => {
		expect(netTone("12.4")).toBe("good");
		expect(netTone("-3")).toBe("bad");
		expect(netTone("0")).toBeUndefined();
		expect(netTone(null)).toBeUndefined();
	});
});
