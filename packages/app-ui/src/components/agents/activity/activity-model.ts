import type {
	AgentActivityEntry,
	AgentActivitySummary,
	AgentRunStatus,
} from "@tradstry/app-ui/lib/types/agents";

export function foldActivityEntries(
	entries: AgentActivityEntry[],
	runStatus: AgentRunStatus,
): AgentActivityEntry[] {
	const folded: AgentActivityEntry[] = [];
	const positions = new Map<string, number>();
	for (const entry of [...entries].sort(
		(left, right) => left.sequence - right.sequence,
	)) {
		const normalized =
			entry.category === "SUBAGENT" && !entry.parentActivityId
				? {
						...entry,
						parentActivityId:
							[...folded]
								.reverse()
								.find(
									(candidate) =>
										candidate.category === "TOOL" &&
										candidate.status === "STARTED" &&
										candidate.label.toLowerCase().includes("delegated"),
								)?.activityId ?? null,
					}
				: entry;
		const position = positions.get(normalized.activityId);
		if (position === undefined) {
			positions.set(normalized.activityId, folded.length);
			folded.push({ ...normalized, metadata: { ...normalized.metadata } });
			continue;
		}
		const previous = folded[position];
		if (!previous) continue;
		folded[position] = {
			...previous,
			status: normalized.status,
			label: normalized.label,
			detail: normalized.detail ?? previous.detail,
			durationMs:
				normalized.durationMs ??
				elapsedMs(previous.createdAt, normalized.createdAt) ??
				previous.durationMs,
			metadata: hasMetadata(normalized)
				? { ...normalized.metadata }
				: previous.metadata,
		};
	}
	if (!["QUEUED", "RUNNING"].includes(runStatus)) {
		for (const entry of folded) {
			if (entry.status !== "STARTED") continue;
			entry.status = runStatus === "CANCELLED" ? "CANCELLED" : "INTERRUPTED";
		}
	}
	return folded;
}

function elapsedMs(startedAt: string, completedAt: string) {
	const started = new Date(startedAt).getTime();
	const completed = new Date(completedAt).getTime();
	if (!Number.isFinite(started) || !Number.isFinite(completed)) return null;
	return Math.max(0, completed - started);
}

function hasMetadata(entry: AgentActivityEntry) {
	return Object.values(entry.metadata).some((value) => value !== null);
}

export function formatActivityDuration(durationMs: number | null): string {
	if (durationMs === null) return "";
	if (durationMs < 1_000) return `${durationMs}ms`;
	if (durationMs < 60_000) {
		const seconds = durationMs / 1_000;
		return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)}s`;
	}
	const minutes = Math.floor(durationMs / 60_000);
	const seconds = Math.round((durationMs % 60_000) / 1_000);
	return `${minutes}m ${seconds}s`;
}

export function formatActivitySummary(summary: AgentActivitySummary): string {
	const parts = [
		`${summary.toolCalls} ${summary.toolCalls === 1 ? "tool" : "tools"}`,
	];
	if (summary.subagentCount > 0) {
		parts.push(
			`${summary.subagentCount} ${summary.subagentCount === 1 ? "agent" : "agents"}`,
		);
	}
	const duration = formatActivityDuration(summary.durationMs);
	if (duration) parts.push(duration);
	return parts.join(" · ");
}

export function thinkingHeaderLabel({
	running,
	hasError,
	summary,
	entries,
}: {
	running: boolean;
	hasError: boolean;
	summary?: AgentActivitySummary;
	entries: AgentActivityEntry[];
}) {
	if (hasError) return "Reconnecting to the response";
	if (running) {
		const active = [...entries]
			.reverse()
			.find((entry) => entry.status === "STARTED");
		if (active?.category === "TOOL") return active.label;
		if (active?.category === "SUBAGENT") {
			return `Working with ${active.label.toLowerCase()}`;
		}
		const usedGrounding = entries.some(
			(entry) => entry.category === "TOOL" || entry.category === "SUBAGENT",
		);
		return usedGrounding
			? "Crafting a grounded response"
			: "Crafting a response";
	}
	if (!summary) return "Response activity";
	if (summary.status === "CANCELLED") return "Response cancelled";
	if (summary.status === "FAILED") return "Response failed";
	const duration = formatActivityDuration(summary.durationMs);
	return duration ? `Crafted response · ${duration}` : "Crafted response";
}

export function thinkingNarrative({
	running,
	hasError,
	entries,
}: {
	running: boolean;
	hasError: boolean;
	entries: AgentActivityEntry[];
}) {
	if (hasError) {
		return "The response is still saved. I’m reconnecting and will restore any missing activity before continuing.";
	}
	const toolCount = new Set(
		entries
			.filter((entry) => entry.category === "TOOL")
			.map((entry) => entry.activityId),
	).size;
	const agentCount = new Set(
		entries
			.filter((entry) => entry.category === "SUBAGENT")
			.map((entry) => entry.activityId),
	).size;
	if (!toolCount && !agentCount) {
		return running
			? "I’m reviewing your request and preparing a clear response."
			: "I reviewed your request and prepared the response shown below.";
	}
	const work = [
		toolCount
			? `${toolCount} ${toolCount === 1 ? "data source" : "data sources"}`
			: null,
		agentCount
			? `${agentCount} specialist ${agentCount === 1 ? "agent" : "agents"}`
			: null,
	]
		.filter(Boolean)
		.join(" and ");
	return running
		? `I’m reviewing ${work} so the answer stays grounded in verified Tradstry activity.`
		: `I reviewed ${work} and used only the safe activity listed here to prepare the response.`;
}
