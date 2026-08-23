"use client";

import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardCardError } from "@tradstry/app-ui/components/dashboard/shared/card-error";
import { Skeleton } from "@tradstry/app-ui/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tradstry/app-ui/components/ui/tooltip";
import { useActiveWorkspace } from "@tradstry/app-ui/components/workspaces";
import { useTradingPerformance } from "@tradstry/app-ui/hooks/analytics";
import { rangeSublabel } from "@tradstry/app-ui/lib/range-format";
import type { AnalyticsRange } from "@tradstry/app-ui/lib/types/analytics";
import { cn, formatPnl } from "@tradstry/app-ui/lib/utils";
import type { ReactNode } from "react";

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number) {
  const formatted = formatPnl(value, { precision: "cents" });
  return formatted.startsWith("+") ? formatted.slice(1) : formatted;
}

function formatPercent(value: number) {
  return `${percentFormatter.format(value)}%`;
}

function formatProfitFactor(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}

function outcomeLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function MetricHelp({
  title,
  description,
  formula,
}: {
  title: string;
  description: string;
  formula: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`About ${title}`}
          className="inline-flex rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <HugeiconsIcon
            icon={InformationCircleIcon}
            className="size-4"
            strokeWidth={2}
            aria-hidden
          />
          <span className="sr-only">
            {description} Formula: {formula}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        className="max-w-72 flex-col items-start gap-1.5 px-3 py-2.5 text-left"
      >
        <p className="font-medium">{description}</p>
        <p className="font-mono text-[0.65rem] text-background/75">
          Formula: {formula}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function MetricShell({
  title,
  description,
  formula,
  badge,
  children,
}: {
  title: string;
  description: string;
  formula: string;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <article className="min-h-36 bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <h2 className="text-xs font-medium">{title}</h2>
        <MetricHelp title={title} description={description} formula={formula} />
        {badge !== undefined ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.625rem] font-medium tabular-nums text-foreground">
            {badge}
          </span>
        ) : null}
      </div>
      {children}
    </article>
  );
}

export function WinRateGauge({
  label,
  rate,
  wins,
  breakevens,
  losses,
}: {
  label: string;
  rate: number;
  wins: number;
  breakevens: number;
  losses: number;
}) {
  const decisiveOutcomes = wins + losses;
  const winShare = decisiveOutcomes > 0 ? (wins / decisiveOutcomes) * 100 : 0;
  const lossShare =
    decisiveOutcomes > 0 ? (losses / decisiveOutcomes) * 100 : 0;
  const accessibleLabel = `${label}: ${formatPercent(rate)}. ${outcomeLabel(wins, "win", "wins")}, ${outcomeLabel(breakevens, "breakeven", "breakevens")}, ${outcomeLabel(losses, "loss", "losses")}.`;

  return (
    <div
      role="img"
      aria-label={accessibleLabel}
      className="mt-3 grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2"
    >
      <p className="text-3xl font-semibold tabular-nums text-foreground">
        {formatPercent(rate)}
      </p>
      <div>
        <svg
          viewBox="0 0 120 68"
          className="h-14 w-full overflow-visible"
          aria-hidden
        >
          <title>{accessibleLabel}</title>
          <path
            d="M 15 58 A 45 45 0 0 1 105 58"
            pathLength="100"
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinecap="butt"
            className="text-muted"
          />
          {winShare > 0 ? (
            <path
              d="M 15 58 A 45 45 0 0 1 105 58"
              pathLength="100"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeDasharray={`${winShare} 100`}
              className="text-emerald-500"
            />
          ) : null}
          {lossShare > 0 ? (
            <path
              d="M 15 58 A 45 45 0 0 1 105 58"
              pathLength="100"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeDasharray={`${lossShare} 100`}
              strokeDashoffset={-winShare}
              className="text-rose-500"
            />
          ) : null}
        </svg>
        <div className="-mt-1 grid grid-cols-3 gap-1 text-center text-[0.6rem] font-medium tabular-nums">
          <span className="rounded-full bg-emerald-500/10 py-0.5 text-emerald-600">
            {wins}
          </span>
          <span className="rounded-full bg-sky-500/10 py-0.5 text-sky-600">
            {breakevens}
          </span>
          <span className="rounded-full bg-rose-500/10 py-0.5 text-rose-600">
            {losses}
          </span>
        </div>
      </div>
    </div>
  );
}

export function RiskRewardValue({
  value,
  qualifyingTradeCount,
}: {
  value: number | null;
  qualifyingTradeCount: number;
}) {
  if (value === null) {
    return (
      <div
        role="img"
        aria-label="Average risk-to-reward unavailable"
        className="mt-5"
      >
        <p className="text-3xl font-semibold text-muted-foreground">—</p>
        <p className="mt-2 text-xs text-muted-foreground">No defined risk</p>
      </div>
    );
  }

  const formatted = `${value.toFixed(2)}R`;

  return (
    <div
      role="img"
      aria-label={`Average risk-to-reward ${formatted}`}
      className="mt-5"
    >
      <p className="text-3xl font-semibold tabular-nums text-foreground">
        {formatted}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {qualifyingTradeCount} risk-defined{" "}
        {qualifyingTradeCount === 1 ? "trade" : "trades"}
      </p>
    </div>
  );
}

