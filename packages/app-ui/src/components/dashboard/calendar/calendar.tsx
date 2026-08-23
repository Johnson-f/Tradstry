"use client";

import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MetricHelp } from "@tradstry/app-ui/components/dashboard/performance/metrics-row";
import { DashboardCardError } from "@tradstry/app-ui/components/dashboard/shared/card-error";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import { useCalendarAnalytics } from "@tradstry/app-ui/hooks/analytics";
import type {
	CalendarAnalytics,
	CalendarDaySummary,
	CalendarWeekSummary,
} from "@tradstry/app-ui/lib/types/analytics";
import { cn, formatPnl } from "@tradstry/app-ui/lib/utils";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";
import { Fragment, useState } from "react";

const MONTH = new Intl.DateTimeFormat("en-US", {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});
const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	timeZone: "UTC",
});
const FULL_DATE = new Intl.DateTimeFormat("en-US", {
	month: "long",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseDate(value: string) {
	return new Date(`${value}T00:00:00Z`);
}

function isoDate(value: Date) {
	return value.toISOString().slice(0, 10);
}

function gridDates(start: string, end: string) {
	const dates: string[] = [];
	let cursor = parseDate(start);
	const last = parseDate(end);
	while (cursor <= last) {
		dates.push(isoDate(cursor));
		cursor = new Date(cursor.getTime() + 86_400_000);
	}
	return dates;
}

function percentage(value: number) {
	return `${value.toFixed(2)}%`;
}

function pnl(value: number) {
	return formatPnl(value, { precision: "cents" });
}

function Outcomes({
	wins,
	breakevens,
	losses,
}: {
	wins: number;
	breakevens: number;
	losses: number;
}) {
	return (
		<div className="flex items-center gap-2 text-[0.58rem] font-semibold tabular-nums">
			<span className="text-emerald-600">{wins}W</span>
			<span className="text-sky-600">{breakevens}B</span>
			<span className="text-rose-600">{losses}L</span>
		</div>
	);
}

export function buildCalendarDayDestination(date: string) {
	return `/dashboard/brokerage?tab=all&episodeClosedDate=${date}`;
}

function SummaryMetric({
	label,
	value,
	tone = "neutral",
}: {
	label: string;
	value: string;
	tone?: "positive" | "negative" | "neutral";
}) {
	return (
		<div className="min-w-0 border-l pl-3 first:border-l-0 first:pl-0 md:pl-4">
			<p className="text-[0.58rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
				{label}
			</p>
			<p
				className={cn(
					"mt-1 truncate text-sm font-semibold tabular-nums",
					tone === "positive" && "text-emerald-600",
					tone === "negative" && "text-rose-600",
				)}
			>
				{value}
			</p>
		</div>
	);
}

function DayCell({
	date,
	day,
	visibleMonth,
	maxAbsoluteProfit,
	onNavigate,
}: {
	date: string;
	day: CalendarDaySummary | undefined;
	visibleMonth: number;
	maxAbsoluteProfit: number;
	onNavigate: (destination: string) => void;
}) {
	const value = parseDate(date);
	const currentMonth = value.getUTCMonth() + 1 === visibleMonth;
	const traded = Boolean(day && day.tradeCount > 0);
	const today = date === isoDate(new Date());
	const positive = (day?.profit ?? 0) >= 0;
	const intensity = traded
		? Math.max(
				0.12,
				Math.min(1, Math.abs(day?.profit ?? 0) / maxAbsoluteProfit),
			)
		: 0;
	const background = traded
		? positive
			? `rgba(16, 185, 129, ${0.04 + intensity * 0.11})`
			: `rgba(244, 63, 94, ${0.04 + intensity * 0.11})`
		: undefined;
	const content = (
		<>
			<div className="flex items-start justify-between gap-2">
				<span
					className={cn(
						"flex size-6 items-center justify-center rounded-full text-[0.68rem] font-semibold",
						today && "bg-foreground text-background",
					)}
				>
					{value.getUTCDate()}
				</span>
				{traded ? (
					<span className="rounded-full bg-background/75 px-1.5 py-0.5 text-[0.55rem] font-medium text-muted-foreground shadow-sm">
						{day?.tradeCount} {day?.tradeCount === 1 ? "trade" : "trades"}
					</span>
				) : null}
			</div>
			{traded && day ? (
				<div className="mt-3">
					<p
						className={cn(
							"font-mono text-sm font-semibold tabular-nums",
							positive ? "text-emerald-700" : "text-rose-700",
						)}
					>
						{pnl(day.profit)}
					</p>
					<div className="mt-2 flex items-center justify-between gap-2">
						<Outcomes
							wins={day.winningTradeCount}
							breakevens={day.breakevenTradeCount}
							losses={day.losingTradeCount}
						/>
						<span className="text-[0.55rem] tabular-nums text-muted-foreground">
							{percentage(day.winRate)}
						</span>
					</div>
				</div>
			) : null}
		</>
	);
	const className = cn(
		"relative min-h-24 overflow-hidden rounded-xl border p-2.5 text-left",
		currentMonth ? "bg-background" : "bg-muted/15 text-muted-foreground/45",
		traded &&
			"outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring/40",
	);

	if (!traded || !day) return <div className={className}>{content}</div>;
	const label = `Open trades closed on ${FULL_DATE.format(value)}: ${pnl(day.profit)}, ${day.tradeCount} ${day.tradeCount === 1 ? "trade" : "trades"}, ${percentage(day.winRate)} win rate`;
	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			className={className}
			style={{ backgroundColor: background }}
			onClick={() => onNavigate(buildCalendarDayDestination(day.date))}
		>
			{content}
		</button>
	);
}

function WeekRail({ week }: { week: CalendarWeekSummary | undefined }) {
	if (!week) return <div className="min-h-24 rounded-xl border bg-muted/10" />;
	if (week.tradeCount === 0) {
		return (
			<div className="flex min-h-24 flex-col justify-between rounded-xl border bg-muted/10 p-2.5">
				<p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
					Week {week.weekIndex}
				</p>
				<p className="text-[0.58rem] text-muted-foreground/70">No activity</p>
			</div>
		);
	}
	return (
		<div className="flex min-h-24 flex-col justify-between rounded-xl border bg-muted/20 p-2.5">
			<div>
				<p className="text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
					Week {week.weekIndex}
				</p>
				<p
					className={cn(
						"mt-2 font-mono text-sm font-semibold tabular-nums",
						week.profit > 0 && "text-emerald-600",
						week.profit < 0 && "text-rose-600",
					)}
				>
					{pnl(week.profit)}
				</p>
			</div>
			<div>
				<Outcomes
					wins={week.winningTradeCount}
					breakevens={week.breakevenTradeCount}
					losses={week.losingTradeCount}
				/>
				<p className="mt-1 text-[0.55rem] text-muted-foreground">
					{week.tradingDays} active {week.tradingDays === 1 ? "day" : "days"}
				</p>
			</div>
		</div>
	);
}

export function TradingCalendarView({
	data,
	visibleMonth,
	onPreviousMonth,
	onNextMonth,
	onToday,
	onNavigate,
	isPlaceholderData = false,
}: {
	data: CalendarAnalytics;
	visibleMonth: Date;
	onPreviousMonth: () => void;
	onNextMonth: () => void;
	onToday: () => void;
	onNavigate: (destination: string) => void;
	isPlaceholderData?: boolean;
}) {
	const dates = gridDates(data.gridStart, data.gridEnd);
	const dayMap = new Map(data.days.map((day) => [day.date, day]));
	const bestDay = data.days
		.filter((day) => day.tradeCount > 0)
		.sort((left, right) => right.profit - left.profit)[0];
	const maxAbsoluteProfit = Math.max(
		1,
		...data.days.map((day) => Math.abs(day.profit)),
	);
	const rows = Array.from(
		{ length: Math.ceil(dates.length / 7) },
		(_, index) => ({
			dates: dates.slice(index * 7, index * 7 + 7),
			week: data.weeks.find((week) => week.weekIndex === index + 1),
		}),
	);

	return (
		<section className="rounded-xl border border-border/70 bg-card/55 p-4 md:p-5">
			<div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
				<div>
					<div className="flex items-center gap-2">
						<h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
							Trading Calendar
						</h2>
						<MetricHelp
							title="Trading Calendar"
							description="Daily realized P&L from completed broker-derived trades, grouped by the New York trading date when each position closed."
							formula="Daily P&L = Σ closed-trade proceeds − cost basis − fees"
						/>
					</div>
					<div className="mt-2 flex items-center gap-1.5">
						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							aria-label="Previous month"
							onClick={onPreviousMonth}
						>
							<HugeiconsIcon icon={ArrowLeft01Icon} size={15} strokeWidth={2} />
						</Button>
						<p className="min-w-40 text-center text-xl font-semibold">
							{MONTH.format(visibleMonth)}
						</p>
						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							aria-label="Next month"
							onClick={onNextMonth}
						>
							<HugeiconsIcon
								icon={ArrowRight01Icon}
								size={15}
								strokeWidth={2}
							/>
						</Button>
						<Button type="button" variant="ghost" size="sm" onClick={onToday}>
							Today
						</Button>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 xl:min-w-[34rem]">
					<SummaryMetric
						label="Net P&L"
						value={pnl(data.monthProfit)}
						tone={
							data.monthProfit > 0
								? "positive"
								: data.monthProfit < 0
									? "negative"
									: "neutral"
						}
					/>
					<SummaryMetric
						label="Win rate"
						value={`${percentage(data.winRate)} win rate`}
					/>
					<SummaryMetric
						label="Activity"
						value={`${data.tradingDays} active days`}
					/>
					<SummaryMetric
						label="Best day"
						value={
							bestDay
								? `${SHORT_DATE.format(parseDate(bestDay.date))} · ${pnl(bestDay.profit)}`
								: "No closed trades"
						}
						tone={bestDay && bestDay.profit > 0 ? "positive" : "neutral"}
					/>
				</div>
			</div>

			{data.tradeCount === 0 ? (
				<div className="mt-4 rounded-xl border border-dashed bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
					No completed broker trades closed this month. Choose another month or
					sync your brokerage.
				</div>
			) : null}

			<div className="mt-5 overflow-x-auto pb-1">
				<div
					className={cn(
						"grid min-w-[54rem] grid-cols-[repeat(7,minmax(0,1fr))_7.5rem] gap-2 transition-opacity duration-200",
						isPlaceholderData && "opacity-55",
					)}
				>
					{WEEKDAYS.map((label) => (
						<div
							key={label}
							className="border-b px-2 pb-2 text-center text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
						>
							{label}
						</div>
					))}
					<div className="border-b px-2 pb-2 text-center text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
						Week
					</div>
					{rows.map((row, rowIndex) => (
						<Fragment key={row.dates[0] ?? rowIndex}>
							{row.dates.map((date) => (
								<DayCell
									key={date}
									date={date}
									day={dayMap.get(date)}
									visibleMonth={data.month}
									maxAbsoluteProfit={maxAbsoluteProfit}
									onNavigate={onNavigate}
								/>
							))}
							<WeekRail week={row.week} />
						</Fragment>
					))}
				</div>
			</div>
		</section>
	);
}

export function DashboardCalendar() {
	const workspace = useActiveWorkspace();
	const { navigate } = useTradstryPlatform();
	const [visibleMonth, setVisibleMonth] = useState(() => {
		const now = new Date();
		return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	});
	const year = visibleMonth.getUTCFullYear();
	const month = visibleMonth.getUTCMonth() + 1;
	const { data, isLoading, isPending, isPlaceholderData, error, refetch } =
		useCalendarAnalytics(workspace?.id ?? null, year, month);
	const stepMonth = (delta: number) =>
		setVisibleMonth(
			(current) =>
				new Date(
					Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + delta, 1),
				),
		);
	const goToday = () => {
		const now = new Date();
		setVisibleMonth(
			new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
		);
	};

	if (!workspace) return null;
	if (isLoading || isPending) {
		return (
			<section className="rounded-xl border border-border/70 bg-card/55 p-5">
				<div className="flex justify-between gap-4">
					<div>
						<Skeleton className="h-4 w-32" />
						<Skeleton className="mt-3 h-8 w-52" />
					</div>
					<div className="grid w-1/2 grid-cols-4 gap-3">
						{["a", "b", "c", "d"].map((key) => (
							<Skeleton key={key} className="h-12" />
						))}
					</div>
				</div>
				<Skeleton className="mt-5 h-[32rem] rounded-xl" />
			</section>
		);
	}
	if (error) {
		return (
			<DashboardCardError
				title="Trading Calendar"
				error={error}
				onRetry={refetch}
				className="min-h-[36rem]"
			/>
		);
	}
	if (!data) return null;
	return (
		<TradingCalendarView
			data={data}
			visibleMonth={visibleMonth}
			onPreviousMonth={() => stepMonth(-1)}
			onNextMonth={() => stepMonth(1)}
			onToday={goToday}
			onNavigate={navigate}
			isPlaceholderData={isPlaceholderData}
		/>
	);
}
