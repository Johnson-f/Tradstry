import { expect, test } from "bun:test";
import { TooltipProvider } from "@tradstry/app-ui/components/ui/tooltip";
import type { TradingPerformance } from "@tradstry/app-ui/lib/types/analytics";
import { renderToStaticMarkup } from "react-dom/server";
import {
	buildBreakdownDestination,
	WinnersLeaksSummary,
} from "./card";

const performance: TradingPerformance = {
	totalRealizedPnl: 46,
	grossProfit: 98,
	grossLoss: 52,
	averageWin: 49,
	averageLoss: 52,
	profitFactor: 98 / 52,
	winRate: 66.67,
	closedTradeCount: 3,
	winningTradeCount: 2,
	breakevenTradeCount: 0,
	losingTradeCount: 1,
	averageRealizedR: 1.25,
	riskDefinedTradeCount: 2,
	openPositionCount: 0,
	needsReviewCount: 0,
	peakRealizedPnl: 98,
	currentDrawdown: 52,
	maxDrawdown: 52,
	currentStreak: -1,
	longestLossStreak: 1,
	bestSymbol: { key: "AAPL", netPnl: 98, winRate: 100, tradeCount: 2 },
	worstSymbol: { key: "NVDA", netPnl: -52, winRate: 0, tradeCount: 1 },
	bestDay: { key: "2026-06-10", netPnl: 98, winRate: 100, tradeCount: 2 },
	worstDay: { key: "2026-06-11", netPnl: -52, winRate: 0, tradeCount: 1 },
	points: [],
};

test("winners and leaks exposes ranked symbols and days with sample honesty", () => {
	const html = renderToStaticMarkup(
		<TooltipProvider>
			<WinnersLeaksSummary
				performance={performance}
				range="LAST_1_MONTH"
				rangeLabel="Past Month"
				onNavigate={() => {}}
			/>
		</TooltipProvider>,
	);

	expect(html).toContain("Winners &amp; Leaks");
	expect(html).toContain("Best symbol");
	expect(html).toContain("AAPL");
	expect(html).toContain("Worst symbol");
	expect(html).toContain("NVDA");
	expect(html).toContain("Jun 10, 2026");
	expect(html).toContain("Jun 11, 2026");
	expect(html).toContain("100.00% win rate");
	expect(html).toContain("2 trades");
	expect(html.match(/Limited sample/g)?.length).toBe(4);
});

test("builds Brokerage links for symbols and exact trading days", () => {
	const bestSymbol = performance.bestSymbol;
	const bestDay = performance.bestDay;
	if (!bestSymbol || !bestDay)
		throw new Error("breakdown fixture is incomplete");

	expect(buildBreakdownDestination("symbol", bestSymbol, "LAST_1_MONTH")).toBe(
		"/dashboard/brokerage?tab=all&symbol=AAPL&range=LAST_1_MONTH",
	);
	expect(buildBreakdownDestination("day", bestDay, "LAST_1_MONTH")).toBe(
		"/dashboard/brokerage?tab=all&episodeClosedDate=2026-06-10",
	);
});
