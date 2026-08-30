import type {
	AgentActivityCategory,
	AgentActivityEntry,
	AgentActivityStatus,
	AgentRunStatus,
} from "@tradstry/app-ui/lib/types/agents";
import { foldActivityEntries } from "./activity-model";

const POSITIONS = [
	{ x: 28, y: 28 },
	{ x: 28, y: 78 },
	{ x: 92, y: 20 },
	{ x: 92, y: 86 },
	{ x: 158, y: 53 },
] as const;

export interface ActivityNeuralNode {
	activityId: string;
	parentActivityId: string | null;
	category: AgentActivityCategory;
	status: AgentActivityStatus;
	label: string;
	x: number;
	y: number;
	ordinal: number;
}

export type ActivityHubStatus =
	| AgentActivityStatus
	| "WAITING"
	| "RECONNECTING"
	| "LOADING";

export interface ActivityNeuralGraph {
	nodes: ActivityNeuralNode[];
	hubStatus: ActivityHubStatus;
	summary: string;
	omittedCount: number;
}

export function buildActivityNeuralGraph(
	entries: AgentActivityEntry[],
	runStatus: AgentRunStatus,
	{
		reconnecting = false,
		loading = false,
	}: { reconnecting?: boolean; loading?: boolean } = {},
): ActivityNeuralGraph {
	const activities = foldActivityEntries(entries, runStatus);
	const offset = Math.max(0, activities.length - POSITIONS.length);
	const nodes = activities.slice(offset).map((entry, index) => ({
		activityId: entry.activityId,
		parentActivityId: entry.parentActivityId,
		category: entry.category,
		status: entry.status,
		label: entry.label,
		ordinal: offset + index + 1,
		...(POSITIONS[(offset + index) % POSITIONS.length] ?? POSITIONS[0]),
	}));

	const running = runStatus === "RUNNING" || runStatus === "QUEUED";
	if (!nodes.length && running && !loading) {
		nodes.push({
			activityId: "request",
			parentActivityId: null,
			category: "SYSTEM",
			status: "STARTED",
			label: runStatus === "QUEUED" ? "Waiting to start" : "Reviewing request",
			ordinal: 0,
			...POSITIONS[2],
		});
	}

	const active = [...nodes].reverse().find((node) => node.status === "STARTED");
	let hubStatus: ActivityHubStatus = running ? "STARTED" : "COMPLETED";
	let summary = running
		? (active?.label ?? "Preparing the response")
		: activities.length
			? `${activities.length} ${activities.length === 1 ? "activity" : "activities"} recorded`
			: "No saved activity";
	if (runStatus === "FAILED") {
		hubStatus = "FAILED";
		summary = "Response failed";
	} else if (runStatus === "CANCELLED") {
		hubStatus = "CANCELLED";
		summary = "Response cancelled";
	} else if (runStatus === "WAITING_FOR_APPROVAL") {
		hubStatus = "WAITING";
		summary = "Waiting for approval";
	}
	if (loading) {
		hubStatus = "LOADING";
		summary = "Loading saved activity";
	} else if (reconnecting) {
		hubStatus = "RECONNECTING";
		summary = "Reconnecting to activity";
	}
	return { nodes, hubStatus, summary, omittedCount: offset };
}
