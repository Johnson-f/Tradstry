"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PeriodType = "all_time" | "this_week" | "this_month" | "this_year" | "last_week" | "last_month" | "last_year" | "custom";

interface DateRangePickerProps {
  onDateChange: (dateRange: { startDate: Date | null; endDate: Date | null; periodType: PeriodType }) => void;
  className?: string;
}

export function DateRangePicker({ onDateChange, className }: DateRangePickerProps) {
  const [date, setDate] = useState<DateRange | undefined>({
    from: undefined,
    to: undefined,
  });
  const [periodType, setPeriodType] = useState<PeriodType>("all_time");

  const handlePeriodChange = (value: string) => {
    const newPeriodType = value as PeriodType;
    setPeriodType(newPeriodType);
    
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    switch (newPeriodType) {
      case "this_week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay());
        endDate = new Date(now);
        endDate.setDate(now.getDate() + (6 - now.getDay()));
        break;
      case "this_month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "this_year":
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      case "last_week":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - now.getDay() - 7);
        endDate = new Date(now);
        endDate.setDate(now.getDate() - now.getDay() - 1);
        break;
      case "last_month":
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case "last_year":
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
      case "all_time":
      default:
        startDate = null;
        endDate = null;
        break;
    }

    setDate({ from: startDate || undefined, to: endDate || undefined });
    onDateChange({ startDate, endDate, periodType: newPeriodType });
  };

  const handleDateSelect = (range: DateRange | undefined) => {
    setDate(range);
    if (range?.from && range?.to) {
      setPeriodType("custom");
      onDateChange({
        startDate: range.from,
        endDate: range.to,
        periodType: "custom",
      });
    }
  };

  return (
    <div className={cn("flex items-center space-x-2", className)}>
      <Select onValueChange={handlePeriodChange} value={periodType}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all_time">All Time</SelectItem>
          <SelectItem value="this_week">This Week</SelectItem>
          <SelectItem value="this_month">This Month</SelectItem>
          <SelectItem value="this_year">This Year</SelectItem>
          <SelectItem value="last_week">Last Week</SelectItem>
          <SelectItem value="last_month">Last Month</SelectItem>
          <SelectItem value="last_year">Last Year</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[240px] justify-start text-left font-normal",
              !date && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleDateSelect}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
