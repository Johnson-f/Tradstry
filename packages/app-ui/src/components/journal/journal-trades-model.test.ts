import { describe, expect, test } from "bun:test";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { filterChips, filterTrades, initialFilters, NO_FILTERS, sortTrades, toggleFilter } from "./journal-trades-model";

const trade = (id: string, overrides: Partial<JournalTrade>) =>
	({ id, symbol: id.toUpperCase(), symbolName: "", lifecycleState: "closed", reviewState: "unreviewed", openDate: null, closeDate: null, lastExecutionAt: null, realizedNet: null, realizedR: null, ...overrides }) as JournalTrade;

const trades = [
	trade("snap", { symbolName: "Snap Inc.", closeDate: "2026-01-02T00:00:00Z", realizedNet: "12.4", realizedR: "1.2", reviewState: "reviewed" }),
	trade("aehr", { closeDate: "2026-01-05T00:00:00Z", realizedNet: "-30.1", realizedR: "-1" }),
	trade("hpe", { lifecycleState: "open", openDate: "2026-01-03T00:00:00Z" }),
];

const ids = (list: JournalTrade[]) => list.map((entry) => entry.id);

describe("filterTrades", () => {
	test("searches the symbol and the company name", () => {
		expect(ids(filterTrades(trades, "snap", NO_FILTERS))).toEqual(["snap"]);
		expect(ids(filterTrades(trades, "inc", NO_FILTERS))).toEqual(["snap"]);
	});

	test("combines groups with and, values within a group with or", () => {
		const filters = { lifecycle: ["closed", "open"], review: ["unreviewed"] };
		expect(ids(filterTrades(trades, "", filters))).toEqual(["aehr", "hpe"]);
	});
});

describe("sortTrades", () => {
	test("newest and oldest use the latest date and put unknown dates last", () => {
		const undated = [...trades, trade("none", {})];
		expect(ids(sortTrades(undated, "newest"))).toEqual(["aehr", "hpe", "snap", "none"]);
		expect(ids(sortTrades(undated, "oldest"))).toEqual(["snap", "hpe", "aehr", "none"]);
	});

	test("biggest win, biggest loss and highest R leave unknowns at the end", () => {
		expect(ids(sortTrades(trades, "win"))).toEqual(["snap", "aehr", "hpe"]);
		expect(ids(sortTrades(trades, "loss"))).toEqual(["aehr", "snap", "hpe"]);
		expect(ids(sortTrades(trades, "r"))).toEqual(["snap", "aehr", "hpe"]);
	});

	test("does not change the list it was given", () => {
		const before = ids(trades);
		sortTrades(trades, "win");
		expect(ids(trades)).toEqual(before);
	});
});

describe("filters", () => {
	test("toggling adds and removes a value", () => {
		const once = toggleFilter(NO_FILTERS, "review", "reviewed");
		expect(once.review).toEqual(["reviewed"]);
		expect(toggleFilter(once, "review", "reviewed").review).toEqual([]);
	});

	test("chips carry the readable label", () => {
		expect(filterChips({ lifecycle: ["incomplete"], review: ["outdated"] }).map((chip) => chip.label)).toEqual(["Needs attention", "Results changed"]);
	});

	test("a status in the link becomes a filter", () => {
		expect(initialFilters("open").lifecycle).toEqual(["open"]);
		expect(initialFilters("bogus")).toEqual(NO_FILTERS);
		expect(initialFilters(null)).toEqual(NO_FILTERS);
	});
});
