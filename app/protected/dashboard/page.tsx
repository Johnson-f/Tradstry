"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { ChevronDown } from "lucide-react";
import { useUserProfile } from "@/hooks/use-user-profile";
import { getTimeBasedGreeting } from "@/lib/utils/greetings";
import { MetricsCards } from "@/components/dashboard/metrics-cards";
import { TradingHeatmap } from "@/components/dashboard/trading-heatmap";

type TimeRange = '7d' | '30d' | '90d' | '1y' | 'all_time' | 'custom';

export default function DashboardPage() {
  const [date] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: subDays(new Date(), 30),
    end: new Date()
  });

  // Update date range when time range changes
  useEffect(() => {
    const today = new Date();
    switch (timeRange) {
      case '7d':
        setDateRange({
          start: subDays(today, 7),
          end: today
        });
        break;
      case '30d':
        setDateRange({
          start: subDays(today, 30),
          end: today
        });
        break;
      case '90d':
        setDateRange({
          start: subDays(today, 90),
          end: today
        });
        break;
      case '1y':
        setDateRange({
          start: subDays(today, 365),
          end: today
        });
        break;
      case 'all_time':
        // Default to last 5 years for 'all_time'
        setDateRange({
          start: subDays(today, 365 * 5),
          end: today
        });
        break;
      // 'custom' case doesn't need to do anything as the date range is managed by the date picker
    }
  }, [timeRange]);



  // Refresh is handled automatically by React Query when filters change

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          
          {/* Filter Controls */}
          <div className="flex items-center gap-4">
            {/* Date Range Picker */}
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[240px] justify-between text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  {format(dateRange.start, 'MMM d, yyyy')} - {format(dateRange.end, 'MMM d, yyyy')}
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{
                    from: dateRange.start,
                    to: dateRange.end
                  }}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      setDateRange({
                        start: range.from,
                        end: range.to
                      });
                      setTimeRange('custom' as TimeRange);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Time Range Selector */}
            <select 
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as TimeRange)}
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="7d">7 day</option>
              <option value="30d">30 day</option>
              <option value="90d">90 day</option>
              <option value="1y">1 year</option>
              <option value="all_time">All time</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8 space-y-8">
            <DashboardGreeting />
            
            {/* Metrics Cards */}
            <div className="space-y-4">
              <MetricsCards 
                filters={{
                  periodType: timeRange === 'custom' ? 'custom' : timeRange,
                  customStartDate: timeRange === 'custom' ? dateRange.start : undefined,
                  customEndDate: timeRange === 'custom' ? dateRange.end : undefined,
                }}
              />
            </div>
            
            {/* Trading Activity Heatmap */}
            <div className="space-y-4">
              <TradingHeatmap 
                periodType={timeRange === 'custom' ? 'custom' : timeRange}
                customStartDate={timeRange === 'custom' ? dateRange.start.toISOString().split('T')[0] : undefined}
                customEndDate={timeRange === 'custom' ? dateRange.end.toISOString().split('T')[0] : undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardGreeting() {
  const { firstName, loading, email } = useUserProfile();
  const { timeGreeting } = getTimeBasedGreeting();
  
  if (loading) {
    return <div className="h-8 w-64 bg-muted rounded animate-pulse"></div>;
  }

  // Get display name - prefer first name, fall back to email username
  const displayName = firstName || (email ? email.split('@')[0] : '');

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        {timeGreeting}{displayName ? `, ${displayName}` : ''}!
      </h1>
      {!firstName && email && (
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back! Update your profile to personalize your experience.
        </p>
      )}
    </div>
  );
}