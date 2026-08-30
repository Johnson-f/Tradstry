import { describe, expect, test } from "bun:test";
import type { AgentActivityEntry } from "@tradstry/app-ui/lib/types/agents";
import { buildActivityNeuralGraph } from "./activity-neural-model";

function entry(
	sequence: number,
	status: AgentActivityEntry["status"] = "COMPLETED",
): AgentActivityEntry {
	return {
		sequence,
		activityId: `tool:${sequence}`,
		parentActivityId: null,
		category: "TOOL",
		status,
		label: `Source ${sequence}`,
		detail: null,
		durationMs: status === "COMPLETED" ? sequence * 100 : null,
		metadata: {
			symbol: null,
			recordCount: null,
			dateRangeLabel: null,
			sourceCount: null,
			retryable: null,
		},
		createdAt: "2026-08-29T00:00:00Z",
	};
}

describe("activity neural graph", () => {
	test("keeps the five latest activity sources in sequence order", () => {
		const graph = buildActivityNeuralGraph(
			[6, 2, 4, 1, 5, 3].map((sequence) => entry(sequence)),
			"COMPLETED",
		);

		expect(graph.nodes.map((node) => node.activityId)).toEqual([
			"tool:2",
			"tool:3",
			"tool:4",
			"tool:5",
			"tool:6",
		]);
		expect(graph.summary).toBe("6 activities recorded");
		expect(graph.omittedCount).toBe(1);
	});

	test("shows a live request node before the first tool starts", () => {
		const graph = buildActivityNeuralGraph([], "RUNNING");

		expect(graph.nodes).toEqual([
			expect.objectContaining({
				activityId: "request",
				status: "STARTED",
				label: "Reviewing request",
			}),
		]);
		expect(graph.hubStatus).toBe("STARTED");
		expect(graph.summary).toBe("Reviewing request");
	});

	test("marks the response hub when activity fails", () => {
		const graph = buildActivityNeuralGraph(
			[entry(1, "COMPLETED"), entry(2, "FAILED")],
			"FAILED",
		);

		expect(graph.hubStatus).toBe("FAILED");
		expect(graph.summary).toBe("Response failed");
	});

	test("a recovered tool failure does not mark a completed run as failed", () => {
		const graph = buildActivityNeuralGraph(
			[entry(1, "FAILED"), entry(2)],
			"COMPLETED",
		);
		expect(graph.hubStatus).toBe("COMPLETED");
		expect(graph.nodes[0]?.status).toBe("FAILED");
	});

	test("connection loss preserves the run state without declaring a failure", () => {
		const graph = buildActivityNeuralGraph([entry(1, "STARTED")], "RUNNING", {
			reconnecting: true,
		});
		expect(graph.hubStatus).toBe("RECONNECTING");
		expect(graph.summary).toBe("Reconnecting to activity");
	});

	test("cancelled and approval-waiting runs are not successful completions", () => {
		expect(buildActivityNeuralGraph([entry(1)], "CANCELLED").hubStatus).toBe(
			"CANCELLED",
		);
		expect(
			buildActivityNeuralGraph([entry(1)], "WAITING_FOR_APPROVAL").hubStatus,
		).toBe("WAITING");
	});

	test("does not invent saved activity while loading or when none exists", () => {
		const empty = buildActivityNeuralGraph([], "COMPLETED");
		expect(empty.nodes).toEqual([]);
		expect(empty.summary).toBe("No saved activity");
		const loading = buildActivityNeuralGraph([], "COMPLETED", {
			loading: true,
		});
		expect(loading.nodes).toEqual([]);
		expect(loading.summary).toBe("Loading saved activity");
	});

	test("folds duplicate lifecycle events and preserves node positions as the graph grows", () => {
		const started = entry(1, "STARTED");
		const finished = { ...entry(2), activityId: started.activityId };
		const replay = buildActivityNeuralGraph([finished, started], "COMPLETED");
		expect(replay.nodes).toHaveLength(1);
		expect(replay.nodes[0]?.status).toBe("COMPLETED");
		const before = buildActivityNeuralGraph(
			[1, 2, 3, 4, 5].map((n) => entry(n)),
			"RUNNING",
		);
		const after = buildActivityNeuralGraph(
			[1, 2, 3, 4, 5, 6].map((n) => entry(n)),
			"RUNNING",
		);
		const original = before.nodes.find((node) => node.activityId === "tool:3");
		expect(after.nodes.find((node) => node.activityId === "tool:3")).toEqual(
			original,
		);
	});
});
