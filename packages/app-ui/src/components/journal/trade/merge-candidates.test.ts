import { describe, expect, test } from "bun:test";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { mergeCandidates } from "./merge-candidates";

const trade = (id: string, overrides: Partial<JournalTrade> = {}) =>
	({ id, episodeId: `ep-${id}`, retiredAt: null, lifecycleState: "closed", symbol: "SNAP", direction: "long", currency: "USD", ...overrides }) as JournalTrade;

describe("mergeCandidates", () => {
	test("offers trades with the same instrument, direction and currency", () => {
		const current = trade("a");
		const list = [
			current,
			trade("b"),
			trade("c", { direction: "short" }),
			trade("d", { symbol: "AEHR" }),
			trade("e", { currency: "CAD" }),
		];
		expect(mergeCandidates(current, list).map((entry) => entry.id)).toEqual(["b"]);
	});

	test("leaves out manual, retired and unresolved trades", () => {
		const current = trade("a");
		const list = [
			trade("m", { episodeId: null }),
			trade("r", { retiredAt: "2026-01-01T00:00:00Z" }),
			trade("i", { lifecycleState: "incomplete" }),
			trade("o", { lifecycleState: "open" }),
		];
		expect(mergeCandidates(current, list).map((entry) => entry.id)).toEqual(["o"]);
	});
});
