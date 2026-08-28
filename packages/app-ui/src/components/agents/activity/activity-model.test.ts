import { describe, expect, test } from "bun:test";
import type {
	AgentActivityEntry,
	AgentActivitySummary,
} from "@tradstry/app-ui/lib/types/agents";
import {
	foldActivityEntries,
	formatActivityDuration,
	formatActivitySummary,
	thinkingHeaderLabel,
	thinkingNarrative,
} from "./activity-model";

function entry(
	sequence: number,
	status: AgentActivityEntry["status"],
): AgentActivityEntry {
	return {
		sequence,
		activityId: "tool:1",
		parentActivityId: null,
		category: "TOOL",
		status,
		label: status === "STARTED" ? "Checking data" : "Loaded data",
		detail: null,
		durationMs: status === "COMPLETED" ? 1200 : null,
		metadata: {
			symbol: null,
			recordCount: null,
			dateRangeLabel: null,
			sourceCount: null,
			retryable: null,
		},
		createdAt: "2026-08-28T00:00:00Z",
	};
}

describe("agent activity model", () => {
	test("folds lifecycle updates without duplicating an activity", () => {
		expect(
			foldActivityEntries(
				[entry(2, "COMPLETED"), entry(1, "STARTED")],
				"COMPLETED",
			),
		).toEqual([
			expect.objectContaining({
				status: "COMPLETED",
				label: "Loaded data",
				durationMs: 1200,
			}),
		]);
	});

	test("marks unfinished work as interrupted after a failure", () => {
		expect(
			foldActivityEntries([entry(1, "STARTED")], "FAILED")[0]?.status,
		).toBe("INTERRUPTED");
	});

	test("formats a compact completed summary", () => {
		const summary = {
			messageId: "m1",
			status: "COMPLETED",
			durationMs: 32_850,
			modelCalls: 5,
			toolCalls: 7,
			subagentCount: 1,
			sourceCount: 3,
			hasFailures: false,
		} satisfies AgentActivitySummary;
		expect(formatActivitySummary(summary)).toBe("7 tools · 1 agent · 33s");
		expect(formatActivityDuration(1250)).toBe("1.3s");
	});

	test("nests a subagent under the active delegated tool", () => {
		const delegated = {
			...entry(1, "STARTED"),
			activityId: "tool:delegate-1",
			label: "Checking delegated review",
		};
		const subagent = {
			...entry(2, "STARTED"),
			activityId: "subagent:trade-review",
			category: "SUBAGENT" as const,
			label: "Trade review agent",
		};
		const folded = foldActivityEntries([delegated, subagent], "RUNNING");
		expect(folded[1]?.parentActivityId).toBe("tool:delegate-1");
	});

	test("presents activity as safe response-crafting prose", () => {
		const summary = {
			messageId: "m1",
			status: "COMPLETED",
			durationMs: 7_400,
			modelCalls: 2,
			toolCalls: 1,
			subagentCount: 0,
			sourceCount: 1,
			hasFailures: false,
		} satisfies AgentActivitySummary;
		expect(
			thinkingHeaderLabel({
				running: true,
				hasError: false,
				entries: [],
			}),
		).toBe("Crafting a response");
		expect(
			thinkingHeaderLabel({
				running: false,
				hasError: false,
				summary,
				entries: [],
			}),
		).toBe("Crafted response · 7.4s");
		expect(
			thinkingNarrative({
				running: true,
				hasError: false,
				entries: [],
			}),
		).toBe("I’m reviewing your request and preparing a clear response.");
	});
});
