import { beforeEach, describe, expect, test } from "bun:test";
import { useAgentPanelStore } from "./store";

beforeEach(() => {
	useAgentPanelStore.setState({
		open: false,
		historyOpen: false,
		selectedByWorkspace: {},
		newChatByWorkspace: {},
		drafts: {},
		contexts: {},
		activeRuns: {},
	});
});

describe("agent panel store", () => {
	test("keeps panel and history state independent", () => {
		useAgentPanelStore.getState().setOpen(true);
		useAgentPanelStore.getState().setHistoryOpen(true);
		expect(useAgentPanelStore.getState()).toMatchObject({
			open: true,
			historyOpen: true,
		});

		useAgentPanelStore.getState().setOpen(false);
		expect(useAgentPanelStore.getState()).toMatchObject({
			open: false,
			historyOpen: false,
		});
	});

	test("preserves workspace selection, drafts, and active runs", () => {
		const store = useAgentPanelStore.getState();
		store.selectConversation("workspace-1", "conversation-1");
		store.setDraft("conversation-1", "Review my execution");
		store.setContexts("conversation-1", [
			{
				key: "trade:trade-1",
				kind: "TRADE",
				id: "trade-1",
				title: "AAPL",
				subtitle: "Apple",
				metadataJson: "{}",
			},
		]);
		store.setActiveRun("conversation-1", {
			runId: "run-1",
			conversationId: "conversation-1",
		});

		expect(useAgentPanelStore.getState()).toMatchObject({
			selectedByWorkspace: { "workspace-1": "conversation-1" },
			newChatByWorkspace: { "workspace-1": false },
			drafts: { "conversation-1": "Review my execution" },
			contexts: {
				"conversation-1": [
					{
						key: "trade:trade-1",
						kind: "TRADE",
						id: "trade-1",
						title: "AAPL",
						subtitle: "Apple",
						metadataJson: "{}",
					},
				],
			},
			activeRuns: {
				"conversation-1": {
					runId: "run-1",
					conversationId: "conversation-1",
				},
			},
		});

		useAgentPanelStore.getState().startNewChat("workspace-1");
		expect(
			useAgentPanelStore.getState().newChatByWorkspace["workspace-1"],
		).toBe(true);
		expect(
			useAgentPanelStore.getState().selectedByWorkspace["workspace-1"],
		).toBeUndefined();
	});

	test("removes deleted chat state and selects the fallback", () => {
		const store = useAgentPanelStore.getState();
		store.selectConversation("workspace-1", "conversation-1");
		store.setDraft("conversation-1", "draft");
		store.setContexts("conversation-1", [
			{
				key: "note:note-1",
				kind: "NOTE",
				id: "note-1",
				title: "Review",
				subtitle: "Updated today",
				metadataJson: "{}",
			},
		]);
		store.setActiveRun("conversation-1", {
			runId: "run-1",
			conversationId: "conversation-1",
		});

		useAgentPanelStore
			.getState()
			.removeConversation("workspace-1", "conversation-1", "conversation-2");

		expect(useAgentPanelStore.getState()).toMatchObject({
			selectedByWorkspace: { "workspace-1": "conversation-2" },
			newChatByWorkspace: { "workspace-1": false },
			drafts: {},
			contexts: {},
			activeRuns: {},
		});
	});
});
