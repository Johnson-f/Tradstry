import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import type { SheetTab } from "./trade-types";

export type FooterStep =
	| { kind: "read-only" }
	| { kind: "fix-history" }
	| { kind: "write-entry-note" }
	| { kind: "holding"; held: string | null }
	| { kind: "edit-review" }
	| { kind: "undo-skip" }
	| { kind: "review"; onReviewTab: boolean; again: boolean };

export function footerStep({
	trade,
	tab,
	editingReview,
	readOnly,
}: {
	trade: JournalTrade;
	tab: SheetTab;
	editingReview: boolean;
	readOnly: boolean;
}): FooterStep {
	if (readOnly) return { kind: "read-only" };
	if (trade.lifecycleState === "incomplete") return { kind: "fix-history" };
	if (trade.lifecycleState === "open") {
		return trade.episodeId && !trade.hasEntryNote
			? { kind: "write-entry-note" }
			: { kind: "holding", held: trade.remainingQuantity };
	}
	if (trade.reviewState === "reviewed" && !editingReview)
		return { kind: "edit-review" };
	if (trade.reviewState === "skipped") return { kind: "undo-skip" };
	return {
		kind: "review",
		onReviewTab: tab === "review",
		again: trade.reviewState === "outdated" || trade.reviewState === "reviewed",
	};
}

export function defaultTab(trade: JournalTrade): SheetTab {
	return trade.lifecycleState === "closed" && trade.reviewState !== "reviewed"
		? "review"
		: "timeline";
}
