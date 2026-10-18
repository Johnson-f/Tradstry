import type {
	ActionNote,
	BrokenJoin,
	ContinuationSuggestion,
	HoldingsMismatch,
	JournalTrade,
} from "@tradstry/app-ui/lib/service/journal-flow";

export type AttentionItem =
	| { kind: "continuation"; id: string; suggestion: ContinuationSuggestion }
	| { kind: "holdings"; id: string; mismatch: HoldingsMismatch }
	| { kind: "history"; id: string; trade: JournalTrade }
	| { kind: "duplicate"; id: string; trade: JournalTrade }
	| { kind: "outdated"; id: string; trade: JournalTrade }
	| { kind: "broken-join"; id: string; join: BrokenJoin }
	| { kind: "orphan"; id: string; note: ActionNote };

export const holdingsKey = (mismatch: HoldingsMismatch) =>
	`${mismatch.instrumentKey}:${mismatch.held}:${mismatch.imported}`;

export const continuationKey = (suggestion: ContinuationSuggestion) =>
	`${suggestion.executionId}:${suggestion.openingExecutionId}`;

export function attentionItems({
	trades,
	mismatches,
	continuations,
	brokenJoins = [],
	orphans,
	dismissed,
}: {
	trades: JournalTrade[];
	mismatches: HoldingsMismatch[];
	continuations: ContinuationSuggestion[];
	brokenJoins?: BrokenJoin[];
	orphans: ActionNote[];
	dismissed: string[];
}): AttentionItem[] {
	const current = trades.filter((trade) => !trade.retiredAt);
	const incomplete = current.filter((trade) => trade.lifecycleState === "incomplete");
	return [
		...continuations.map((suggestion) => ({ kind: "continuation" as const, id: `continuation:${continuationKey(suggestion)}`, suggestion })),
		...mismatches
			.filter((mismatch) => !dismissed.includes(holdingsKey(mismatch)))
			.map((mismatch) => ({ kind: "holdings" as const, id: `holdings:${holdingsKey(mismatch)}`, mismatch })),
		...incomplete
			.filter((trade) => trade.issueCode !== "possible_duplicate")
			.map((trade) => ({ kind: "history" as const, id: `history:${trade.id}`, trade })),
		...incomplete
			.filter((trade) => trade.issueCode === "possible_duplicate")
			.map((trade) => ({ kind: "duplicate" as const, id: `duplicate:${trade.id}`, trade })),
		...current
			.filter((trade) => trade.reviewState === "outdated")
			.map((trade) => ({ kind: "outdated" as const, id: `outdated:${trade.id}`, trade })),
		...brokenJoins.map((join) => ({ kind: "broken-join" as const, id: `broken-join:${join.joinId}`, join })),
		...orphans.map((note) => ({ kind: "orphan" as const, id: `orphan:${note.id}`, note })),
	];
}

export function attentionCount(items: AttentionItem[]) {
	return items.length;
}

export function itemsForTrade(
	items: AttentionItem[],
	entryId: string,
	executionIds: string[],
) {
	return {
		holdings: items.filter(
			(item): item is Extract<AttentionItem, { kind: "holdings" }> =>
				item.kind === "holdings" && item.mismatch.entryId === entryId,
		),
		continuations: items.filter(
			(item): item is Extract<AttentionItem, { kind: "continuation" }> =>
				item.kind === "continuation" &&
				(executionIds.includes(item.suggestion.executionId) ||
					executionIds.includes(item.suggestion.openingExecutionId)),
		),
	};
}
