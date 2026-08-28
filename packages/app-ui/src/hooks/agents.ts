"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	useGraphQL,
	useGraphQLSubscription,
} from "@tradstry/app-ui/lib/client";
import * as agentService from "@tradstry/app-ui/lib/service/agents";
import type {
	AgentActivityEntry,
	AgentRewriteAction,
	SendAgentMessageInput,
} from "@tradstry/app-ui/lib/types/agents";
import { useAuth } from "@tradstry/app-ui/platform";
import { useEffect, useRef, useState } from "react";

export const agentKeys = {
	all: ["agents"] as const,
	capabilities: ["agents", "capabilities"] as const,
	conversations: (workspaceId: string | null) =>
		["agents", "conversations", workspaceId] as const,
	messages: (conversationId: string | null) =>
		["agents", "messages", conversationId] as const,
	run: (runId: string | null) => ["agents", "runs", runId] as const,
	activity: (messageId: string | null) =>
		["agents", "activity", messageId] as const,
	activitySummaries: (messageIds: string[]) =>
		["agents", "activity-summaries", ...messageIds] as const,
	memories: (workspaceId: string | null, includeInactive: boolean) =>
		["agents", "memories", workspaceId, includeInactive] as const,
	action: (proposalId: string | null) =>
		["agents", "actions", proposalId] as const,
	contextSearch: (workspaceId: string | null, query: string) =>
		["agents", "context-search", workspaceId, query] as const,
};

export function useAgentCapabilities() {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery({
		queryKey: agentKeys.capabilities,
		queryFn: () => agentService.fetchAgentCapabilities(fetcher),
		enabled: isLoaded && isSignedIn,
	});
}

export function useAgentConversations(workspaceId: string | null, limit = 50) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery({
		queryKey: [...agentKeys.conversations(workspaceId), limit],
		queryFn: () => {
			if (!workspaceId) throw new Error("Agent workspace is required");
			return agentService.fetchAgentConversations(fetcher, workspaceId, limit);
		},
		enabled: isLoaded && isSignedIn && !!workspaceId,
	});
}

export function useAgentContextSearch(
	workspaceId: string | null,
	query: string,
	enabled = true,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery({
		queryKey: agentKeys.contextSearch(workspaceId, query),
		queryFn: () => {
			if (!workspaceId) throw new Error("Agent workspace is required");
			return agentService.fetchAgentContextSearch(fetcher, workspaceId, query);
		},
		enabled: isLoaded && isSignedIn && !!workspaceId && enabled,
		placeholderData: (previous) => previous,
		staleTime: 15_000,
	});
}

export function useAgentMessages(conversationId: string | null, limit = 50) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery({
		queryKey: [...agentKeys.messages(conversationId), limit],
		queryFn: () => {
			if (!conversationId) throw new Error("Agent conversation is required");
			return agentService.fetchAgentMessages(fetcher, conversationId, limit);
		},
		enabled: isLoaded && isSignedIn && !!conversationId,
	});
}

export function useAgentRun(runId: string | null) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery({
		queryKey: agentKeys.run(runId),
		queryFn: () => {
			if (!runId) throw new Error("Agent run is required");
			return agentService.fetchAgentRun(fetcher, runId);
		},
		enabled: isLoaded && isSignedIn && !!runId,
	});
}

export function useAgentMessageActivity(
	messageId: string | null,
	enabled = true,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery({
		queryKey: agentKeys.activity(messageId),
		queryFn: () => {
			if (!messageId) throw new Error("Agent message is required");
			return agentService.fetchAgentMessageActivity(fetcher, messageId);
		},
		enabled: isLoaded && isSignedIn && !!messageId && enabled,
	});
}

export function useAgentMessageActivitySummaries(messageIds: string[]) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery({
		queryKey: agentKeys.activitySummaries(messageIds),
		queryFn: () =>
			agentService.fetchAgentMessageActivitySummaries(fetcher, messageIds),
		enabled: isLoaded && isSignedIn && messageIds.length > 0,
		placeholderData: (previous) => previous,
	});
}

export function useAgentMemories(
	workspaceId?: string,
	includeInactive = false,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	return useQuery({
		queryKey: agentKeys.memories(workspaceId ?? null, includeInactive),
		queryFn: () =>
			agentService.fetchAgentMemories(fetcher, workspaceId, includeInactive),
		enabled: isLoaded && isSignedIn,
	});
}

export function useAgentActionProposal(proposalId: string | null) {
	const { isLoaded, isSignedIn } = useAuth();
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey: agentKeys.action(proposalId),
		queryFn: () => {
			if (!proposalId) throw new Error("Agent action proposal is required");
			return agentService.fetchAgentActionProposal(fetcher, proposalId);
		},
		enabled: isLoaded && isSignedIn && !!proposalId,
		refetchInterval: ({ state }) =>
			state.data?.status === "approved" ? 2_000 : false,
	});

	useEffect(() => {
		const proposal = query.data;
		if (!proposal || !["executed", "failed"].includes(proposal.status)) return;
		void queryClient.invalidateQueries({
			queryKey: agentKeys.messages(proposal.conversationId),
		});
	}, [query.data, queryClient]);

	return query;
}

