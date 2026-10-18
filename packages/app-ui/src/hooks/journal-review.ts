"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import * as flow from "@tradstry/app-ui/lib/service/journal-flow";

function useJournalKey(workspaceId: string) {
	const { user } = useTradstryPlatform();
	return ["journal-flow", user.email, workspaceId] as const;
}

export function useJournalStatus(workspaceId: string, refetchInterval?: number) {
	const fetcher = useGraphQL();
	const base = useJournalKey(workspaceId);
	return useQuery({
		queryKey: [...base, "status"],
		queryFn: () => flow.status(fetcher, workspaceId),
		refetchInterval,
	});
}

export function useTradeDetail(workspaceId: string, entryId: string) {
	const fetcher = useGraphQL();
	const base = useJournalKey(workspaceId);
	return useQuery({
		queryKey: [...base, "detail", entryId],
		queryFn: () => flow.detail(fetcher, workspaceId, entryId),
		refetchInterval: 15_000,
	});
}

export function useRefreshJournal(workspaceId: string) {
	const cache = useQueryClient();
	const base = useJournalKey(workspaceId);
	return () => cache.invalidateQueries({ queryKey: base });
}

export function useJournalTrades(workspaceId: string) {
	const fetcher = useGraphQL();
	const base = useJournalKey(workspaceId);
	return useQuery({
		queryKey: [...base, "trades"],
		queryFn: () => flow.trades(fetcher, workspaceId),
		refetchInterval: 15_000,
	});
}

export function useTradeActions(workspaceId: string, entryId: string, enabled = true) {
	const fetcher = useGraphQL();
	const base = useJournalKey(workspaceId);
	return useQuery({
		queryKey: [...base, "actions", entryId],
		queryFn: () => flow.tradeActions(fetcher, workspaceId, entryId),
		refetchInterval: 15_000,
		enabled,
	});
}

export function useTradeOutcome(workspaceId: string, entryId: string, enabled = true) {
	const fetcher = useGraphQL();
	const base = useJournalKey(workspaceId);
	return useQuery({
		queryKey: [...base, "outcome", entryId],
		queryFn: () => flow.tradeOutcome(fetcher, workspaceId, entryId),
		enabled,
	});
}

export function useHoldingsMismatches(workspaceId: string) {
	const fetcher = useGraphQL();
	const base = useJournalKey(workspaceId);
	return useQuery({
		queryKey: [...base, "holdings-mismatches"],
		queryFn: () => flow.holdingsMismatches(fetcher, workspaceId),
	});
}

export function useContinuationSuggestions(workspaceId: string) {
	const fetcher = useGraphQL();
	const base = useJournalKey(workspaceId);
	return useQuery({
		queryKey: [...base, "continuations"],
		queryFn: () => flow.continuationSuggestions(fetcher, workspaceId),
	});
}

export function useOrphanedNotes(workspaceId: string) {
	const fetcher = useGraphQL();
	const base = useJournalKey(workspaceId);
	return useQuery({
		queryKey: [...base, "orphaned-notes"],
		queryFn: () => flow.orphanedNotes(fetcher, workspaceId),
	});
}

export function useBrokenJoins(workspaceId: string) {
	const fetcher = useGraphQL();
	const base = useJournalKey(workspaceId);
	return useQuery({
		queryKey: [...base, "broken-joins"],
		queryFn: () => flow.brokenJoins(fetcher, workspaceId),
	});
}

export function useKeepOrphanedNote(workspaceId: string) {
	return useJournalMutation<{ noteId: string }, boolean>(
		workspaceId,
		flow.KEEP_ORPHANED_NOTE,
		"keepJournalOrphanedNote",
	);
}

export function useReviewSession(
	workspaceId: string,
	date: string | null,
	enabled = true,
) {
	const fetcher = useGraphQL();
	const base = useJournalKey(workspaceId);
	const owner = base[1];
	return useQuery({
		queryKey: [...base, "review-session", date ?? "latest"],
		queryFn: () =>
			flow.execute<flow.ReviewSession | null>(
				fetcher,
				flow.command(
					flow.OPEN_SESSION,
					"openJournalReviewSession",
					{ workspaceId, date, refresh: false, expectedVersion: null },
					owner,
				),
			),
		staleTime: 30_000,
		refetchOnWindowFocus: false,
		enabled,
	});
}

function useJournalMutation<V extends object, R>(
	workspaceId: string,
	query: string,
	field: string,
) {
	const fetcher = useGraphQL();
	const cache = useQueryClient();
	const base = useJournalKey(workspaceId);
	return useMutation({
		mutationFn: (variables: V) =>
			flow.execute<R>(
				fetcher,
				flow.command(query, field, { workspaceId, ...variables }, base[1]),
			),
		onSuccess: () => cache.invalidateQueries({ queryKey: base }),
	});
}

export function useRefreshReviewSession(workspaceId: string) {
	return useJournalMutation<
		{ date: string; expectedVersion: number; refresh: true },
		flow.ReviewSession | null
	>(workspaceId, flow.OPEN_SESSION, "openJournalReviewSession");
}

export function useMoveReviewCursor(workspaceId: string) {
	return useJournalMutation<
		{ sessionId: string; entryId: string; expectedVersion: number },
		number
	>(workspaceId, flow.MOVE_CURSOR, "moveJournalReviewCursor");
}

export function useSaveActionNote(workspaceId: string) {
	return useJournalMutation<{ input: flow.ActionNoteInput }, flow.ActionNote>(
		workspaceId,
		flow.SAVE_ACTION_NOTE,
		"saveJournalActionNote",
	);
}

export function useAddHindsightNote(workspaceId: string) {
	return useJournalMutation<
		{ parentId: string; reason: string },
		flow.ActionNote
	>(workspaceId, flow.ADD_HINDSIGHT_NOTE, "addJournalHindsightNote");
}

export function useJoinActions(workspaceId: string) {
	return useJournalMutation<
		{ entryId: string; executionIds: string[] },
		string
	>(workspaceId, flow.JOIN_ACTIONS, "joinJournalActions");
}

export function useUnjoinActions(workspaceId: string) {
	return useJournalMutation<{ joinId: string }, boolean>(
		workspaceId,
		flow.UNJOIN_ACTIONS,
		"unjoinJournalActions",
	);
}

export function useAnswerContinuation(workspaceId: string) {
	return useJournalMutation<
		{ executionId: string; openingExecutionId: string; samePosition: boolean },
		boolean
	>(workspaceId, flow.ANSWER_CONTINUATION, "answerJournalContinuation");
}

export function useSkipTradeReview(workspaceId: string) {
	return useJournalMutation<
		{ entryId: string; reason: flow.SkipReason; sessionId: string | null },
		boolean
	>(workspaceId, flow.SKIP_REVIEW, "skipJournalTradeReview");
}

export function useUnskipTradeReview(workspaceId: string) {
	return useJournalMutation<{ entryId: string }, boolean>(
		workspaceId,
		flow.UNSKIP_REVIEW,
		"unskipJournalTradeReview",
	);
}
