import type {
	JournalTrade,
	SkipReason,
} from "@tradstry/app-ui/lib/service/journal-flow";

export type Tone = "good" | "bad" | "warn" | "info" | "muted";
export type BadgeSpec = { text: string; tone: Tone };

export const SKIP_LABELS: Record<SkipReason, string> = {
	too_small: "Too small",
	mistake_fill: "Mistake fill",
	review_later: "Will review later",
};
export const SKIP_REASONS = Object.keys(SKIP_LABELS) as SkipReason[];

export function reviewBadge(
	trade: JournalTrade,
	skipReason?: SkipReason | null,
): BadgeSpec {
	switch (trade.reviewState) {
		case "reviewed":
			return { text: "Reviewed", tone: "good" };
		case "in_progress":
			return { text: "Review in progress", tone: "info" };
		case "outdated":
			return { text: "Results changed", tone: "warn" };
		case "skipped":
			return {
				text: skipReason ? `Skipped · ${SKIP_LABELS[skipReason]}` : "Skipped",
				tone: "muted",
			};
		default:
			if (trade.lifecycleState === "open")
				return { text: "When it exits", tone: "muted" };
			if (trade.lifecycleState === "incomplete")
				return { text: "Needs attention", tone: "warn" };
			return { text: "Not reviewed", tone: "muted" };
	}
}

export function stateBadge(trade: JournalTrade): BadgeSpec {
	if (trade.retiredAt) return { text: "Previous grouping", tone: "muted" };
	if (trade.lifecycleState === "incomplete")
		return { text: "Needs attention", tone: "warn" };
	if (trade.lifecycleState === "open") return { text: "Open", tone: "info" };
	return { text: "Closed", tone: "muted" };
}

export function netTone(value: string | null): "good" | "bad" | undefined {
	const amount = value === null ? NaN : Number(value);
	if (!Number.isFinite(amount) || amount === 0) return undefined;
	return amount > 0 ? "good" : "bad";
}