function ProfitFactorDonut({ value }: { value: number | null }) {
  const profitableShare =
    value === null || value <= 0 ? 0 : (value / (value + 1)) * 100;
  const lossShare = value === null ? 0 : 100 - profitableShare;

  return (
    <div
      role="img"
      aria-label={`Profit factor ${formatProfitFactor(value)}`}
      className="mt-4 flex items-center justify-between gap-4"
    >
      <p className="text-3xl font-semibold tabular-nums">
        {formatProfitFactor(value)}
      </p>
      <svg viewBox="0 0 48 48" className="size-20 -rotate-90" aria-hidden>
        <title>Profit factor composition</title>
        <circle
          cx="24"
          cy="24"
          r="18"
          pathLength="100"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-muted"
        />
        {profitableShare > 0 ? (
          <circle
            cx="24"
            cy="24"
            r="18"
            pathLength="100"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeDasharray={`${profitableShare} 100`}
            className="text-emerald-500"
          />
        ) : null}
        {lossShare > 0 ? (
          <circle
            cx="24"
            cy="24"
            r="18"
            pathLength="100"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeDasharray={`${lossShare} 100`}
            strokeDashoffset={-profitableShare}
            className="text-rose-500"
          />
        ) : null}
      </svg>
    </div>
  );
}

export function WinLossBar({
  averageWin,
  averageLoss,
}: {
  averageWin: number;
  averageLoss: number;
}) {
  const total = averageWin + averageLoss;
  const winShare = total > 0 ? (averageWin / total) * 100 : 0;
  const lossShare = total > 0 ? (averageLoss / total) * 100 : 0;
  const ratio = averageLoss > 0 ? averageWin / averageLoss : null;
  const ratioLabel = ratio === null ? "-" : ratio.toFixed(2);

  return (
    <div
      role="img"
      aria-label={`Average win ${formatCurrency(averageWin)}, average loss ${formatCurrency(averageLoss)}, ratio ${ratioLabel}`}
      className="mt-4 grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3"
    >
      <p className="text-3xl font-semibold tabular-nums">{ratioLabel}</p>
      <div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
          <span
            className="h-full bg-emerald-500"
            style={{ width: `${winShare}%` }}
          />
          <span
            className="h-full bg-rose-500"
            style={{ width: `${lossShare}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between gap-2 text-xs font-medium tabular-nums">
          <span className="text-emerald-600">{formatCurrency(averageWin)}</span>
          <span className="text-rose-600">-{formatCurrency(averageLoss)}</span>
        </div>
      </div>
    </div>
  );
}

export function DashboardUpperCard({ range }: { range: AnalyticsRange }) {
  const activeWorkspace = useActiveWorkspace();
  const performance = useTradingPerformance(activeWorkspace?.id ?? null, {
    range,
  });

  if (!activeWorkspace) {
    return (
      <section className="rounded-xl border border-border/70 bg-card/55 p-5">
        <p className="text-sm font-medium text-foreground">
          No active workspace
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a workspace to load dashboard analytics.
        </p>
      </section>
    );
  }

  if (performance.isLoading || performance.isPending) {
    return (
      <section className="pt-3">
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-5">
          {["a", "b", "c", "d", "e"].map((key) => (
            <Skeleton key={key} className="h-36 rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  const error = performance.error;
  if (error) {
    return (
      <DashboardCardError
        title="Dashboard metrics"
        error={error}
        onRetry={performance.refetch}
      />
    );
  }

  if (!performance.data) return null;

  const performanceData = performance.data;

  return (
    <section
      className={cn(
        "pt-3 transition-opacity duration-200",
        performance.isPlaceholderData && "opacity-60",
      )}
    >
      <div className="grid gap-px overflow-hidden rounded-xl border border-border/70 bg-border/70 sm:grid-cols-2 lg:grid-cols-5">
        <MetricShell
          title="Net P&L"
          description={`Net realized profit and loss from completed broker-derived trades · ${rangeSublabel(range)}.`}
          formula="Σ closed-trade proceeds − cost basis − fees"
          badge={performanceData.closedTradeCount}
        >
          <p
            className={cn(
              "mt-5 text-3xl font-semibold tabular-nums",
              performanceData.totalRealizedPnl >= 0
                ? "text-emerald-600"
                : "text-rose-600",
            )}
          >
            {formatCurrency(performanceData.totalRealizedPnl)}
          </p>
        </MetricShell>

        <MetricShell
          title="Average risk-to-reward"
          description="Average realized profit or loss per unit of planned risk, using closed broker trades with a confirmed plan and valid stop."
          formula="Mean(realized P&L ÷ planned risk) across risk-defined trades"
        >
          <RiskRewardValue
            value={performanceData.averageRealizedR}
            qualifyingTradeCount={performanceData.riskDefinedTradeCount}
          />
        </MetricShell>

        <MetricShell
          title="Profit factor"
          description="How much gross profit was generated for every dollar of gross loss."
          formula="Gross profit ÷ |gross loss|"
        >
          <ProfitFactorDonut value={performanceData.profitFactor} />
        </MetricShell>

        <MetricShell
          title="Win Rate"
          description="Share of decisive closed trades that were profitable. Breakeven trades are excluded."
          formula="Wins ÷ (wins + losses) × 100"
        >
          <WinRateGauge
            label="Win rate"
            rate={performanceData.winRate}
            wins={performanceData.winningTradeCount}
            breakevens={performanceData.breakevenTradeCount}
            losses={performanceData.losingTradeCount}
          />
        </MetricShell>

        <MetricShell
          title="Avg win/loss trade"
          description="Compares the average dollar gain on winners with the average dollar loss on losers."
          formula="Average winning trade ÷ average losing trade"
        >
          <WinLossBar
            averageWin={performanceData.averageWin}
            averageLoss={performanceData.averageLoss}
          />
        </MetricShell>
      </div>
    </section>
  );
}
