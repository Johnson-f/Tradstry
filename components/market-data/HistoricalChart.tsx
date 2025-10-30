"use client";

import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { Candle } from "@/lib/types/market-data";

interface HistoricalChartProps {
  data: Candle[];
  className?: string;
  height?: number;
  color?: string;
}

export function HistoricalChart({
  data,
  className,
  height = 320,
  color = "#10b981",
}: HistoricalChartProps) {
  // Prepare chart-friendly data
  const chartData = React.useMemo(
    () =>
      (data || []).map((d) => ({
        time: d.time,
        close: Number(d.close),
        high: Number(d.high),
        low: Number(d.low),
        open: Number(d.open),
        volume: d.volume ? Number(d.volume) : undefined,
      })),
    [data]
  );

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
          <XAxis
            dataKey="time"
            tickMargin={8}
            minTickGap={24}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickMargin={8}
            width={60}
            tick={{ fontSize: 12 }}
            allowDecimals
          />
          <Tooltip
            formatter={(value: any) => [Number(value).toLocaleString(), "Close"]}
            labelFormatter={(label) => label}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke={color}
            fillOpacity={1}
            fill="url(#colorClose)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default HistoricalChart;


