import { describe, expect, test } from "bun:test";
import type {
	GraphQLFetcher,
	GraphQLSubscriber,
} from "@tradstry/app-ui/lib/client";
import type {
	AgentActionProposal,
	AgentActivityEntry,
	AgentActivitySummary,
	AgentMessage,
} from "@tradstry/app-ui/lib/types/agents";
import {
	approveAgentAction,
	fetchAgentContextSearch,
	fetchAgentMessageActivity,
	fetchAgentMessageActivitySummaries,
	fetchAgentMessages,
	rewriteAgentNotebook,
	sendAgentMessage,
	subscribeAgentRunActivity,
} from "./agents";

describe("agent GraphQL service", () => {
	test("searches all context groups within the active workspace", async () => {
		const calls: Array<{ query: string; variables?: Record<string, unknown> }> =
			[];
		const fetcher = (async <T>(
			query: string,
			variables?: Record<string, unknown>,
		) => {
			calls.push({ query, variables });
			return { agentContextSearch: [] } as T;
		}) as GraphQLFetcher;

		await expect(
			fetchAgentContextSearch(fetcher, "workspace-1", "aap"),
		).resolves.toEqual([]);
		expect(calls[0]?.query).toContain("query AgentContextSearch");
		expect(calls[0]?.query).toContain("metadataJson");
		expect(calls[0]?.variables).toEqual({
			workspaceId: "workspace-1",
			query: "aap",
			limit: 30,
		});
	});

	test("sends the complete message context and returns the durable run handle", async () => {
		const calls: Array<{
			query: string;
			variables?: Record<string, unknown>;
		}> = [];
		const fetcher = (async <T>(
			query: string,
			variables?: Record<string, unknown>,
		) => {
			calls.push({ query, variables });
			return {
				sendAgentMessage: {
					runId: "run-1",
					conversationId: "conversation-1",
					status: "QUEUED",
				},
			} as T;
		}) as GraphQLFetcher;

		const input = {
			conversationId: "conversation-1",
			content: "Review these trades",
			idempotencyKey: "request-1",
			context: {
				references: [
					{
						key: "playbook:playbook-1",
						kind: "PLAYBOOK" as const,
						id: "playbook-1",
						title: "Opening Range Breakout",
						subtitle: "Momentum",
					},
				],
				explicitIntent: "TRADE_LOOKUP" as const,
				tradeIds: ["trade-1"],
				playbookIds: ["playbook-1"],
				noteIds: ["note-1"],
				dateRange: { from: "2026-08-01", to: "2026-08-26" },
				marketSymbol: "AAPL",
				mediaIds: ["media-1"],
			},
		};

		await expect(sendAgentMessage(fetcher, input)).resolves.toEqual({
			runId: "run-1",
			conversationId: "conversation-1",
			status: "QUEUED",
		});
		expect(calls[0]?.query).toContain("mutation SendAgentMessage");
		expect(calls[0]?.variables).toEqual({ input });
	});

	test("requests message evidence and wires approval and assistance mutations", async () => {
		const calls: Array<{
			query: string;
			variables?: Record<string, unknown>;
		}> = [];
		const message = {
			id: "message-1",
			conversationId: "conversation-1",
			sequence: 2,
			role: "assistant",
			contentJson: "{}",
			sources: [],
			createdAt: "2026-08-26T00:00:00Z",
		} satisfies AgentMessage;
		const proposal = {
			id: "proposal-1",
			runId: "run-1",
			conversationId: "conversation-1",
			kind: "add_trade_tag",
			payloadJson: "{}",
			previewJson: "{}",
			status: "approved",
			expiresAt: "2026-08-26T00:15:00Z",
			createdAt: "2026-08-26T00:00:00Z",
			updatedAt: "2026-08-26T00:00:00Z",
		} satisfies AgentActionProposal;
		const fetcher = (async <T>(
			query: string,
			variables?: Record<string, unknown>,
		) => {
			calls.push({ query, variables });
			if (query.includes("AgentMessages")) {
				return { agentMessages: [message] } as T;
			}
			if (query.includes("ApproveAgentAction")) {
				return { approveAgentAction: proposal } as T;
			}
			return { agentNotebookRewrite: "Clearer text" } as T;
		}) as GraphQLFetcher;

		await expect(
			fetchAgentMessages(fetcher, "conversation-1", 20),
		).resolves.toEqual([message]);
		expect(calls[0]?.query).toContain("sources {");
		expect(calls[0]?.variables).toEqual({
			conversationId: "conversation-1",
			limit: 20,
		});

		await expect(
			approveAgentAction(fetcher, "proposal-1", "approve-1"),
		).resolves.toEqual(proposal);
		expect(calls[1]?.variables).toEqual({
			proposalId: "proposal-1",
			idempotencyKey: "approve-1",
		});

		await expect(
			rewriteAgentNotebook(fetcher, "SIMPLIFY", "Original text"),
		).resolves.toBe("Clearer text");
		expect(calls[2]?.variables).toEqual({
			action: "SIMPLIFY",
			text: "Original text",
		});
	});

	test("loads persistent activity and unwraps typed live entries", async () => {
		const summary = {
			messageId: "message-1",
			status: "COMPLETED",
			durationMs: 3200,
			modelCalls: 2,
			toolCalls: 1,
			subagentCount: 0,
			sourceCount: 1,
			hasFailures: false,
		} satisfies AgentActivitySummary;
		const entry = {
			sequence: 3,
			activityId: "tool:call-1",
			parentActivityId: null,
			category: "TOOL",
			status: "COMPLETED",
			label: "Loaded trading performance",
			detail: null,
			durationMs: 40,
			metadata: {
				symbol: null,
				recordCount: 5,
				dateRangeLabel: "Last 30 days",
				sourceCount: 1,
				retryable: null,
			},
			createdAt: "2026-08-28T00:00:00Z",
		} satisfies AgentActivityEntry;
		const calls: string[] = [];
		const fetcher = (async <T>(query: string) => {
			calls.push(query);
			if (query.includes("AgentMessageActivitySummaries")) {
				return { agentMessageActivitySummaries: [summary] } as T;
			}
			return { agentMessageActivity: { summary, entries: [entry] } } as T;
		}) as GraphQLFetcher;
		await expect(
			fetchAgentMessageActivitySummaries(fetcher, ["message-1"]),
		).resolves.toEqual([summary]);
		await expect(
			fetchAgentMessageActivity(fetcher, "message-1"),
		).resolves.toEqual({ summary, entries: [entry] });
		expect(calls.join("\n")).not.toContain("payloadJson");

		let capturedQuery = "";
		let capturedVariables: Record<string, unknown> | undefined;
		let capturedHandler:
			| ((data: { agentRunActivity: AgentActivityEntry }) => void)
			| undefined;
		const subscriber = (<T>(
			query: string,
			variables: Record<string, unknown> | undefined,
			handlers: { onMessage: (data: T) => void },
		) => {
			capturedQuery = query;
			capturedVariables = variables;
			capturedHandler = handlers.onMessage as (data: {
				agentRunActivity: AgentActivityEntry;
			}) => void;
			return () => {};
		}) as GraphQLSubscriber;
		const received: AgentActivityEntry[] = [];

		subscribeAgentRunActivity(subscriber, "run-1", 2, {
			onMessage: (value) => received.push(value),
		});
		capturedHandler?.({ agentRunActivity: entry });

		expect(capturedQuery).toContain("subscription AgentRunActivity");
		expect(capturedVariables).toEqual({ runId: "run-1", afterSequence: 2 });
		expect(received).toEqual([entry]);
	});
});
