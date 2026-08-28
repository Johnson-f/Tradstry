import { describe, expect, test } from "bun:test";
import type { AgentMessage } from "@tradstry/app-ui/lib/types/agents";
import { messageTextForClipboard, parseAgentMessage } from "./message-model";

function message(role: string, contentJson: string): AgentMessage {
	return {
		id: "message-1",
		conversationId: "conversation-1",
		sequence: 1,
		role,
		contentJson,
		sources: [],
		createdAt: "2026-08-27T00:00:00Z",
	};
}

describe("agent message model", () => {
	test("extracts user text from stored message content", () => {
		expect(
			parseAgentMessage(
				message("user", JSON.stringify({ text: "Review this" })),
			),
		).toEqual({ kind: "user", text: "Review this", contexts: [] });
	});

	test("restores the context attached to a user message", () => {
		expect(
			parseAgentMessage(
				message(
					"user",
					JSON.stringify({
						text: "Tell me about this playbook",
						context: {
							references: [
								{
									key: "playbook:playbook-1",
									kind: "playbook",
									id: "playbook-1",
									title: "Opening Range Breakout",
									subtitle: "Momentum",
								},
							],
						},
					}),
				),
			),
		).toEqual({
			kind: "user",
			text: "Tell me about this playbook",
			contexts: [
				{
					key: "playbook:playbook-1",
					kind: "PLAYBOOK",
					id: "playbook-1",
					title: "Opening Range Breakout",
					subtitle: "Momentum",
				},
			],
		});
	});

	test("keeps structured assistant blocks including action proposals", () => {
		const parsed = parseAgentMessage(
			message(
				"assistant",
				JSON.stringify({
					blocks: [
						{ kind: "paragraph", text: "Your win rate improved." },
						{ kind: "metric", label: "Win rate", value: "58%" },
						{ kind: "action_proposal", proposal_id: "proposal-1" },
					],
					claims: [],
				}),
			),
		);

		expect(parsed).toEqual({
			kind: "assistant",
			blocks: [
				{ kind: "paragraph", text: "Your win rate improved." },
				{ kind: "metric", label: "Win rate", value: "58%" },
				{ kind: "action_proposal", proposalId: "proposal-1" },
			],
		});
	});

	test("renders action-worker messages without exposing raw JSON", () => {
		expect(
			parseAgentMessage(
				message(
					"action",
					JSON.stringify({ proposalId: "proposal-1", status: "executed" }),
				),
			),
		).toEqual({ kind: "action", status: "executed" });
	});

	test("formats user and structured assistant messages for the clipboard", () => {
		expect(
			messageTextForClipboard({
				kind: "user",
				text: "Review this trade",
				contexts: [],
			}),
		).toBe("Review this trade");
		expect(
			messageTextForClipboard({
				kind: "assistant",
				blocks: [
					{ kind: "paragraph", text: "Your performance improved." },
					{ kind: "metric", label: "Win rate", value: "58%" },
					{
						kind: "list",
						title: "What helped",
						items: ["Smaller losses", "Better entries"],
					},
					{ kind: "warning", text: "The sample is small." },
					{ kind: "action_proposal", proposalId: "hidden-proposal-id" },
				],
			}),
		).toBe(
			"Your performance improved.\n\nWin rate: 58%\n\nWhat helped\n- Smaller losses\n- Better entries\n\nThe sample is small.",
		);
	});
});
