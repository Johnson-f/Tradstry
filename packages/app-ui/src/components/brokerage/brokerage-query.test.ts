import { expect, test } from "bun:test";
import { brokerageJournalFilter, parseBrokerageQuery } from "./brokerage-query";

test("Journalled always requests linked fills regardless of the all-transactions filter", () => {
	expect(brokerageJournalFilter("journalled", "all")).toBe(true);
	expect(brokerageJournalFilter("journalled", "unjournalled")).toBe(true);
	expect(brokerageJournalFilter("journalled", "journalled")).toBe(true);
});

test("all-transactions journal status maps to the server filter without affecting pending", () => {
	expect(brokerageJournalFilter("all", "all")).toBeUndefined();
	expect(brokerageJournalFilter("all", "unjournalled")).toBe(false);
	expect(brokerageJournalFilter("all", "journalled")).toBe(true);
	expect(brokerageJournalFilter("pending", "unjournalled")).toBeUndefined();
});

test("parses a symbol breakdown link into the all-transactions filters", () => {
	expect(
		parseBrokerageQuery(
			new URLSearchParams("tab=all&symbol=aapl&range=LAST_1_MONTH"),
		),
	).toEqual({
		tab: "all",
		symbol: "AAPL",
		range: "LAST_1_MONTH",
		startDate: undefined,
		endDate: undefined,
		episodeClosedDate: undefined,
	});
});

test("parses an exact trading-day breakdown link", () => {
	expect(
		parseBrokerageQuery(
			new URLSearchParams("tab=all&episodeClosedDate=2026-06-10"),
		),
	).toEqual({
		tab: "all",
		symbol: undefined,
		range: "CUSTOM",
		startDate: undefined,
		endDate: undefined,
		episodeClosedDate: "2026-06-10",
	});
});

test("ignores unsupported tabs, ranges, and malformed dates", () => {
	expect(
		parseBrokerageQuery(
			new URLSearchParams(
				"tab=unknown&range=FOREVER&startDate=June-10&endDate=2026-99-99",
			),
		),
	).toEqual({
		tab: "pending",
		symbol: undefined,
		range: "ALL",
		startDate: undefined,
		endDate: undefined,
		episodeClosedDate: undefined,
	});
});
