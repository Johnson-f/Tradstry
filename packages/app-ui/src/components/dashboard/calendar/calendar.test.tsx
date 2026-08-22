import { expect, test } from "bun:test";
import { TooltipProvider } from "@tradstry/app-ui/components/ui/tooltip";
import type { CalendarAnalytics } from "@tradstry/app-ui/lib/types/analytics";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCalendarDayDestination, TradingCalendarView } from "./calendar";

const calendar: CalendarAnalytics = {
	year: 2026,
	month: 6,
	monthProfit: 46,
	tradeCount: 3,
	tradingDays: 2,
	winRate: 50,
	winningTradeCount: 1,
	breakevenTradeCount: 1,
	losingTradeCount: 1,
	gridStart: "2026-05-31",
	gridEnd: "2026-07-04",
	days: [
		{
			date: "2026-06-10",
			profit: 46,
			tradeCount: 2,
			winRate: 50,
			winningTradeCount: 1,
			breakevenTradeCount: 0,
			losingTradeCount: 1,
		},
		{
			date: "2026-06-12",
			profit: 0,
			tradeCount: 1,
			winRate: 0,
			winningTradeCount: 0,
			breakevenTradeCount: 1,
			losingTradeCount: 0,
		},
	],
	weeks: [
		{
			weekIndex: 2,
			weekStart: "2026-06-07",
			weekEnd: "2026-06-13",
			profit: 46,
			tradeCount: 3,
			tradingDays: 2,
			winRate: 50,
			winningTradeCount: 1,
			breakevenTradeCount: 1,
			losingTradeCount: 1,
		},
	],
};

test("calendar presents broker-derived month, day, and week insights", () => {
	const html = renderToStaticMarkup(
		<TooltipProvider>
			<TradingCalendarView
				data={calendar}
				visibleMonth={new Date("2026-06-01T00:00:00Z")}
				onPreviousMonth={() => {}}
				onNextMonth={() => {}}
				onToday={() => {}}
				onNavigate={() => {}}
			/>
		</TooltipProvider>,
	);

	expect(html).toContain("Trading Calendar");
	expect(html).toContain("June 2026");
	expect(html).toContain("Net P&amp;L");
	expect(html).toContain("+$46.00");
	expect(html).toContain("50.00% win rate");
	expect(html).toContain("2 active days");
	expect(html).toContain("Best day");
	expect(html).toContain("Jun 10");
	expect(html).toContain("1W");
	expect(html).toContain("1B");
	expect(html).toContain("1L");
	expect(html).toContain("Week 2");
	expect(html).toContain(
		'aria-label="Open trades closed on June 10, 2026: +$46.00, 2 trades, 50.00% win rate"',
	);
});

test("calendar day drill-down targets closed broker episodes", () => {
	expect(buildCalendarDayDestination("2026-06-10")).toBe(
		"/dashboard/brokerage?tab=all&episodeClosedDate=2026-06-10",
	);
});
