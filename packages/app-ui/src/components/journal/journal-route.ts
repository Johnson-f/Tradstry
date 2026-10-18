export type JournalView = "today" | "trades" | "attention";

const BASE = "/dashboard/journal";

export const VIEW_PATHS: Record<JournalView, string> = {
	today: BASE,
	trades: `${BASE}/trades`,
	attention: `${BASE}/attention`,
};

const VIEW_SEGMENTS: Record<string, JournalView> = {
	trades: "trades",
	attention: "attention",
	review: "today",
};

export function parseJournalPath(pathname: string): {
	view: JournalView;
	legacyTradeId: string | null;
} {
	const path = (pathname.split(/[?#]/)[0] ?? "").replace(/\/+$/, "");
	const segment = path.startsWith(`${BASE}/`)
		? path.slice(BASE.length + 1).split("/")[0]
		: "";
	if (!segment) return { view: "today", legacyTradeId: null };
	const view = VIEW_SEGMENTS[segment];
	if (view) return { view, legacyTradeId: null };
	return { view: "trades", legacyTradeId: decodeURIComponent(segment) };
}

export function tradeUrl(
	path: string,
	search: string,
	tradeId: string | null,
): string {
	const params = new URLSearchParams(search);
	if (tradeId) params.set("trade", tradeId);
	else params.delete("trade");
	const query = params.toString();
	return query ? `${path}?${query}` : path;
}
