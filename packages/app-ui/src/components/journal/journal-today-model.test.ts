import { describe, expect, test } from "bun:test";
import type { JournalTrade, ReviewSession, SessionItem } from "@tradstry/app-ui/lib/service/journal-flow";
import { dayBadge, groupedItems, isoToLocalDate, itemsToReview, latestTradingDay, localDateToIso, nextPending, rowBadge, rowNote, unreviewedDays } from "./journal-today-model";

const item = (entryId: string, group: SessionItem["group"], state: SessionItem["state"]): SessionItem => ({ entryId, group, state, skipReason: null });
const trade = (overrides: Partial<JournalTrade>) =>
	({ retiredAt: null, openDate: null, closeDate: null, firstExecutionAt: null, lastExecutionAt: null, executionCount: 2, ...overrides }) as JournalTrade;

describe("groupedItems", () => {
	test("keeps the group order and drops empty groups", () => {
		const groups = groupedItems([item("a", "attention", "none"), item("b", "exited", "pending")]);
		expect(groups.map((group) => group.value)).toEqual(["exited", "attention"]);
	});
});

describe("itemsToReview", () => {
	test("only exits still waiting for a review", () => {
		const items = [item("a", "exited", "reviewed"), item("b", "open", "pending"), item("c", "exited", "pending"), item("d", "exited", "skipped")];
		expect(itemsToReview(items).map((entry) => entry.entryId)).toEqual(["c"]);
	});
});

describe("nextPending", () => {
	const ordered = [item("a", "exited", "pending"), item("b", "exited", "reviewed"), item("c", "exited", "pending"), item("d", "open", "none")];

	test("goes forward to the next exit to review", () => {
		expect(nextPending(ordered, "a")?.entryId).toBe("c");
	});

	test("wraps around to the start", () => {
		expect(nextPending(ordered, "c")?.entryId).toBe("a");
	});

	test("is empty once nothing else is waiting", () => {
		expect(nextPending([item("a", "exited", "pending")], "a")).toBeUndefined();
	});
});

describe("dayBadge", () => {
	const session = (items: SessionItem[], extra: Partial<ReviewSession>) => ({ items, complete: false, skippedCount: 0, ...extra }) as ReviewSession;

	test("counts finished exits", () => {
		const items = [item("a", "exited", "reviewed"), item("b", "exited", "pending"), item("c", "exited", "skipped")];
		expect(dayBadge(session(items, {})).text).toBe("2 of 3 exits reviewed");
	});

	test("shows skips once the day is complete", () => {
		const items = [item("a", "exited", "reviewed")];
		expect(dayBadge(session(items, { complete: true })).text).toBe("Reviewed");
		expect(dayBadge(session(items, { complete: true, skippedCount: 1 }))).toEqual({ text: "Reviewed · 1 skipped", complete: true });
	});

	test("a day without exits has nothing to review", () => {
		expect(dayBadge(session([item("a", "open", "none")], { complete: true })).complete).toBe(false);
	});
});

describe("calendar days", () => {
	const trades = [
		trade({ lifecycleState: "closed", reviewState: "unreviewed", openDate: "2026-04-06T14:00:00Z", closeDate: "2026-04-07T15:00:00Z" }),
		trade({ lifecycleState: "closed", reviewState: "reviewed", openDate: "2026-04-01T14:00:00Z", closeDate: "2026-04-01T15:00:00Z" }),
		trade({ lifecycleState: "closed", reviewState: "unreviewed", closeDate: "2026-03-01T15:00:00Z", retiredAt: "2026-03-02T00:00:00Z" }),
	];

	test("a day is unreviewed when a trade closed that day without a finished review", () => {
		expect([...unreviewedDays(trades, "UTC")]).toEqual(["2026-04-07"]);
	});

	test("the latest trading day ignores retired trades", () => {
		expect(latestTradingDay(trades, "UTC")).toBe("2026-04-07");
		expect(latestTradingDay([], "UTC")).toBeNull();
	});
});

describe("rowNote", () => {
	test("an open trade without an entry note says so", () => {
		const open = trade({ episodeId: "e", remainingQuantity: "3", hasEntryNote: false });
		expect(rowNote(item("a", "open", "none"), open)).toBe("3 held · Entry note missing");
		expect(rowNote(item("a", "open", "none"), { ...open, hasEntryNote: true })).toBe("3 held");
	});

	test("an exit counts its executions", () => {
		expect(rowNote(item("a", "exited", "pending"), trade({}))).toBe("2 executions");
	});

	test("an attention row explains the problem", () => {
		expect(rowNote(item("a", "attention", "none"), trade({ issueMessage: "Sold 300 but held 100" }))).toBe("Sold 300 but held 100");
		expect(rowNote(item("a", "attention", "none"), trade({ reviewState: "outdated" }))).toBe("Results changed after your review");
	});
});

describe("rowBadge", () => {
	test("an exit shows where its review stands", () => {
		expect(rowBadge(item("a", "exited", "pending"), trade({})).text).toBe("To review");
		expect(rowBadge(item("a", "exited", "reviewed"), trade({})).tone).toBe("good");
		expect(rowBadge({ ...item("a", "exited", "skipped"), skipReason: "mistake_fill" }, trade({})).text).toBe("Skipped · Mistake fill");
	});

	test("an open trade asks for its entry note first", () => {
		const open = trade({ lifecycleState: "open", episodeId: "e", hasEntryNote: false });
		expect(rowBadge(item("a", "open", "none"), open).text).toBe("Write entry note");
		expect(rowBadge(item("a", "open", "none"), { ...open, hasEntryNote: true }).text).toBe("When it exits");
	});

	test("attention rows are flagged", () => {
		expect(rowBadge(item("a", "attention", "none"), trade({})).tone).toBe("warn");
	});
});

describe("calendar dates", () => {
	test("a day survives the trip to a calendar and back", () => {
		expect(localDateToIso(isoToLocalDate("2026-03-08"))).toBe("2026-03-08");
		expect(localDateToIso(isoToLocalDate("2026-12-31"))).toBe("2026-12-31");
	});
});
