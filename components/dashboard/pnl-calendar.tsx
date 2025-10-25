/*
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDailyPnL } from "@/hooks/use-daily-pnl";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import React from 'react';

interface PnLCalendarProps {
  className?: string;
  timeRange?: '7d' | '30d' | '90d' | '1y' | 'all_time' | 'custom';
  customStartDate?: Date;
  customEndDate?: Date;
}

export function PnLCalendar({ 
  className = '', 
  timeRange = '30d',
  customStartDate,
  customEndDate 
}: PnLCalendarProps) {
  const [currentMonth, setCurrentMonth] = React.useState<Date>(new Date());
  
  const { data: dailyData, isLoading, error } = useDailyPnL({
    periodType: timeRange,
    customStartDate: timeRange === 'custom' ? customStartDate : undefined,
    customEndDate: timeRange === 'custom' ? customEndDate : undefined
  });

  const handlePreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handleToday = () => {
    setCurrentMonth(new Date());
  };

  // Create a map of date to P&L data for quick lookup
  const pnlByDate = React.useMemo(() => {
    const map = new Map<string, { pnl: number; trades: number }>();
    dailyData?.forEach(day => {
      map.set(day.trade_date, {
        pnl: day.total_pnl,
        trades: day.total_trades
      });
    });
    return map;
  }, [dailyData]);

  // Generate calendar days for the current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  
  const daysInMonth = eachDayOfInterval({
    start: monthStart,
    end: monthEnd
  });

  // Helper function to get color class based on P&L value
  const getPnlColor = (pnl: number | undefined) => {
    if (pnl === undefined) return 'bg-gray-100';
    if (pnl > 0) return 'bg-green-100 hover:bg-green-200';
    if (pnl < 0) return 'bg-red-100 hover:bg-red-200';
    return 'bg-gray-50';
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base font-medium flex items-center gap-2">
            Daily P&L Calendar
            <span className="text-xs text-muted-foreground ml-auto">
              <Info className="h-3.5 w-3.5" />
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("border-destructive", className)}>
        <CardHeader>
          <CardTitle className="text-base font-medium text-destructive">
            Error loading calendar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Failed to load P&L data. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Weekday headers
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">
          Daily P&L Calendar
        </CardTitle>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={handlePreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="w-28 text-center text-sm font-medium">
              {format(monthStart, 'MMMM yyyy')}
            </div>
            <Button variant="ghost" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          
          {/*
          {weekdays.map(day => (
            <div key={day} className="text-xs text-center font-medium text-muted-foreground pb-1">
              {day[0]}
            </div>
          ))}
          
          
          {Array.from({ length: monthStart.getDay() }).map((_, i) => (
            <div key={`empty-${i}`} className="h-16" />
          ))}
          
          
          {daysInMonth.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayData = pnlByDate.get(dateStr);
            const isCurrentDay = isToday(day);
            
            return (
              <div 
                key={dateStr}
                className={cn(
                  "h-16 p-1 border rounded-md flex flex-col items-center justify-center text-xs transition-colors",
                  getPnlColor(dayData?.pnl),
                  isToday(day) && "ring-2 ring-blue-500"
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center mb-0.5",
                  isCurrentDay && "bg-blue-500 text-white"
                )}>
                  {format(day, 'd')}
                </span>
                {dayData && (
                  <span className={cn(
                    "text-xs font-medium",
                    dayData.pnl > 0 ? "text-green-700" : "text-red-700"
                  )}>
                    {dayData.pnl > 0 ? '+' : ''}{dayData.pnl?.toFixed(0)}
                  </span>
                )}
                {dayData?.trades && (
                  <span className="text-[10px] text-muted-foreground">
                    {dayData.trades} {dayData.trades === 1 ? 'trade' : 'trades'}
                  </span>
                )}
              </div>
            );
          })}
        
        {/*
        <div className="mt-4 flex justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-green-100"></span>
            <span>Profit</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-red-100"></span>
            <span>Loss</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-gray-100"></span>
            <span>No Trades</span>
          </div>
        </div>
        */