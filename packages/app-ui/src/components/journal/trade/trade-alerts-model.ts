import type {
	ContinuationSuggestion,
	HoldingsMismatch,
	JournalTrade,
} from "@tradstry/app-ui/lib/service/journal-flow";

export type TradeAlert =
	| { id: string; text: string; kind: "successor"; successorId: string }
	| { id: string; text: string; kind: "history" }
	| { id: string; text: string; kind: "duplicate"; blocking: boolean }
	| { id: string; text: string; kind: "holdings"; mismatch: HoldingsMismatch }
	| { id: string; text: string; kind: "continuation"; suggestion: ContinuationSuggestion }
	| { id: string; text: string; kind: "join"; joinId: string };

export function tradeAlerts({
	trade,
	holdings,
	continuations,
	brokenJoins,
}: {
	trade: JournalTrade;
	holdings: HoldingsMismatch[];
	continuations: ContinuationSuggestion[];
	brokenJoins: string[];
}): TradeAlert[] {
	const alerts: TradeAlert[] = [];
	if (trade.retiredAt)
		alerts.push({
			id: "retired",
			kind: "successor",
			successorId: trade.successorId ?? "",
			text: "This earlier grouping and its notes are preserved.",
		});
	const duplicates = trade.possibleDuplicates?.length ?? 0;
	if (trade.lifecycleState === "incomplete" && trade.issueCode !== "possible_duplicate")
		alerts.push({
			id: "history",
			kind: "history",
			text: trade.issueMessage ?? "The history for this trade doesn’t add up.",
		});
	if (duplicates)
		alerts.push({
			id: "duplicate",
			kind: "duplicate",
			blocking: trade.issueCode === "possible_duplicate",
			text:
				trade.issueCode === "possible_duplicate"
					? "Possible duplicate. This trade is left out of your totals until you decide."
					: "Compare these existing entries before recording a separate trade.",
		});
	for (const mismatch of holdings)
		alerts.push({
			id: `holdings:${mismatch.instrumentKey}`,
			kind: "holdings",
			mismatch,
			text: `Holdings don’t match. Your broker shows ${mismatch.held} held, but the imported history adds up to ${mismatch.imported}.`,
		});
	for (const suggestion of continuations)
		alerts.push({
			id: `continuation:${suggestion.executionId}`,
			kind: "continuation",
			suggestion,
			text: `${suggestion.fromSymbol} may now be ${suggestion.toSymbol}. ${suggestion.explanation}`,
		});
	for (const joinId of brokenJoins)
		alerts.push({
			id: `join:${joinId}`,
			kind: "join",
			joinId,
			text: "Combined executions no longer sit together in this trade.",
		});
	return alerts;
}
