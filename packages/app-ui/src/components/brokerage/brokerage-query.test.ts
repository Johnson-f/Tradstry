import { expect, test } from "bun:test";
import { parseBrokerageQuery } from "./brokerage-query";

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
