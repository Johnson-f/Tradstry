"use client";

import * as React from "react";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";
import {
	type JournalView,
	parseJournalPath,
	tradeUrl,
	VIEW_PATHS,
} from "./journal-route";
import type { TradeQueue } from "./trade/trade-types";

type OpenOptions = { queue?: TradeQueue | null; trigger?: HTMLElement | null };

export type JournalNavigation = {
	view: JournalView;
	params: URLSearchParams;
	tradeId: string | null;
	queue: TradeQueue | null;
	returnFocus: React.RefObject<HTMLElement | null>;
	openTrade: (id: string, options?: OpenOptions) => void;
	switchTrade: (id: string) => void;
	closeTrade: () => void;
	goTo: (view: JournalView) => void;
};

const NavigationContext = React.createContext<JournalNavigation | null>(null);

export const JournalNavigationProvider = NavigationContext.Provider;

export function useJournalNavigation() {
	const navigation = React.useContext(NavigationContext);
	if (!navigation) throw new Error("Journal navigation is missing");
	return navigation;
}

/**
 * The platform pathname leaves out the query string, so the open trade lives in
 * `?trade=` and is read and written through the History API.
 */
export function useJournalLocation(): JournalNavigation {
	const { pathname, navigate } = useTradstryPlatform();
	const { view, legacyTradeId } = parseJournalPath(pathname);
	const [search, setSearch] = React.useState("");
	const [consumedLegacyId, setConsumedLegacyId] = React.useState<string | null>(null);
	const [queue, setQueue] = React.useState<TradeQueue | null>(null);
	const returnFocus = React.useRef<HTMLElement | null>(null);
	React.useEffect(() => {
		const read = () => setSearch(window.location.search);
		read();
		window.addEventListener("popstate", read);
		return () => window.removeEventListener("popstate", read);
	}, [pathname]);
	const params = React.useMemo(() => new URLSearchParams(search), [search]);
	const activeLegacyId = legacyTradeId !== consumedLegacyId ? legacyTradeId : null;
	const tradeId = activeLegacyId ?? params.get("trade");

	const write = (id: string | null, replace: boolean) => {
		const path = legacyTradeId ? VIEW_PATHS[view] : (pathname.split(/[?#]/)[0] ?? pathname);
		const url = tradeUrl(path, legacyTradeId ? "" : window.location.search, id);
		if (legacyTradeId) setConsumedLegacyId(legacyTradeId);
		window.history[replace ? "replaceState" : "pushState"](null, "", url);
		setSearch(window.location.search);
	};
	return {
		view,
		params,
		tradeId,
		queue,
		returnFocus,
		openTrade: (id, options = {}) => {
			returnFocus.current = options.trigger ?? null;
			setQueue(options.queue ?? null);
			write(id, false);
		},
		switchTrade: (id) => write(id, true),
		closeTrade: () => {
			setQueue(null);
			write(null, true);
		},
		goTo: (next) => {
			setQueue(null);
			setSearch("");
			navigate(VIEW_PATHS[next]);
		},
	};
}
