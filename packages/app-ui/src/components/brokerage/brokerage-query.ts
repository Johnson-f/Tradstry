import {
	ANALYTICS_RANGES,
	type AnalyticsRange,
} from "@tradstry/app-ui/lib/types/analytics";

export type BrokerageQueryState = {
	tab: "pending" | "all" | "journalled";
	symbol: string | undefined;
	range: AnalyticsRange;
	startDate: string | undefined;
	endDate: string | undefined;
	episodeClosedDate: string | undefined;
};

export type BrokerageJournalStatus = "all" | "journalled" | "unjournalled";

export function brokerageJournalFilter(
	tab: BrokerageQueryState["tab"],
	status: BrokerageJournalStatus,
): boolean | undefined {
	if (tab === "journalled") return true;
	if (tab !== "all" || status === "all") return undefined;
	return status === "journalled";
}

const TABS = new Set<BrokerageQueryState["tab"]>([
	"pending",
	"all",
	"journalled",
]);
const RANGES = new Set<AnalyticsRange>(ANALYTICS_RANGES);

function validDate(value: string | null) {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) &&
		date.toISOString().slice(0, 10) === value
		? value
		: undefined;
}

export function parseBrokerageQuery(
	params: URLSearchParams,
): BrokerageQueryState {
	const requestedTab = params.get("tab") as BrokerageQueryState["tab"] | null;
	const requestedRange = params.get("range") as AnalyticsRange | null;
	const startDate = validDate(params.get("startDate"));
	const endDate = validDate(params.get("endDate"));
	const episodeClosedDate = validDate(params.get("episodeClosedDate"));
	const hasExactDates = Boolean((startDate && endDate) || episodeClosedDate);
	const symbol = params.get("symbol")?.trim().toUpperCase() || undefined;

	return {
		tab: requestedTab && TABS.has(requestedTab) ? requestedTab : "pending",
		symbol,
		range: hasExactDates
			? "CUSTOM"
			: requestedRange && RANGES.has(requestedRange)
				? requestedRange
				: "ALL",
		startDate: episodeClosedDate
			? undefined
			: hasExactDates
				? startDate
				: undefined,
		endDate: episodeClosedDate
			? undefined
			: hasExactDates
				? endDate
				: undefined,
		episodeClosedDate,
	};
}

export function currentBrokerageQuery() {
	if (typeof window === "undefined") {
		return parseBrokerageQuery(new URLSearchParams());
	}
	return parseBrokerageQuery(new URLSearchParams(window.location.search));
}
