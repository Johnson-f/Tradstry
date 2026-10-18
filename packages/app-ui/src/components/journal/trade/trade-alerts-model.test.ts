import { describe, expect, test } from "bun:test";
import type { ContinuationSuggestion, HoldingsMismatch, JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { tradeAlerts } from "./trade-alerts-model";

const trade = (overrides: Partial<JournalTrade> = {}) =>
	({ retiredAt: null, successorId: null, lifecycleState: "closed", issueCode: null, issueMessage: null, possibleDuplicates: [], ...overrides }) as JournalTrade;
const alerts = (overrides: Partial<Parameters<typeof tradeAlerts>[0]> = {}) =>
	tradeAlerts({ trade: trade(), holdings: [], continuations: [], brokenJoins: [], ...overrides });

describe("tradeAlerts", () => {
	test("a healthy trade has no alerts", () => {
		expect(alerts()).toEqual([]);
	});

	test("incomplete history uses the server's message", () => {
		const list = alerts({ trade: trade({ lifecycleState: "incomplete", issueCode: "incomplete_history", issueMessage: "Sold 300 but held 100" }) });
		expect(list).toEqual([{ id: "history", kind: "history", text: "Sold 300 but held 100" }]);
	});

	test("a blocking duplicate is not also reported as broken history", () => {
		const list = alerts({ trade: trade({ lifecycleState: "incomplete", issueCode: "possible_duplicate", possibleDuplicates: ["x"] }) });
		expect(list.map((alert) => alert.kind)).toEqual(["duplicate"]);
		expect(list[0]).toMatchObject({ blocking: true });
	});

	test("collects holdings, ticker changes and broken joins in one list", () => {
		const list = alerts({
			holdings: [{ instrumentKey: "k", held: "4.5", imported: "3" } as HoldingsMismatch],
			continuations: [{ executionId: "e", fromSymbol: "IRBT", toSymbol: "IRBTQ", explanation: "Same size." } as ContinuationSuggestion],
			brokenJoins: ["j1"],
		});
		expect(list.map((alert) => alert.kind)).toEqual(["holdings", "continuation", "join"]);
	});

	test("a retired trade links to the one that replaced it", () => {
		const list = alerts({ trade: trade({ retiredAt: "2026-01-01T00:00:00Z", successorId: "s1" }) });
		expect(list[0]).toMatchObject({ kind: "successor", successorId: "s1" });
	});
});