export function useAgentRunActivity(
	runId: string | null,
	conversationId: string | null,
	afterSequence = 0,
) {
	const { isLoaded, isSignedIn } = useAuth();
	const subscriber = useGraphQLSubscription();
	const queryClient = useQueryClient();
	const [entries, setEntries] = useState<AgentActivityEntry[]>([]);
	const [error, setError] = useState<Error | null>(null);
	const [isComplete, setIsComplete] = useState(false);
	const [reconnectAttempt, setReconnectAttempt] = useState(0);
	const lastSequence = useRef(afterSequence);
	const activeRunId = useRef(runId);

	useEffect(() => {
		activeRunId.current = runId;
		setEntries([]);
		setError(null);
		setIsComplete(false);
		setReconnectAttempt(0);
		lastSequence.current = afterSequence;
	}, [afterSequence, runId]);

	useEffect(() => {
		if (!isLoaded || !isSignedIn || !runId) return;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
		setError(null);
		const unsubscribe = agentService.subscribeAgentRunActivity(
			subscriber,
			runId,
			lastSequence.current,
			{
				onMessage: (entry) => {
					if (activeRunId.current !== runId) return;
					lastSequence.current = Math.max(lastSequence.current, entry.sequence);
					setEntries((current) => {
						if (current.some((item) => item.sequence === entry.sequence)) {
							return current;
						}
						return [...current, entry].sort(
							(left, right) => left.sequence - right.sequence,
						);
					});
					void queryClient.invalidateQueries({
						queryKey: agentKeys.run(runId),
					});
				},
				onError: (nextError) => {
					if (activeRunId.current !== runId) return;
					setError(nextError);
					reconnectTimer = setTimeout(
						() => setReconnectAttempt((attempt) => attempt + 1),
						Math.min(5_000, 1_000 * 2 ** reconnectAttempt),
					);
				},
				onComplete: () => {
					setIsComplete(true);
					void queryClient.invalidateQueries({
						queryKey: agentKeys.run(runId),
					});
					if (conversationId) {
						void queryClient.invalidateQueries({
							queryKey: agentKeys.messages(conversationId),
						});
					}
				},
			},
		);
		return () => {
			if (reconnectTimer) clearTimeout(reconnectTimer);
			unsubscribe();
		};
	}, [
		conversationId,
		isLoaded,
		isSignedIn,
		queryClient,
		reconnectAttempt,
		runId,
		subscriber,
	]);

	return { entries, error, isComplete };
}

export function useCreateAgentConversation() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (workspaceId: string) =>
			agentService.createAgentConversation(fetcher, workspaceId),
		onSuccess: (conversation) => {
			void queryClient.invalidateQueries({
				queryKey: agentKeys.conversations(conversation.workspaceId),
			});
		},
	});
}

export function useRenameAgentConversation() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { conversationId: string; title: string }) =>
			agentService.renameAgentConversation(
				fetcher,
				input.conversationId,
				input.title,
			),
		onSuccess: (conversation) => {
			void queryClient.invalidateQueries({
				queryKey: agentKeys.conversations(conversation.workspaceId),
			});
		},
	});
}

export function useDeleteAgentConversation(workspaceId: string | null) {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (conversationId: string) =>
			agentService.deleteAgentConversation(fetcher, conversationId),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: agentKeys.conversations(workspaceId),
			});
		},
	});
}

export function useSendAgentMessage() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SendAgentMessageInput) =>
			agentService.sendAgentMessage(fetcher, input),
		onSuccess: (handle) => {
			void queryClient.invalidateQueries({
				queryKey: agentKeys.messages(handle.conversationId),
			});
			void queryClient.invalidateQueries({
				queryKey: ["agents", "conversations"],
			});
		},
	});
}

export function useCancelAgentRun() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (runId: string) => agentService.cancelAgentRun(fetcher, runId),
		onSettled: (_result, _error, runId) => {
			void queryClient.invalidateQueries({ queryKey: agentKeys.run(runId) });
		},
	});
}

function refreshMemories(queryClient: ReturnType<typeof useQueryClient>) {
	void queryClient.invalidateQueries({
		queryKey: ["agents", "memories"],
	});
}

export function useUpdateAgentMemory() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; text: string }) =>
			agentService.updateAgentMemory(fetcher, input.id, input.text),
		onSuccess: () => refreshMemories(queryClient),
	});
}

export function useSetAgentMemoryPinned() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { id: string; pinned: boolean }) =>
			agentService.setAgentMemoryPinned(fetcher, input.id, input.pinned),
		onSuccess: () => refreshMemories(queryClient),
	});
}

export function useForgetAgentMemory() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => agentService.forgetAgentMemory(fetcher, id),
		onSuccess: () => refreshMemories(queryClient),
	});
}

export function useApproveAgentAction() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { proposalId: string; idempotencyKey: string }) =>
			agentService.approveAgentAction(
				fetcher,
				input.proposalId,
				input.idempotencyKey,
			),
		onSuccess: (proposal) => {
			queryClient.setQueryData(agentKeys.action(proposal.id), proposal);
			void queryClient.invalidateQueries({
				queryKey: agentKeys.messages(proposal.conversationId),
			});
		},
	});
}

export function useRejectAgentAction() {
	const fetcher = useGraphQL();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (proposalId: string) =>
			agentService.rejectAgentAction(fetcher, proposalId),
		onSuccess: (proposal) => {
			queryClient.setQueryData(agentKeys.action(proposal.id), proposal);
		},
	});
}

export function useAgentNotebookAutocomplete() {
	const fetcher = useGraphQL();
	return useMutation({
		mutationFn: (input: { title: string; text: string }) =>
			agentService.autocompleteAgentNotebook(fetcher, input.title, input.text),
	});
}

export function useAgentNotebookRewrite() {
	const fetcher = useGraphQL();
	return useMutation({
		mutationFn: (input: { action: AgentRewriteAction; text: string }) =>
			agentService.rewriteAgentNotebook(fetcher, input.action, input.text),
	});
}
