"use client";

import * as React from "react";
import { useJournalSave } from "@tradstry/app-ui/hooks/journal-flow-save";
import * as flow from "@tradstry/app-ui/lib/service/journal-flow";
import { useGraphQL, useTradstryPlatform } from "@tradstry/app-ui/platform";
import type { DetailData } from "./trade-types";

export const STOP_PRICE_ERROR = "Enter a positive stop price, or choose Not recorded.";

export function validateStop(value: { stopState: string; stopPrice: string | null }) {
	return value.stopState === "price" &&
		(!value.stopPrice ||
			!/^\d+(?:\.\d{1,28})?$/.test(value.stopPrice) ||
			Number(value.stopPrice) <= 0)
		? STOP_PRICE_ERROR
		: null;
}

export function useTradeReview({
	workspaceId,
	trade,
	data,
	sessionId,
	refresh,
	onChanged,
	onReviewed,
}: {
	workspaceId: string;
	trade: flow.JournalTrade;
	data: DetailData;
	sessionId?: string;
	refresh: () => Promise<DetailData | undefined>;
	onChanged: () => void | Promise<void>;
	onReviewed?: () => void | Promise<void>;
}) {
	const fetcher = useGraphQL();
	const owner = useTradstryPlatform().user.email;
	const [error, setError] = React.useState<string | null>(null);
	const [marking, setMarking] = React.useState(false);
	const [stopTouched, setStopTouched] = React.useState(false);
	const stopInputRef = React.useRef<HTMLInputElement>(null);
	const context = useJournalSave({
		storageKey: `tradstry:journal-context:${owner}:${workspaceId}:${trade.id}`,
		owner,
		initial: {
			stopState: data.journalContextV2.stopState,
			stopPrice: data.journalContextV2.stopPrice,
			playbookId: data.journalContextV2.playbookId,
			claimedAt: data.journalContextV2.claimedAt,
			notes: data.journalContextV2.notes ?? "",
			tagIds: data.journalContextV2.tagIds ?? [],
			violatedPrincipleIds: data.journalContextV2.violatedPrincipleIds ?? [],
		},
		version: data.journalContextV2.version,
		query: flow.SAVE_CONTEXT,
		field: "saveJournalContext",
		variables: { workspaceId },
		validate: validateStop,
		toInput: (value, version) => ({
			entryId: trade.id,
			expectedVersion: version,
			...value,
		}),
	});
	const draft = useJournalSave({
		storageKey: `tradstry:journal-review:${owner}:${workspaceId}:${trade.id}`,
		owner,
		initial: {
			takeaway: data.journalReviewDraftV2.takeaway,
			choiceIds: data.journalReviewDraftV2.choiceIds,
			planAdherence: data.journalReviewDraftV2.planAdherence,
		},
		version: data.journalReviewDraftV2.version,
		query: flow.SAVE_DRAFT,
		field: "saveJournalReviewDraft",
		variables: { workspaceId },
		toInput: (value, version) => ({
			entryId: trade.id,
			expectedVersion: version,
			...value,
		}),
	});
	const stopError = validateStop(context.value);
	const markerKey = `tradstry:journal-mark:${owner}:${workspaceId}:${trade.id}`;
	const [pendingReview, setPendingReview] = React.useState(() => {
		try {
			return !!localStorage.getItem(markerKey);
		} catch {
			return false;
		}
	});
	const focusStop = () => {
		setStopTouched(true);
		requestAnimationFrame(() => stopInputRef.current?.focus());
	};
	const markReviewed = async () => {
		if (!pendingReview && stopError) return focusStop();
		setMarking(true);
		setError(null);
		try {
			const cached = localStorage.getItem(markerKey);
			let request: flow.Command;
			if (cached) request = JSON.parse(cached) as flow.Command;
			else {
				const [contextVersion, draftVersion] = await Promise.all([
					context.flush(),
					draft.flush(),
				]);
				request = flow.command(
					flow.MARK_REVIEWED,
					"markJournalTradeReviewed",
					{
						workspaceId,
						input: {
							entryId: trade.id,
							expectedEntryRevision: trade.materializedRevision,
							expectedContextVersion: contextVersion,
							expectedDraftVersion: draftVersion,
							sessionId: sessionId ?? null,
						},
					},
					owner,
				);
				localStorage.setItem(markerKey, JSON.stringify(request));
				setPendingReview(true);
			}
			await flow.execute(fetcher, request);
			localStorage.removeItem(markerKey);
			setPendingReview(false);
			await onChanged();
			await refresh();
			await onReviewed?.();
		} catch (reason) {
			const message =
				reason instanceof Error
					? reason.message
					: "Your review has not been confirmed. Retry to check its status.";
			if (message === STOP_PRICE_ERROR) focusStop();
			else setError(message);
			if (message.includes("CONFLICT") || message.includes("REPREVIEW_REQUIRED")) {
				localStorage.removeItem(markerKey);
				setPendingReview(false);
				await refresh();
			}
		} finally {
			setMarking(false);
		}
	};
	const retryReview = React.useRef(markReviewed);
	retryReview.current = markReviewed;
	React.useEffect(() => {
		if (!pendingReview) return;
		const retry = () => {
			void retryReview.current();
		};
		window.addEventListener("online", retry);
		return () => window.removeEventListener("online", retry);
	}, [pendingReview]);
	const resolveConflict = async (kind: "context" | "draft") => {
		const latest = await refresh();
		if (!latest) return;
		if (kind === "context")
			context.useLatestVersion(latest.journalContextV2.version);
		else draft.useLatestVersion(latest.journalReviewDraftV2.version);
	};
	const hasReviewWork = Boolean(
		context.value.notes.trim() ||
			context.value.tagIds.length ||
			context.value.violatedPrincipleIds.length ||
			draft.value.takeaway.trim() ||
			draft.value.choiceIds.length ||
			draft.value.planAdherence,
	);
	return {
		context,
		draft,
		error,
		setError,
		marking,
		pendingReview,
		markReviewed,
		resolveConflict,
		hasReviewWork,
		stopError,
		stopTouched,
		setStopTouched,
		stopInputRef,
	};
}

export type TradeReview = ReturnType<typeof useTradeReview>;
