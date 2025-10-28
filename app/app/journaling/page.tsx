"use client";

import { useState } from 'react';
import BasicAnalytics from '@/components/journaling/basic-analytics';
import { TradeTable } from '@/components/journaling/trade-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type TimeRangeOption = '7d' | '30d' | '90d' | '1y' | 'ytd' | 'all_time';

const timeRangeOptions = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: '1 Year' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all_time', label: 'All Time' },
];

export default function JournalingPage() {
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('30d');

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Journaling</h1>
          <Select value={timeRange} onValueChange={(value) => setTimeRange(value as TimeRangeOption)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select time range" />
            </SelectTrigger>
            <SelectContent>
              {timeRangeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8 space-y-8">
            <BasicAnalytics initialTimeRange={timeRange} />
            <TradeTable />
          </div>
        </div>
      </div>
    </div>
  );
}
