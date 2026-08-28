import { create } from "zustand";
import type { AgentContextSearchResult } from "@tradstry/app-ui/lib/types/agents";

type ActiveRun = {
	runId: string;
	conversationId: string;
};

type AgentPanelState = {
	open: boolean;
	historyOpen: boolean;
	selectedByWorkspace: Record<string, string | undefined>;
	newChatByWorkspace: Record<string, boolean | undefined>;
	drafts: Record<string, string | undefined>;
	contexts: Record<string, AgentContextSearchResult[] | undefined>;
	activeRuns: Record<string, ActiveRun | undefined>;
	setOpen: (open: boolean) => void;
	toggleOpen: () => void;
	setHistoryOpen: (open: boolean) => void;
	selectConversation: (workspaceId: string, conversationId: string) => void;
	startNewChat: (workspaceId: string) => void;
	setDraft: (key: string, value: string) => void;
	setContexts: (key: string, value: AgentContextSearchResult[]) => void;
	setActiveRun: (conversationId: string, run: ActiveRun | undefined) => void;
	removeConversation: (
		workspaceId: string,
		conversationId: string,
		fallbackId: string | null,
	) => void;
};

export const useAgentPanelStore = create<AgentPanelState>((set) => ({
	open: false,
	historyOpen: false,
	selectedByWorkspace: {},
	newChatByWorkspace: {},
	drafts: {},
	contexts: {},
	activeRuns: {},
	setOpen: (open) =>
		set((state) => ({
			open,
			historyOpen: open ? state.historyOpen : false,
		})),
	toggleOpen: () =>
		set((state) => ({
			open: !state.open,
			historyOpen: state.open ? false : state.historyOpen,
		})),
	setHistoryOpen: (historyOpen) => set({ historyOpen }),
	selectConversation: (workspaceId, conversationId) =>
		set((state) => ({
			selectedByWorkspace: {
				...state.selectedByWorkspace,
				[workspaceId]: conversationId,
			},
			newChatByWorkspace: {
				...state.newChatByWorkspace,
				[workspaceId]: false,
			},
		})),
	startNewChat: (workspaceId) =>
		set((state) => ({
			selectedByWorkspace: {
				...state.selectedByWorkspace,
				[workspaceId]: undefined,
			},
			newChatByWorkspace: {
				...state.newChatByWorkspace,
				[workspaceId]: true,
			},
			historyOpen: false,
		})),
	setDraft: (key, value) =>
		set((state) => ({ drafts: { ...state.drafts, [key]: value } })),
	setContexts: (key, value) =>
		set((state) => ({ contexts: { ...state.contexts, [key]: value } })),
	setActiveRun: (conversationId, run) =>
		set((state) => ({
			activeRuns: { ...state.activeRuns, [conversationId]: run },
		})),
	removeConversation: (workspaceId, conversationId, fallbackId) =>
		set((state) => {
			const drafts = { ...state.drafts };
			const contexts = { ...state.contexts };
			const activeRuns = { ...state.activeRuns };
			delete drafts[conversationId];
			delete contexts[conversationId];
			delete activeRuns[conversationId];
			const wasSelected =
				state.selectedByWorkspace[workspaceId] === conversationId;
			return {
				drafts,
				contexts,
				activeRuns,
				selectedByWorkspace: wasSelected
					? {
							...state.selectedByWorkspace,
							[workspaceId]: fallbackId ?? undefined,
						}
					: state.selectedByWorkspace,
				newChatByWorkspace: wasSelected
					? {
							...state.newChatByWorkspace,
							[workspaceId]: fallbackId === null,
						}
					: state.newChatByWorkspace,
			};
		}),
}));
