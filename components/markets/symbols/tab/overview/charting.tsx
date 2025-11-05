"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useHistorical, useQuote } from "@/lib/hooks/use-market-data-service";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { formatTimestamp } from "./price";

type Timeframe = "1D" | "5D" | "1M" | "6M" | "YTD" | "1Y" | "5Y" | "MAX";

interface TimeframeConfig {
  range: string;
  interval: string;
}

const TIMEFRAME_CONFIG: Record<Timeframe, TimeframeConfig> = {
  "1D": { range: "1d", interval: "1m" },
  "5D": { range: "5d", interval: "30m" },
  "1M": { range: "1mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "YTD": { range: "ytd", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1mo" },
  "MAX": { range: "max", interval: "1mo" },
};

interface ChartingProps {
  symbol: string;
  className?: string;
  onTimeframeChange?: (timeframe: Timeframe, periodChange: number | null) => void;
}

export function Charting({ symbol, className, onTimeframeChange }: ChartingProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1D");
  const config = TIMEFRAME_CONFIG[selectedTimeframe];

  const { historical, isLoading } = useHistorical(
    {
      symbol,
      range: config.range,
      interval: config.interval,
    },
    !!symbol
  );

  const { quote } = useQuote(symbol, !!symbol);

  const chartData = useMemo(() => {
    if (!historical?.candles) return [];
    return historical.candles.map((candle) => ({
      time: candle.time,
      value: candle.close,
      date: new Date(candle.time),
    }));
  }, [historical]);

  const periodChange = useMemo(() => {
    if (!chartData.length || !quote?.price) return null;
    const first = chartData[0];
    const current = parseFloat(quote.price);
    const start = first.value;
    if (!start || start === 0) return null;
    return ((current - start) / start) * 100;
  }, [chartData, quote]);

  const currentPrice = useMemo(() => {
    if (quote?.price) return parseFloat(quote.price);
    if (chartData.length > 0) return chartData[chartData.length - 1]?.value;
    return null;
  }, [quote, chartData]);

  useEffect(() => {
    onTimeframeChange?.(selectedTimeframe, periodChange);
  }, [selectedTimeframe, periodChange, onTimeframeChange]);

  const handleTimeframeChange = useCallback(
    (timeframe: Timeframe) => {
      setSelectedTimeframe(timeframe);
    },
    []
  );

  const formatXAxisLabel = useCallback((time: string) => {
    try {
      const date = new Date(time);
      if (selectedTimeframe === "1D") {
        return date.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      }
      if (selectedTimeframe === "5D") {
        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          hour12: true,
        });
      }
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    } catch {
      return time;
    }
  }, [selectedTimeframe]);

  const chartConfig = {
    price: {
      label: "Price",
      color: "hsl(var(--chart-1))",
    },
  };

  if (isLoading) {
    return <Loading className={className} />;
  }

  if (!chartData.length) {
    return (
      <div className={cn("rounded-2xl border bg-card/50 p-6", className)}>
        <div className="text-sm text-muted-foreground">No chart data available</div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border bg-card/50 overflow-hidden", className)}>
      <div className="p-4 sm:p-6">
        {/* Timeframe Selectors */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {(Object.keys(TIMEFRAME_CONFIG) as Timeframe[]).map((tf) => (
            <Button
              key={tf}
              variant={selectedTimeframe === tf ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleTimeframeChange(tf)}
              className={cn(
                "h-8 text-xs",
                selectedTimeframe === tf && "bg-muted"
              )}
            >
              {tf}
            </Button>
          ))}
        </div>

        {/* Chart */}
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <ChartContainer config={chartConfig} className="h-[400px] w-full">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.2)"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  tickFormatter={formatXAxisLabel}
                  stroke="rgba(148,163,184,0.5)"
                  tick={{ fill: "rgba(148,163,184,0.7)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  stroke="rgba(148,163,184,0.5)"
                  tick={{ fill: "rgba(148,163,184,0.7)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `$${value.toFixed(2)}`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `$${Number(value).toFixed(2)}`}
                      labelFormatter={(label) => formatTimestamp(new Date(label))}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fill="url(#areaGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#06b6d4" }}
                />
              </AreaChart>
            </ChartContainer>
          </div>

          {/* Price Display */}
          {currentPrice !== null && (
            <div className="hidden lg:block flex-shrink-0 w-48">
              <div className="rounded-lg border bg-card/50 p-4">
                <div className="text-2xl font-semibold mb-1">
                  ${currentPrice.toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatTimestamp(new Date())}
                </div>
                {periodChange !== null && (
                  <div
                    className={cn(
                      "text-sm font-medium mt-2",
                      periodChange > 0 ? "text-emerald-400" : periodChange < 0 ? "text-red-500" : "text-muted-foreground"
                    )}
                  >
                    {periodChange > 0 ? "+" : ""}
                    {periodChange.toFixed(2)}%
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Loading({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card/50 p-6", className)}>
      <div className="space-y-4">
        <div className="flex gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-12" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    </div>
  );
}

export default Charting;

