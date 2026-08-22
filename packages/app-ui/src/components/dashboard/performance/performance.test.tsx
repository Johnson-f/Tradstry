import { expect, test } from "bun:test";
import { TooltipProvider } from "@tradstry/app-ui/components/ui/tooltip";
import type { TradingPerformance } from "@tradstry/app-ui/lib/types/analytics";
import { renderToStaticMarkup } from "react-dom/server";
import {
	MetricHelp,
	RiskRewardValue,
	WinLossBar,
	WinRateGauge,
} from "./metrics-row";
import { RiskRecoverySummary } from "./risk-recovery-card";
import { TradingPerformanceSummary } from "./trading-pnl-card";

const performance: TradingPerformance = {
	totalRealizedPnl: 46,
	grossProfit: 98,
	grossLoss: 52,
	averageWin: 98,
	averageLoss: 52,
	profitFactor: 98 / 52,
	winRate: 50,
	closedTradeCount: 3,
	winningTradeCount: 1,
	breakevenTradeCount: 1,
	losingTradeCount: 1,
	averageRealizedR: 1.25,
	riskDefinedTradeCount: 2,
	openPositionCount: 1,
	needsReviewCount: 1,
	peakRealizedPnl: 98,
	currentDrawdown: 52,
	maxDrawdown: 52,
	currentStreak: 0,
	longestLossStreak: 1,
	bestSymbol: null,
	worstSymbol: null,
	bestDay: null,
	worstDay: null,
	points: [
		{
			date: "2026-06-10",
			dailyPnl: 98,
			cumulativePnl: 98,
			drawdown: 0,
			closedTradeCount: 1,
		},
		{
			date: "2026-06-11",
			dailyPnl: -52,
			cumulativePnl: 46,
			drawdown: -52,
			closedTradeCount: 2,
		},
	],
};

test("metric help exposes its definition and formula to assistive technology", () => {
	const html = renderToStaticMarkup(
		<TooltipProvider>
			<MetricHelp
				title="Win Rate"
				description="Share of decisive closed trades that were profitable."
				formula="Wins ÷ (wins + losses) × 100"
			/>
		</TooltipProvider>,
	);
	expect(html).toContain('aria-label="About Win Rate"');
	expect(html).toContain("Share of decisive closed trades that were profitable.");
	expect(html).toContain("Formula: Wins ÷ (wins + losses) × 100");
});

test("average risk-to-reward uses R units", () => {
	const html = renderToStaticMarkup(
		<RiskRewardValue value={2.456} qualifyingTradeCount={4} />,
	);
	expect(html).toContain("2.46R");
	expect(html).toContain('aria-label="Average risk-to-reward 2.46R"');
	expect(html).toContain("4 risk-defined trades");
});

test("average risk-to-reward explains when no broker trade has defined risk", () => {
	const html = renderToStaticMarkup(
		<RiskRewardValue value={null} qualifyingTradeCount={0} />,
	);
	expect(html).toContain("No defined risk");
	expect(html).toContain('aria-label="Average risk-to-reward unavailable"');
	expect(html).not.toContain("0.00R");
});

test("win-rate gauge exposes the rate and all outcome counts", () => {
	const html = renderToStaticMarkup(
		<WinRateGauge
			label="Trade win rate"
			rate={75}
			wins={3}
			breakevens={1}
			losses={1}
		/>,
	);
	expect(html).toContain(
		'aria-label="Trade win rate: 75.00%. 3 wins, 1 breakeven, 1 loss."',
	);
	expect(html).toContain(">3<");
	expect(html).toContain(">1<");
});

test("average win-loss bar exposes both dollar averages and their ratio", () => {
	const html = renderToStaticMarkup(
		<WinLossBar averageWin={113} averageLoss={73.1} />,
	);
	expect(html).toContain(
		'aria-label="Average win $113.00, average loss $73.10, ratio 1.55"',
	);
	expect(html).toContain("1.55");
	expect(html).toContain("-$73.10");
});

test("trading performance summary explains its filtered realized-P&L coverage", () => {
	const html = renderToStaticMarkup(
		<TooltipProvider>
			<TradingPerformanceSummary performance={performance} rangeLabel="past month" />
		</TooltipProvider>,
	);
	expect(html).toContain("Trading P&amp;L");
	expect(html).toContain("$46.00");
	expect(html).toContain("3 closed trades");
	expect(html).toContain("1 open position excluded");
	expect(html).toContain("1 trade needs grouping review");
	expect(html).toContain(
		'aria-label="Cumulative realized trading P&amp;L for past month: $46.00 from 3 closed trades."',
	);
});

test("risk and recovery summary explains drawdown and streak state", () => {
	const riskPerformance: TradingPerformance = {
		...performance,
		openPositionCount: 0,
		needsReviewCount: 0,
		currentStreak: -2,
		longestLossStreak: 3,
		points: [
			{
				date: "2026-06-09",
				dailyPnl: 0,
				cumulativePnl: 0,
				drawdown: 0,
				closedTradeCount: 0,
			},
			...performance.points,
		],
	};
	const html = renderToStaticMarkup(
		<TooltipProvider>
			<RiskRecoverySummary performance={riskPerformance} rangeLabel="Past Month" />
		</TooltipProvider>,
	);
	expect(html).toContain("Risk &amp; Recovery");
	expect(html).toContain("$52.00 below peak");
	expect(html).toContain("Maximum drawdown");
	expect(html).toContain("$52.00");
	expect(html).toContain("2-loss streak");
	expect(html).toContain("Longest losing streak");
	expect(html).toContain(">3<");
});
