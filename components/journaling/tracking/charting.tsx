'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { createChart, type IChartApi, type DeepPartial, type CandlestickSeriesPartialOptions, CandlestickSeries, type Time } from 'lightweight-charts';

interface CandlestickBar {
  time: number | string; // unix seconds or 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
}

interface ChartingProps {
  data: CandlestickBar[];
  height?: number; // fixed height, width is responsive to parent
  className?: string;
  options?: DeepPartial<Parameters<typeof createChart>[1]>; // chart options override
  seriesOptions?: DeepPartial<CandlestickSeriesPartialOptions>; // series options override
}

export function Charting({
  data,
  height = 360,
  className,
  options,
  seriesOptions,
}: ChartingProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ReturnType<IChartApi['addSeries']> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const initialChartOptions = useMemo(() => ({
    layout: {
      background: { type: 'solid' as const, color: 'transparent' },
      textColor: '#94a3b8',
    },
    grid: {
      vertLines: { color: 'rgba(148,163,184,0.12)' },
      horzLines: { color: 'rgba(148,163,184,0.12)' },
    },
    rightPriceScale: { borderColor: 'rgba(148,163,184,0.24)' },
    timeScale: { borderColor: 'rgba(148,163,184,0.24)' },
    localization: { priceFormatter: (p: number) => p.toString() },
  }), []);

  const initialSeriesOptions = useMemo<DeepPartial<CandlestickSeriesPartialOptions>>(
    () => ({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    }),
    []
  );

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      ...initialChartOptions,
      ...(options ?? {}),
    });
    chartRef.current = chart;

    const series = chart.addSeries(CandlestickSeries, {
      ...initialSeriesOptions,
      ...(seriesOptions ?? {}),
    });
    seriesRef.current = series;

    chart.timeScale().fitContent();

    // Observe width changes to keep chart responsive
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === container && chartRef.current) {
          const newWidth = Math.floor(entry.contentRect.width);
          if (newWidth > 0) {
            chartRef.current.applyOptions({ width: newWidth, height });
          }
        }
      }
    });
    ro.observe(container);
    resizeObserverRef.current = ro;

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, initialChartOptions, initialSeriesOptions, options, seriesOptions]);

  // Set/Update data when it changes
  useEffect(() => {
    if (!seriesRef.current) return;

    // Ensure time format is acceptable: number (seconds) or string 'YYYY-MM-DD'
    const mapped = data.map((bar) => ({
      time: (typeof bar.time === 'number' ? (bar.time as number) : (bar.time as string)) as Time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));

    seriesRef.current.setData(mapped);
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height }}
    />
  );
}

export default Charting;


