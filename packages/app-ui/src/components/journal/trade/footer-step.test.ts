import { describe, expect, test } from "bun:test";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { defaultTab, footerStep } from "./footer-step";

const trade = (overrides: Partial<JournalTrade>) =>
	({ lifecycleState: "closed", reviewState: "unreviewed", episodeId: "e1", hasEntryNote: true, remainingQuantity: null, ...overrides }) as JournalTrade;
const step = (overrides: Partial<JournalTrade>, extra: Partial<Parameters<typeof footerStep>[0]> = {}) =>
	footerStep({ trade: trade(overrides), tab: "timeline", editingReview: false, readOnly: false, ...extra });

describe("footerStep", () => {
	test("a trade with broken history needs fixing first", () => {
		expect(step({ lifecycleState: "incomplete" }).kind).toBe("fix-history");
	});

	test("an open trade asks for its entry note, then waits for the exit", () => {
		expect(step({ lifecycleState: "open", hasEntryNote: false }).kind).toBe("write-entry-note");
		expect(step({ lifecycleState: "open", remainingQuantity: "3" })).toEqual({ kind: "holding", held: "3" });
	});

	test("a trade without actions never asks for an entry note", () => {
		expect(step({ lifecycleState: "open", hasEntryNote: false, episodeId: null }).kind).toBe("holding");
	});

	test("a reviewed trade offers Edit review until editing starts", () => {
		expect(step({ reviewState: "reviewed" }).kind).toBe("edit-review");
		expect(step({ reviewState: "reviewed" }, { editingReview: true })).toEqual({ kind: "review", onReviewTab: false, again: true });
	});

	test("a skipped trade offers Undo skip", () => {
		expect(step({ reviewState: "skipped" }).kind).toBe("undo-skip");
	});

	test("an exit to review shows Skip and the review button for the current tab", () => {
		expect(step({})).toEqual({ kind: "review", onReviewTab: false, again: false });
		expect(step({}, { tab: "review" })).toEqual({ kind: "review", onReviewTab: true, again: false });
		expect(step({ reviewState: "outdated" }, { tab: "review" })).toEqual({ kind: "review", onReviewTab: true, again: true });
	});

	test("a read-only trade has no next step", () => {
		expect(step({}, { readOnly: true }).kind).toBe("read-only");
	});
});

describe("defaultTab", () => {
	test("exits not yet reviewed open on Review, everything else on Timeline", () => {
		expect(defaultTab(trade({}))).toBe("review");
		expect(defaultTab(trade({ reviewState: "outdated" }))).toBe("review");
		expect(defaultTab(trade({ reviewState: "reviewed" }))).toBe("timeline");
		expect(defaultTab(trade({ lifecycleState: "open" }))).toBe("timeline");
		expect(defaultTab(trade({ lifecycleState: "incomplete" }))).toBe("timeline");
	});
});
