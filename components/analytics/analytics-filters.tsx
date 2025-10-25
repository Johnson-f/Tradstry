"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { ChevronDown, Filter, Calendar, X } from "lucide-react";
import { format, subDays, startOfYear } from 'date-fns';

type PeriodType = '7d' | '30d' | '90d' | '1y' | 'all_time' | 'custom';

interface AnalyticsFiltersType {
  periodType: PeriodType;
  customStartDate: Date | null;
  customEndDate: Date | null;
}

interface AnalyticsFiltersProps {
  onFiltersChange?: (filters: AnalyticsFiltersType) => void;
  initialFilters?: AnalyticsFiltersType;
}

export function AnalyticsFilters({ onFiltersChange, initialFilters }: AnalyticsFiltersProps) {
  const [filters, setFilters] = useState<AnalyticsFiltersType>({
    periodType: '30d',
    customStartDate: null,
    customEndDate: null,
    ...initialFilters
  });

  // Calculate date range based on period type
  const getDateRange = (periodType: PeriodType) => {
    const today = new Date();
    switch (periodType) {
      case '7d':
        return {
          start: subDays(today, 7),
          end: today
        };
      case '30d':
        return {
          start: subDays(today, 30),
          end: today
        };
      case '90d':
        return {
          start: subDays(today, 90),
          end: today
        };
      case '1y':
        return {
          start: startOfYear(today),
          end: today
        };
      case 'all_time':
        return {
          start: null,
          end: null
        };
      case 'custom':
        return {
          start: filters.customStartDate,
          end: filters.customEndDate
        };
      default:
        return {
          start: subDays(today, 30),
          end: today
        };
    }
  };

  const handlePeriodChange = (newPeriodType: PeriodType) => {
    const dateRange = getDateRange(newPeriodType);
    const newFilters = {
      ...filters,
      periodType: newPeriodType,
      customStartDate: dateRange.start,
      customEndDate: dateRange.end
    };
    setFilters(newFilters);
    onFiltersChange?.(newFilters);
  };

  const handleClear = () => {
    const defaultFilters: AnalyticsFiltersType = {
      periodType: 'all_time',
      customStartDate: null,
      customEndDate: null
    };
    setFilters(defaultFilters);
    onFiltersChange?.(defaultFilters);
  };

  // Notify parent of initial filters
  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange(filters);
    }
  }, [filters, onFiltersChange]);

  const currentDateRange = getDateRange(filters.periodType || '30d');
  const displayDateRange = currentDateRange.start && currentDateRange.end 
    ? `${format(currentDateRange.start, 'MMM d')} - ${format(currentDateRange.end, 'MMM d')}`
    : 'All Time';

  return (
    <div className="flex items-center justify-between p-4 border-b bg-white">
      <div className="flex items-center space-x-4">
        {/* Side Dropdown - Future feature */}
        <div className="flex items-center">
          <span className="text-sm text-gray-700 mr-2">Side</span>
          <div className="relative">
            <select 
              className="h-8 pl-3 pr-8 text-sm border rounded-md appearance-none bg-white min-w-[80px]"
              disabled
            >
              <option>All</option>
              <option>Long</option>
              <option>Short</option>
            </select>
            <ChevronDown className="absolute right-2 top-2 h-4 w-4 text-gray-400" />
          </div>
        </div>
        
        {/* Duration Dropdown */}
        <div className="flex items-center">
          <span className="text-sm text-gray-700 mr-2">Duration</span>
          <div className="relative">
            <select 
              className="h-8 pl-3 pr-8 text-sm border rounded-md appearance-none bg-white min-w-[100px]"
              value={filters.periodType}
              onChange={(e) => handlePeriodChange(e.target.value as PeriodType)}
            >
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="1y">Year to date</option>
              <option value="all_time">All Time</option>
            </select>
            <ChevronDown className="absolute right-2 top-2 h-4 w-4 text-gray-400" />
          </div>
        </div>
        
        {/* Date Range Display */}
        <div className="flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-700">{displayDateRange}</span>
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        {/* Advanced Button - Future feature */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 text-sm text-gray-700 hover:bg-gray-100"
          disabled
        >
          <Filter className="h-4 w-4 mr-1" />
          Advanced
        </Button>
        
        {/* Clear Button */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 text-sm text-gray-700 hover:bg-gray-100"
          onClick={handleClear}
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>
    </div>
  );
}
