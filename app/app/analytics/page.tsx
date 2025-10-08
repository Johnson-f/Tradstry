"use client";

import { useState, useEffect } from 'react';
import { AnalyticsTabs } from "@/components/analytics/analytics-tabs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format, subDays, startOfYear, isWithinInterval } from "date-fns";
import { Calendar as CalendarIcon, ChevronDown, RefreshCw } from "lucide-react";

type TimeRange = '7d' | '30d' | '90d' | 'ytd' | '1y' | 'all';

export default function AnalyticsSectionPage() {
  const [date, setDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: subDays(new Date(), 30),
    end: new Date()
  });

  // Update date range when time range changes
  useEffect(() => {
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case '7d':
        startDate = subDays(now, 7);
        break;
      case '30d':
        startDate = subDays(now, 30);
        break;
      case '90d':
        startDate = subDays(now, 90);
        break;
      case 'ytd':
        startDate = startOfYear(now);
        break;
      case '1y':
        startDate = subDays(now, 365);
        break;
      case 'all':
      default:
        // A date far in the past to get all data
        startDate = new Date(2000, 0, 1);
        break;
    }

    setDateRange({
      start: startDate,
      end: now
    });
  }, [timeRange]);

  // Handle manual date selection
  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      setDate(selectedDate);
      setDateRange({
        start: selectedDate,
        end: new Date()
      });
      setTimeRange('custom');
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    // This will trigger a re-fetch of the data with the current filters
    // The actual implementation will depend on how you're fetching your data
    console.log('Refreshing with date range:', dateRange);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          
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
                      setTimeRange('custom');
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
              <option value="ytd">Year to date</option>
              <option value="1y">1-year</option>
              <option value="all">All time</option>
            </select>

            {/* Refresh Button */}
          
          </div>
        </div>
      </div>

      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            <AnalyticsTabs dateRange={dateRange} />
          </div>
        </div>
      </div>
    </div>
  );
}
