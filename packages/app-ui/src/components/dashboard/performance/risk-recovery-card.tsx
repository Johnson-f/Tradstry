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
  drawdown: {
    label: "Drawdown from peak",
    color: "var(--loss)",
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

function streakLabel(streak: number) {
  if (streak > 0) return `${streak}-win streak`;
  if (streak < 0) return `${Math.abs(streak)}-loss streak`;
  return "No active streak";
}

function RiskStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/70 px-3 py-2.5">
      <p className="text-[0.625rem] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function RiskRecoverySummary({
  performance,
  rangeLabel,
}: {
  performance: TradingPerformance;
  rangeLabel: string;
}) {
  const atPeak = performance.currentDrawdown <= 0.005;
  const currentStatus = atPeak
    ? "At filtered-range peak"
    : `${USD.format(performance.currentDrawdown)} below peak`;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Risk &amp; Recovery
          </h2>
          <MetricHelp
            title="Risk & Recovery"
            description="Shows how far filtered realized P&L has fallen from its previous high and how losses cluster into streaks."
            formula="Drawdown = running P&L peak − current cumulative P&L"
          />
        </div>
        <span className="text-xs text-muted-foreground">{rangeLabel}</span>
      </div>

      <div className="mt-4 grid gap-3 @2xl/risk:grid-cols-[minmax(13rem,0.8fr)_minmax(0,2.2fr)]">
        <div className="rounded-xl bg-muted/30 px-4 py-3">
          <p
            role="img"
            aria-label={`Current drawdown status for ${rangeLabel}: ${currentStatus}.`}
            className={cn(
              "text-2xl font-semibold tabular-nums",
              atPeak ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {currentStatus}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {atPeak
              ? "No recovery is currently required."
              : `${USD.format(performance.currentDrawdown)} of realized P&L is needed to recover the peak.`}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 @xl/risk:grid-cols-4">
          <RiskStat
            label="Maximum drawdown"
            value={USD.format(performance.maxDrawdown)}
          />
          <RiskStat
            label="Peak P&L"
            value={USD.format(performance.peakRealizedPnl)}
          />
          <RiskStat
            label="Current streak"
            value={streakLabel(performance.currentStreak)}
          />
          <RiskStat
            label="Longest losing streak"
            value={String(performance.longestLossStreak)}
          />
        </div>
      </div>
    </div>
  );
}

export function DashboardRiskRecoveryCard({
  range,
}: {
  range: AnalyticsRange;
}) {
  const workspace = useActiveWorkspace();
  const gradientId = useId();
  const { data, isLoading, isPending, isPlaceholderData, error, refetch } =
    useTradingPerformance(workspace?.id ?? null, { range });
  const rangeLabel = rangeSublabel(range);

  if (!workspace) return null;

  if (isLoading || isPending) {
    return (
      <section className="rounded-2xl border bg-background/90 p-4 shadow-sm">
        <Skeleton className="h-4 w-36" />
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <Skeleton className="h-20 rounded-xl" />
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton key={key} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-3 h-44 rounded-xl" />
      </section>
    );
  }

  if (error) {
    return (
      <DashboardCardError
        title="Risk & Recovery"
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
        "@container/risk rounded-2xl border bg-background/90 p-4 shadow-sm transition-opacity duration-200",
        isPlaceholderData && "opacity-60",
      )}
    >
      <RiskRecoverySummary performance={data} rangeLabel={rangeLabel} />

      {data.points.length <= 1 ? (
        <div className="mt-4 flex h-24 items-center justify-center rounded-xl border border-dashed bg-muted/10 px-6 text-center">
          <p className="text-sm text-muted-foreground">
            Close more broker trades to build a drawdown history.
          </p>
        </div>
      ) : (
        <ChartContainer config={CHART_CONFIG} className="mt-3 h-[180px] w-full">
          <AreaChart data={data.points} margin={{ left: 4, right: 12 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-drawdown)"
                  stopOpacity={0.22}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-drawdown)"
                  stopOpacity={0.03}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              minTickGap={48}
              tickFormatter={shortDate}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(value: number) => COMPACT_USD.format(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label) => shortDate(String(label))}
                  formatter={(value) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        Drawdown from peak
                      </span>
                      <span className="font-mono tabular-nums">
                        {USD.format(Math.abs(Number(value)))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Area
              dataKey="drawdown"
              type="monotone"
              stroke="var(--color-drawdown)"
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
