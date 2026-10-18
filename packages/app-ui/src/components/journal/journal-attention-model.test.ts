import { describe, expect, test } from "bun:test";
import type { ActionNote, BrokenJoin, ContinuationSuggestion, HoldingsMismatch, JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { attentionCount, attentionItems, holdingsKey, itemsForTrade } from "./journal-attention-model";

const trade = (id: string, overrides: Partial<JournalTrade>) =>
	({ id, retiredAt: null, lifecycleState: "closed", reviewState: "reviewed", issueCode: null, ...overrides }) as JournalTrade;
const mismatch = { instrumentKey: "chym", symbol: "CHYM", held: "4.5", imported: "3", message: "", entryId: "t-chym" } as HoldingsMismatch;
const suggestion = { fromSymbol: "IRBT", toSymbol: "IRBTQ", executionId: "x2", openingExecutionId: "x1" } as ContinuationSuggestion;
const orphan = { id: "n1" } as ActionNote;
const broken = { joinId: "j1", entryId: "t-snap", symbol: "SNAP", executionIds: ["a", "b"] } as BrokenJoin;

const build = (overrides: Partial<Parameters<typeof attentionItems>[0]> = {}) =>
	attentionItems({ trades: [], mismatches: [], continuations: [], orphans: [], dismissed: [], ...overrides });

describe("attentionItems", () => {
	test("orders ticker changes, holdings, history, duplicates, results and notes", () => {
		const items = build({
			trades: [
				trade("outdated", { reviewState: "outdated" }),
				trade("dup", { lifecycleState: "incomplete", issueCode: "possible_duplicate" }),
				trade("broken", { lifecycleState: "incomplete", issueCode: "incomplete_history" }),
			],
			mismatches: [mismatch],
			continuations: [suggestion],
			brokenJoins: [broken],
			orphans: [orphan],
		});
		expect(items.map((item) => item.kind)).toEqual(["continuation", "holdings", "history", "duplicate", "outdated", "broken-join", "orphan"]);
	});

	test("skips retired trades and holdings the user is waiting on", () => {
		const items = build({
			trades: [trade("old", { lifecycleState: "incomplete", retiredAt: "2026-01-01T00:00:00Z" })],
			mismatches: [mismatch],
			dismissed: [holdingsKey(mismatch)],
		});
		expect(items).toEqual([]);
	});

	test("a changed mismatch comes back after it was dismissed", () => {
		const items = build({ mismatches: [{ ...mismatch, imported: "2" }], dismissed: [holdingsKey(mismatch)] });
		expect(items).toHaveLength(1);
	});
});

describe("attentionCount", () => {
	test("every item waiting on an answer counts", () => {
		expect(attentionCount(build({ orphans: [orphan], mismatches: [mismatch], brokenJoins: [broken] }))).toBe(3);
	});
});

describe("itemsForTrade", () => {
	test("picks the holdings and ticker changes that touch one trade", () => {
		const items = build({ mismatches: [mismatch], continuations: [suggestion] });
		expect(itemsForTrade(items, "t-chym", ["x9"]).holdings).toHaveLength(1);
		expect(itemsForTrade(items, "other", ["x9"]).holdings).toHaveLength(0);
		expect(itemsForTrade(items, "other", ["x1"]).continuations).toHaveLength(1);
		expect(itemsForTrade(items, "other", ["x9"]).continuations).toHaveLength(0);
	});
});
