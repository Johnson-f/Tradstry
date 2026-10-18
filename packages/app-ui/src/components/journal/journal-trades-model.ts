import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";

export type FilterGroup = "lifecycle" | "review";
export type TradeFilters = Record<FilterGroup, string[]>;
export type SortKey = "newest" | "oldest" | "win" | "loss" | "r";

export const LIFECYCLE_OPTIONS = [
	{ value: "open", label: "Open" },
	{ value: "closed", label: "Closed" },
	{ value: "incomplete", label: "Needs attention" },
] as const;

export const REVIEW_OPTIONS = [
	{ value: "unreviewed", label: "Not reviewed" },
	{ value: "in_progress", label: "In progress" },
	{ value: "reviewed", label: "Reviewed" },
	{ value: "outdated", label: "Results changed" },
	{ value: "skipped", label: "Skipped" },
] as const;

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
	{ value: "newest", label: "Newest first" },
	{ value: "oldest", label: "Oldest first" },
	{ value: "win", label: "Biggest win" },
	{ value: "loss", label: "Biggest loss" },
	{ value: "r", label: "Highest R" },
];

const OPTIONS: Record<FilterGroup, readonly { value: string; label: string }[]> = {
	lifecycle: LIFECYCLE_OPTIONS,
	review: REVIEW_OPTIONS,
};

export const NO_FILTERS: TradeFilters = { lifecycle: [], review: [] };

export function toggleFilter(
	filters: TradeFilters,
	group: FilterGroup,
	value: string,
): TradeFilters {
	const current = filters[group];
	return {
		...filters,
		[group]: current.includes(value)
			? current.filter((item) => item !== value)
			: [...current, value],
	};
}

export function filterChips(filters: TradeFilters) {
	return (Object.keys(OPTIONS) as FilterGroup[]).flatMap((group) =>
		filters[group].map((value) => ({
			group,
			value,
			label: OPTIONS[group].find((option) => option.value === value)?.label ?? value,
		})),
	);
}

export function filterTrades(
	trades: JournalTrade[],
	search: string,
	filters: TradeFilters,
) {
	const needle = search.trim().toLowerCase();
	return trades.filter(
		(trade) =>
			(!needle || `${trade.symbol} ${trade.symbolName}`.toLowerCase().includes(needle)) &&
			(!filters.lifecycle.length || filters.lifecycle.includes(trade.lifecycleState)) &&
			(!filters.review.length || filters.review.includes(trade.reviewState)),
	);
}

function timeOf(trade: JournalTrade) {
	const value = trade.closeDate ?? trade.openDate ?? trade.lastExecutionAt;
	const time = value ? Date.parse(value) : NaN;
	return Number.isFinite(time) ? time : null;
}

function numberOf(value: string | null) {
	const amount = value === null ? NaN : Number(value);
	return Number.isFinite(amount) ? amount : null;
}

function byValue(
	read: (trade: JournalTrade) => number | null,
	direction: 1 | -1,
) {
	return (a: JournalTrade, b: JournalTrade) => {
		const left = read(a);
		const right = read(b);
		if (left === null && right === null) return 0;
		if (left === null) return 1;
		if (right === null) return -1;
		return (left - right) * direction;
	};
}

const COMPARERS: Record<SortKey, (a: JournalTrade, b: JournalTrade) => number> = {
	newest: byValue(timeOf, -1),
	oldest: byValue(timeOf, 1),
	win: byValue((trade) => numberOf(trade.realizedNet), -1),
	loss: byValue((trade) => numberOf(trade.realizedNet), 1),
	r: byValue((trade) => numberOf(trade.realizedR), -1),
};

export function sortTrades(trades: JournalTrade[], sort: SortKey) {
	return [...trades].sort(COMPARERS[sort]);
}

export function initialFilters(status: string | null): TradeFilters {
	return LIFECYCLE_OPTIONS.some((option) => option.value === status)
		? { ...NO_FILTERS, lifecycle: [status!] }
		: NO_FILTERS;
}
