"use client";

import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MetricHelp } from "@tradstry/app-ui/components/dashboard/performance/metrics-row";
import { DashboardCardError } from "@tradstry/app-ui/components/dashboard/shared/card-error";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import { useTradingPerformance } from "@tradstry/app-ui/hooks/analytics";
import { rangeSublabel } from "@tradstry/app-ui/lib/range-format";
import type {
	AnalyticsRange,
	PerformanceBreakdown,
	TradingPerformance,
} from "@tradstry/app-ui/lib/types/analytics";
import { cn, formatPnl } from "@tradstry/app-ui/lib/utils";
import { useTradstryPlatform } from "@tradstry/app-ui/platform";

type BreakdownKind = "symbol" | "day";

export function buildBreakdownDestination(
	kind: BreakdownKind,
	breakdown: PerformanceBreakdown,
	range: AnalyticsRange,
) {
	const params = new URLSearchParams({ tab: "all" });
	if (kind === "symbol") {
		params.set("symbol", breakdown.key);
		params.set("range", range);
	} else {
		params.set("episodeClosedDate", breakdown.key);
	}
	return `/dashboard/brokerage?${params.toString()}`;
}

function formatDay(value: string) {
	const date = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});
}

function BreakdownItem({
	title,
	kind,
	breakdown,
	range,
	onNavigate,
}: {
	title: string;
	kind: BreakdownKind;
	breakdown: PerformanceBreakdown | null;
	range: AnalyticsRange;
	onNavigate: (destination: string) => void;
}) {
	if (!breakdown) {
		return (
			<div className="rounded-xl border bg-background/70 px-4 py-3">
				<p className="text-[0.625rem] font-medium text-muted-foreground">
					{title}
				</p>
				<p className="mt-3 text-sm text-muted-foreground">No closed trades</p>
			</div>
		);
	}

	const limitedSample = breakdown.tradeCount < 3;
	const destination = buildBreakdownDestination(kind, breakdown, range);

	return (
		<button
			type="button"
			onClick={() => onNavigate(destination)}
			className="group rounded-xl border bg-background/70 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring/40"
			aria-label={`Open ${title.toLowerCase()} ${breakdown.key} in Brokerage`}
		>
			<div className="flex items-center justify-between gap-3">
				<p className="text-[0.625rem] font-medium text-muted-foreground">
					{title}
				</p>
				<HugeiconsIcon
					icon={ArrowUpRight01Icon}
					className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
					strokeWidth={2}
					aria-hidden
				/>
			</div>
			<div className="mt-2 flex items-end justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate text-base font-semibold">
						{kind === "day" ? formatDay(breakdown.key) : breakdown.key}
					</p>
					<p className="mt-1 text-[0.625rem] text-muted-foreground">
						{breakdown.winRate.toFixed(2)}% win rate · {breakdown.tradeCount}{" "}
						{breakdown.tradeCount === 1 ? "trade" : "trades"}
					</p>
				</div>
				<p
					className={cn(
						"shrink-0 font-mono text-sm font-semibold tabular-nums",
						breakdown.netPnl < 0 ? "text-rose-600" : "text-emerald-600",
					)}
				>
					{formatPnl(breakdown.netPnl, { precision: "cents" })}
				</p>
			</div>
			{limitedSample ? (
				<span className="mt-2 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.58rem] font-medium text-amber-700 dark:text-amber-400">
					Limited sample
				</span>
			) : null}
		</button>
	);
}

export function WinnersLeaksSummary({
	performance,
	range,
	rangeLabel,
	onNavigate,
}: {
	performance: TradingPerformance;
	range: AnalyticsRange;
	rangeLabel: string;
	onNavigate: (destination: string) => void;
}) {
	return (
		<div>
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-2">
					<h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
						Winners &amp; Leaks
					</h2>
					<MetricHelp
						title="Winners & Leaks"
						description="Ranks the strongest and weakest symbols and trading days among closed broker-derived trades in the selected range."
						formula="Rank by net realized P&L; win rate excludes breakeven trades"
					/>
				</div>
				<span className="text-xs text-muted-foreground">{rangeLabel}</span>
			</div>

			<div className="mt-4 grid gap-3 @md/winners:grid-cols-2">
				<BreakdownItem
					title="Best symbol"
					kind="symbol"
					breakdown={performance.bestSymbol}
					range={range}
					onNavigate={onNavigate}
				/>
				<BreakdownItem
					title="Worst symbol"
					kind="symbol"
					breakdown={performance.worstSymbol}
					range={range}
					onNavigate={onNavigate}
				/>
				<BreakdownItem
					title="Best day"
					kind="day"
					breakdown={performance.bestDay}
					range={range}
					onNavigate={onNavigate}
				/>
				<BreakdownItem
					title="Worst day"
					kind="day"
					breakdown={performance.worstDay}
					range={range}
					onNavigate={onNavigate}
				/>
			</div>
		</div>
	);
}

export function DashboardWinnersLeaksCard({
	range,
}: {
	range: AnalyticsRange;
}) {
	const workspace = useActiveWorkspace();
	const { navigate } = useTradstryPlatform();
	const { data, isLoading, isPending, isPlaceholderData, error, refetch } =
		useTradingPerformance(workspace?.id ?? null, { range });

	if (!workspace) return null;

	if (isLoading || isPending) {
		return (
			<section className="@container/winners rounded-xl border border-border/70 bg-card/55 p-4">
				<Skeleton className="h-4 w-36" />
				<div className="mt-4 grid gap-3 @md/winners:grid-cols-2">
					{["a", "b", "c", "d"].map((key) => (
						<Skeleton key={key} className="h-28 rounded-xl" />
					))}
				</div>
			</section>
		);
	}

	if (error) {
		return (
			<DashboardCardError
				title="Winners & Leaks"
				error={error}
				onRetry={refetch}
				className="min-h-[20rem]"
			/>
		);
	}

	if (!data) return null;

	return (
		<section
			className={cn(
				"@container/winners h-full rounded-xl border border-border/70 bg-card/55 p-4 transition-opacity duration-200",
				isPlaceholderData && "opacity-60",
			)}
		>
			<WinnersLeaksSummary
				performance={data}
				range={range}
				rangeLabel={rangeSublabel(range)}
				onNavigate={navigate}
			/>
		</section>
	);
}
