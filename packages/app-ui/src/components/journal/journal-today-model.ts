import type {
	JournalTrade,
	ReviewSession,
	SessionItem,
} from "@tradstry/app-ui/lib/service/journal-flow";
import { type BadgeSpec, reviewBadge, SKIP_LABELS } from "./journal-display";
import { calendarDate } from "./journal-format";

export const GROUPS = [
	{ value: "exited", label: "Exited today" },
	{ value: "open", label: "Still open" },
	{ value: "attention", label: "Needs attention" },
] as const;

export function orderedItems(items: SessionItem[]) {
	return GROUPS.flatMap((group) =>
		items.filter((item) => item.group === group.value),
	);
}

export function groupedItems(items: SessionItem[]) {
	return GROUPS.map((group) => ({
		...group,
		items: items.filter((item) => item.group === group.value),
	})).filter((group) => group.items.length > 0);
}

export function itemsToReview(items: SessionItem[]) {
	return orderedItems(items).filter(
		(item) => item.group === "exited" && item.state === "pending",
	);
}

export function nextPending(ordered: SessionItem[], currentId: string) {
	const index = ordered.findIndex((item) => item.entryId === currentId);
	const after = [...ordered.slice(index + 1), ...ordered.slice(0, Math.max(index, 0))];
	return after.find(
		(item) =>
			item.group === "exited" &&
			item.state === "pending" &&
			item.entryId !== currentId,
	);
}

export function dayBadge(session: ReviewSession) {
	const exited = session.items.filter((item) => item.group === "exited");
	if (!exited.length) return { text: "No exits to review", complete: false };
	if (session.complete)
		return {
			text: session.skippedCount
				? `Reviewed · ${session.skippedCount} skipped`
				: "Reviewed",
			complete: true,
		};
	const done = exited.filter(
		(item) => item.state === "reviewed" || item.state === "skipped",
	).length;
	return { text: `${done} of ${exited.length} exits reviewed`, complete: false };
}

const WAITING_REVIEW = new Set(["unreviewed", "in_progress", "outdated"]);

function currentTrades(trades: JournalTrade[]) {
	return trades.filter((trade) => !trade.retiredAt);
}

export function tradingDays(trades: JournalTrade[], timezone?: string) {
	const days = new Set<string>();
	for (const trade of currentTrades(trades))
		for (const value of [trade.openDate, trade.closeDate, trade.firstExecutionAt, trade.lastExecutionAt])
			if (value) days.add(calendarDate(value, timezone));
	return days;
}

export function unreviewedDays(trades: JournalTrade[], timezone?: string) {
	const days = new Set<string>();
	for (const trade of currentTrades(trades))
		if (trade.lifecycleState === "closed" && trade.closeDate && WAITING_REVIEW.has(trade.reviewState))
			days.add(calendarDate(trade.closeDate, timezone));
	return days;
}

export function latestTradingDay(trades: JournalTrade[], timezone?: string) {
	return [...tradingDays(trades, timezone)].sort().at(-1) ?? null;
}

export function rowNote(item: SessionItem, trade: JournalTrade) {
	if (item.group === "attention")
		return trade.issueMessage ?? (trade.reviewState === "outdated" ? "Results changed after your review" : "");
	if (item.group === "open") {
		const held = trade.remainingQuantity ? `${trade.remainingQuantity} held` : "Open";
		return trade.episodeId && !trade.hasEntryNote ? `${held} · Entry note missing` : held;
	}
	return `${trade.executionCount} ${trade.executionCount === 1 ? "execution" : "executions"}`;
}

export function rowBadge(item: SessionItem, trade: JournalTrade): BadgeSpec {
	if (item.group === "attention") return { text: "Needs attention", tone: "warn" };
	if (item.group === "open")
		return trade.lifecycleState !== "open"
			? reviewBadge(trade)
			: trade.episodeId && !trade.hasEntryNote
				? { text: "Write entry note", tone: "info" }
				: { text: "When it exits", tone: "muted" };
	if (item.state === "reviewed") return { text: "Reviewed", tone: "good" };
	if (item.state === "skipped")
		return {
			text: item.skipReason ? `Skipped · ${SKIP_LABELS[item.skipReason]}` : "Skipped",
			tone: "muted",
		};
	return { text: "To review", tone: "muted" };
}

export function isoToLocalDate(iso: string) {
	const [year, month, day] = iso.split("-").map(Number);
	return new Date(year!, month! - 1, day);
}

export function localDateToIso(date: Date) {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
