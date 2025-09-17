"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, LoaderIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { AIReportGenerateRequest } from '@/lib/services/ai-reports-service';

interface ReportGenerationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (request: AIReportGenerateRequest) => void;
  isGenerating: boolean;
}

const TIME_RANGE_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 3 months' },
  { value: '1y', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
];

const REPORT_TYPE_OPTIONS = [
  { value: 'daily', label: 'Daily Report' },
  { value: 'weekly', label: 'Weekly Report' },
  { value: 'monthly', label: 'Monthly Report' },
  { value: 'custom', label: 'Custom Report' },
];

export function ReportGenerationDialog({ 
  open, 
  onOpenChange, 
  onGenerate, 
  isGenerating 
}: ReportGenerationDialogProps) {
  const [reportType, setReportType] = useState<string>('daily');
  const [timeRange, setTimeRange] = useState<string>('30d');
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

  const handleGenerate = () => {
    const request: AIReportGenerateRequest = {
      report_type: reportType,
      time_range: timeRange === 'custom' ? 'custom' : timeRange,
      include_tracking_data: true,
    };

    if (timeRange === 'custom') {
      if (startDate) {
        // Send ISO string format for proper datetime parsing
        request.custom_start_date = startDate.toISOString();
      }
      if (endDate) {
        // Send ISO string format for proper datetime parsing
        request.custom_end_date = endDate.toISOString();
      }
    }

    console.log('Generating report with request:', request);
    onGenerate(request);
  };

  const handleClose = () => {
    if (!isGenerating) {
      onOpenChange(false);
      // Reset form
      setReportType('daily');
      setTimeRange('30d');
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const isCustomRange = timeRange === 'custom';
  const canGenerate = isCustomRange ? startDate && endDate : true;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate AI Report</DialogTitle>
          <DialogDescription>
            Create a comprehensive AI analysis of your trading performance and insights.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="report-type">Report Type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue placeholder="Select report type" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="time-range">Time Range</Label>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger>
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isCustomRange && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      disabled={(date) => date > new Date() || (endDate && date > endDate)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => date > new Date() || (startDate && date < startDate)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          {isGenerating && (
            <div className="flex items-center justify-center py-4">
              <LoaderIcon className="h-6 w-6 animate-spin mr-2" />
              <span className="text-sm text-muted-foreground">
                Generating your AI report... This may take a few minutes.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isGenerating}>
            Cancel
          </Button>
          <Button 
            onClick={handleGenerate} 
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating ? (
              <>
                <LoaderIcon className="h-4 w-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              'Generate Report'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
