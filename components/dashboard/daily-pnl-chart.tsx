'use client';

import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDailyPnL } from '@/hooks/use-daily-pnl';

interface DailyPnLChartProps {
  periodType?: '7d' | '30d' | '90d' | '1y' | 'all_time' | 'custom';
  customStartDate?: Date;
  customEndDate?: Date;
  className?: string;
}

// Format currency with commas and no decimal places
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

export function DailyPnLChart({ 
  periodType = '30d',
  customStartDate,
  customEndDate,
  className
}: DailyPnLChartProps) {
  const { data, isLoading, error } = useDailyPnL({
    periodType,
    customStartDate,
    customEndDate,
  });

  // Format data for chart with proper types and validation
  const chartData = React.useMemo(() => {
    if (!data) return [];
    
    return data
      .filter(item => item?.trade_date) // Filter out items with null/undefined trade_date
      .map(item => {
        try {
          const date = new Date(item.trade_date);
          const pnl = item.total_pnl || 0;
          
          // Check if the date is valid
          if (isNaN(date.getTime())) {
            console.warn('Invalid date:', item.trade_date);
            return null;
          }
          
          return {
            date: format(date, 'MM/dd/yyyy'),
            fullDate: item.trade_date,
            pnl,
            trades: item.total_trades || 0,
            color: pnl >= 0 ? '#10b981' : '#ef4444'
          };
        } catch (error) {
          console.error('Error formatting date:', error, 'Date string:', item.trade_date);
          return null;
        }
      })
      .filter(Boolean) // Remove any null entries from invalid dates
      .sort((a, b) => new Date(a.fullDate).getTime() - new Date(b.fullDate).getTime()); // Sort chronologically
  }, [data]);

  interface TooltipData {
    date: string;
    pnl: number;
    trades: number;
  }

  const CustomTooltip = ({ active, payload }: { active?: boolean, payload?: Array<{payload: TooltipData}> }) => {
    if (active && payload && payload[0]) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border rounded-lg p-2 shadow-lg">
          <p className="text-xs font-medium">{data.date}</p>
          <p className={cn(
            "text-xs font-bold",
            data.pnl >= 0 ? "text-green-500" : "text-red-500"
          )}>
            P&L: {formatCurrency(data.pnl)}
          </p>
          <p className="text-xs text-muted-foreground">Trades: {data.trades}</p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">Net Daily P&L</p>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">Net Daily P&L</p>
            <Info className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">Failed to load data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-muted-foreground">Net Daily P&L</p>
          <Info className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: 5,
                right: 5,
                left: 5,
                bottom: 25,
              }}
              barCategoryGap="10%"
            >
              <XAxis 
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                angle={-45}
                textAnchor="end"
                height={25}
                interval={Math.max(0, Math.floor(chartData.length / 8))} // Show fewer labels
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickFormatter={(value) => `$${value >= 0 ? value : Math.abs(value)}`}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="pnl" 
                radius={[1, 1, 0, 0]}
                maxBarSize={8}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}