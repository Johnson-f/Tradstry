"use client";

import * as React from "react";
import {
	useBrokenJoins,
	useContinuationSuggestions,
	useHoldingsMismatches,
	useJournalTrades,
	useOrphanedNotes,
} from "@tradstry/app-ui/hooks/journal-review";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";
import { attentionCount, attentionItems } from "./journal-attention-model";

function readDismissed(key: string): string[] {
	try {
		const value = JSON.parse(sessionStorage.getItem(key) ?? "[]");
		return Array.isArray(value) ? value : [];
	} catch {
		return [];
	}
}

export function useJournalAttention(workspaceId: string) {
	const owner = useTradstryPlatform().user.email;
	const storageKey = `tradstry:journal-waiting:${owner}:${workspaceId}`;
	const trades = useJournalTrades(workspaceId);
	const mismatches = useHoldingsMismatches(workspaceId);
	const continuations = useContinuationSuggestions(workspaceId);
	const orphans = useOrphanedNotes(workspaceId);
	const brokenJoins = useBrokenJoins(workspaceId);
	const [dismissed, setDismissed] = React.useState<string[]>([]);
	React.useEffect(() => setDismissed(readDismissed(storageKey)), [storageKey]);
	const items = React.useMemo(
		() =>
			attentionItems({
				trades: trades.data ?? [],
				mismatches: mismatches.data ?? [],
				continuations: continuations.data ?? [],
				brokenJoins: brokenJoins.data ?? [],
				orphans: orphans.data ?? [],
				dismissed,
			}),
		[trades.data, mismatches.data, continuations.data, brokenJoins.data, orphans.data, dismissed],
	);
	const wait = (key: string) => {
		const next = [...dismissed, key];
		setDismissed(next);
		try {
			sessionStorage.setItem(storageKey, JSON.stringify(next));
		} catch {
			// Waiting still applies until the page reloads.
		}
	};
	return {
		items,
		count: attentionCount(items),
		loading: trades.isLoading || mismatches.isLoading || continuations.isLoading,
		failed: trades.isError || mismatches.isError || continuations.isError || orphans.isError || brokenJoins.isError,
		wait,
	};
}
