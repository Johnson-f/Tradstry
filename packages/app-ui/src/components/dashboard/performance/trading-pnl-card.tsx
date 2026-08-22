"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { MetricHelp } from "@tradstry/app-ui/components/dashboard/performance/metrics-row";
import { DashboardCardError } from "@tradstry/app-ui/components/dashboard/shared/card-error";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@tradstry/app-ui/components/ui/chart";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import { useTradingPerformance } from "@tradstry/app-ui/hooks/analytics";
import { rangeSublabel } from "@tradstry/app-ui/lib/range-format";
import type {
  AnalyticsRange,
  TradingPerformance,
} from "@tradstry/app-ui/lib/types/analytics";
import { cn } from "@tradstry/app-ui/lib/utils";
import { useId } from "react";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const COMPACT_USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const CHART_CONFIG = {
  cumulativePnl: {
    label: "Cumulative realized P&L",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function TradingPerformanceSummary({
  performance,
  rangeLabel,
}: {
  performance: TradingPerformance;
  rangeLabel: string;
}) {
  const amount = USD.format(performance.totalRealizedPnl);
  const closedLabel = countLabel(
    performance.closedTradeCount,
    "closed trade",
    "closed trades",
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Trading P&amp;L
          </h2>
          <MetricHelp
            title="Trading P&L"
            description="Realized profit and loss from completed broker-derived trades in the selected range. Open and unresolved trades are excluded."
            formula="Σ closed-trade proceeds − cost basis − fees"
          />
        </div>
        <span className="text-xs text-muted-foreground">{rangeLabel}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p
            role="img"
            aria-label={`Cumulative realized trading P&L for ${rangeLabel}: ${amount} from ${closedLabel}.`}
            className={cn(
              "text-3xl font-semibold tabular-nums",
              performance.totalRealizedPnl < 0
                ? "text-rose-600"
                : "text-emerald-600",
            )}
          >
            {amount}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Realized from {closedLabel}
          </p>
        </div>
        <dl className="flex gap-4 text-xs tabular-nums">
          <div>
            <dt className="text-muted-foreground">Wins</dt>
            <dd className="mt-0.5 font-semibold text-emerald-600">
              {performance.winningTradeCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Breakeven</dt>
            <dd className="mt-0.5 font-semibold">
              {performance.breakevenTradeCount}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Losses</dt>
            <dd className="mt-0.5 font-semibold text-rose-600">
              {performance.losingTradeCount}
            </dd>
          </div>
        </dl>
      </div>

      {performance.openPositionCount > 0 || performance.needsReviewCount > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-muted/40 px-3 py-2 text-[0.65rem] text-muted-foreground">
          {performance.openPositionCount > 0 ? (
            <span>
              {countLabel(
                performance.openPositionCount,
                "open position excluded",
                "open positions excluded",
              )}
            </span>
          ) : null}
          {performance.needsReviewCount > 0 ? (
            <span className="text-amber-700 dark:text-amber-400">
              {countLabel(
                performance.needsReviewCount,
                "trade needs grouping review",
                "trades need grouping review",
              )}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DashboardTradingPerformanceCard({
  range,
}: {
  range: AnalyticsRange;
}) {
  const activeWorkspace = useActiveWorkspace();
  const gradientId = useId();
  const { data, isLoading, isPending, isPlaceholderData, error, refetch } =
    useTradingPerformance(activeWorkspace?.id ?? null, { range });
  const rangeLabel = rangeSublabel(range);

  if (!activeWorkspace) return null;

  if (isLoading || isPending) {
    return (
      <section className="rounded-2xl border bg-background/90 p-4 shadow-sm">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-[260px] w-full rounded-xl" />
      </section>
    );
  }

  if (error) {
    return (
      <DashboardCardError
        title="Trading P&L"
        error={error}
        onRetry={refetch}
        className="min-h-[24rem]"
      />
    );
  }

  if (!data) return null;

  return (
    <section
      className={cn(
        "rounded-2xl border bg-background/90 p-4 shadow-sm transition-opacity duration-200",
        isPlaceholderData && "opacity-60",
      )}
    >
      <TradingPerformanceSummary
        performance={data}
        rangeLabel={rangeLabel}
      />

      {data.points.length === 0 ? (
        <div className="mt-6 flex h-[220px] items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            No completed broker trades closed during {rangeLabel}.
          </p>
        </div>
      ) : (
        <ChartContainer
          config={CHART_CONFIG}
          className="mt-4 h-[250px] w-full"
        >
          <AreaChart data={data.points} margin={{ left: 4, right: 12 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-cumulativePnl)"
                  stopOpacity={0.24}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-cumulativePnl)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={shortDate}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(value: number) => COMPACT_USD.format(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => shortDate(String(label))}
                  formatter={(value, name, item) => (
                    <div className="grid w-full grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                      <span className="text-muted-foreground">
                        {CHART_CONFIG[name as keyof typeof CHART_CONFIG]?.label ??
                          name}
                      </span>
                      <span className="text-right font-mono tabular-nums">
                        {USD.format(Number(value))}
                      </span>
                      <span className="text-muted-foreground">Daily P&amp;L</span>
                      <span className="text-right font-mono tabular-nums">
                        {USD.format(Number(item.payload.dailyPnl))}
                      </span>
                      <span className="text-muted-foreground">Closed trades</span>
                      <span className="text-right font-mono tabular-nums">
                        {item.payload.closedTradeCount}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              dataKey="cumulativePnl"
              type="monotone"
              stroke="var(--color-cumulativePnl)"
              fill={`url(#${gradientId})`}
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </section>
  );
}
