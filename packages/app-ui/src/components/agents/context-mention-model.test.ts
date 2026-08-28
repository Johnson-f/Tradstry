import { describe, expect, test } from "bun:test";
import type { AgentContextSearchResult } from "@tradstry/app-ui/lib/types/agents";
import {
	addContextSelection,
	createCustomDateSelection,
	findActiveMention,
	replaceActiveMention,
	serializeContextSelections,
} from "./context-mention-model";

function result(
	kind: AgentContextSearchResult["kind"],
	id: string | null,
	metadata: Record<string, unknown> = {},
): AgentContextSearchResult {
	return {
		key: `${kind}:${id ?? JSON.stringify(metadata)}`,
		kind,
		id,
		title: id ?? "AAPL",
		subtitle: "Context",
		metadataJson: JSON.stringify(metadata),
	};
}

describe("agent context mention model", () => {
	test("finds and removes the active @ token at the cursor", () => {
		const value = "Compare this with @AAPL";
		const mention = findActiveMention(value, value.length);
		expect(mention).toEqual({ start: 18, end: 23, query: "AAPL" });
		expect(replaceActiveMention(value, mention!)).toEqual({
			value: "Compare this with ",
			cursor: 18,
		});
		expect(findActiveMention("email@test.com", 14)).toBeNull();
	});

	test("deduplicates items, caps multi-select groups, and replaces singleton groups", () => {
		let selections: AgentContextSearchResult[] = [];
		for (let index = 0; index < 6; index += 1) {
			selections = addContextSelection(
				selections,
				result("TRADE", `trade-${index}`),
			);
		}
		expect(selections).toHaveLength(5);
		selections = addContextSelection(
			selections,
			result("MARKET", null, { symbol: "AAPL" }),
		);
		selections = addContextSelection(
			selections,
			result("MARKET", null, { symbol: "MSFT" }),
		);
		expect(selections.filter((item) => item.kind === "MARKET")).toHaveLength(1);
		expect(serializeContextSelections(selections)?.marketSymbol).toBe("MSFT");
	});

	test("serializes every supported context kind for the backend", () => {
		const date = createCustomDateSelection({
			from: "2026-08-01",
			to: "2026-08-27",
		});
		const context = serializeContextSelections([
			result("TRADE", "trade-1"),
			result("PLAYBOOK", "playbook-1"),
			result("NOTE", "note-1"),
			result("MEDIA", "media-1"),
			result("MARKET", null, { symbol: "AAPL" }),
			date,
		]);
		expect(context).toEqual({
			references: [
				{
					key: "TRADE:trade-1",
					kind: "TRADE",
					id: "trade-1",
					title: "trade-1",
					subtitle: "Context",
				},
				{
					key: "PLAYBOOK:playbook-1",
					kind: "PLAYBOOK",
					id: "playbook-1",
					title: "playbook-1",
					subtitle: "Context",
				},
				{
					key: "NOTE:note-1",
					kind: "NOTE",
					id: "note-1",
					title: "note-1",
					subtitle: "Context",
				},
				{
					key: "MEDIA:media-1",
					kind: "MEDIA",
					id: "media-1",
					title: "media-1",
					subtitle: "Context",
				},
				{
					key: 'MARKET:{"symbol":"AAPL"}',
					kind: "MARKET",
					id: null,
					title: "AAPL",
					subtitle: "Context",
				},
				{
					key: "date_range:custom:2026-08-01:2026-08-27",
					kind: "DATE_RANGE",
					id: null,
					title: "Custom range",
					subtitle: "2026-08-01 – 2026-08-27",
				},
			],
			tradeIds: ["trade-1"],
			playbookIds: ["playbook-1"],
			noteIds: ["note-1"],
			mediaIds: ["media-1"],
			marketSymbol: "AAPL",
			dateRange: { from: "2026-08-01", to: "2026-08-27" },
		});
	});
});
