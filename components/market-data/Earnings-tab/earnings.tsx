"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDailyEarningsSummary } from '@/lib/hooks/use-market-data';
import { Calendar, ChevronLeft, ChevronRight, Clock, Building2 } from 'lucide-react';
import type { EarningsCompany, DailyEarningsSummary } from '@/lib/types/market-data';

// Date utility functions
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const formatDisplayDate = (date: Date): { dayName: string; dateNum: string; fullDate: string } => {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getDate();
  return {
    dayName,
    dateNum: `${month} ${day}`,
    fullDate: `${dayName} ${month} ${day}`
  };
};

const getWeekDates = (startDate: Date): Date[] => {
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }
  return dates;
};

// Company card component
interface CompanyCardProps {
  company: EarningsCompany;
}

const CompanyCard: React.FC<CompanyCardProps> = ({ company }) => {
  const getQuarterText = () => {
    if (company.fiscal_quarter && company.fiscal_year) {
      return `Q${company.fiscal_quarter} '${String(company.fiscal_year).slice(-2)}`;
    }
    return null;
  };

  const getTimeText = () => {
    if (company.time_of_day) {
      const time = company.time_of_day.toLowerCase();
      if (time.includes('before')) return 'Before Market';
      if (time.includes('after')) return 'After Market';
      if (time.includes('during')) return 'During Market';
      return company.time_of_day;
    }
    return null;
  };

  const getStatusBadge = () => {
    if (company.status === 'reported') {
      return <Badge className="bg-green-600 text-white">LIVE</Badge>;
    }
    return null;
  };

  return (
    <div className="border-b border-gray-700 last:border-b-0 pb-6 last:pb-0 mb-6 last:mb-0">
      <div className="flex items-start gap-4">
        {/* Company logo placeholder */}
        <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Building2 className="w-6 h-6 text-white" />
        </div>

        <div className="flex-1 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-white">{company.symbol}</h3>
                {getStatusBadge()}
              </div>
              <p className="text-gray-400 text-sm">{company.symbol}</p>
            </div>
            <div className="text-right text-sm">
              {getQuarterText() && <div className="text-gray-400">{getQuarterText()}</div>}
              {getTimeText() && (
                <div className="flex items-center gap-1 text-gray-400">
                  <Clock className="w-3 h-3" />
                  {getTimeText()}
                </div>
              )}
            </div>
          </div>

          {/* Earnings summary */}
          {company.status === 'reported' && company.recent_news && company.recent_news.length > 0 && (
            <div className="text-sm text-gray-300 leading-relaxed bg-gray-800/50 p-4 rounded-lg">
              <p>{company.recent_news[0]?.summary || company.recent_news[0]?.content || 'Earnings results available.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Date card component
interface DateCardProps {
  date: Date;
  isSelected: boolean;
  isToday: boolean;
  onClick: () => void;
  earningsCount: number;
}

const DateCard: React.FC<DateCardProps> = ({ date, isSelected, isToday, onClick, earningsCount }) => {
  const { dayName, dateNum } = formatDisplayDate(date);
  
  return (
    <Card 
      className={`cursor-pointer transition-all hover:bg-gray-800/50 ${
        isSelected ? 'bg-teal-600/20 border-teal-500' : 'bg-gray-900 border-gray-700'
      } ${isToday ? 'ring-1 ring-blue-500' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4 text-center">
        <div className="text-sm text-gray-400 mb-1">{dayName}</div>
        <div className={`font-semibold mb-2 ${isSelected ? 'text-teal-300' : 'text-white'}`}>
          {dateNum}
        </div>
        <div className="text-xs">
          {earningsCount > 0 ? (
            <span className={`${isSelected ? 'text-teal-300' : 'text-gray-400'}`}>
              {earningsCount} Call{earningsCount !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="text-gray-500">No Calls</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Loading skeleton for date cards
const DateCardSkeleton: React.FC = () => (
  <Card className="bg-gray-900 border-gray-700">
    <CardContent className="p-4 text-center">
      <Skeleton className="w-8 h-4 mx-auto mb-1 bg-gray-700" />
      <Skeleton className="w-12 h-5 mx-auto mb-2 bg-gray-700" />
      <Skeleton className="w-10 h-3 mx-auto bg-gray-700" />
    </CardContent>
  </Card>
);

// Main earnings calendar component
export const EarningsCalendar: React.FC = () => {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    return startOfWeek;
  });
  
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  // Get current week dates
  const weekDates = useMemo(() => getWeekDates(currentWeekStart), [currentWeekStart]);
  
  // Fetch earnings data for selected date
  const { earningsSummary, isLoading, error } = useDailyEarningsSummary(formatDate(selectedDate));

  // Navigation functions
  const goToPreviousWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() - 7);
    setCurrentWeekStart(newStart);
  };

  const goToNextWeek = () => {
    const newStart = new Date(currentWeekStart);
    newStart.setDate(currentWeekStart.getDate() + 7);
    setCurrentWeekStart(newStart);
  };

  const goToToday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    setCurrentWeekStart(startOfWeek);
    setSelectedDate(today);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getEarningsCount = (date: Date) => {
    if (date.toDateString() === selectedDate.toDateString()) {
      return earningsSummary?.total_companies_reporting || 0;
    }
    // For other dates, we don't have data - would need to fetch for each date
    return 0;
  };

  // Get companies from earnings summary
  const companies = useMemo(() => {
    if (!earningsSummary) return [];
    
    const scheduled = earningsSummary.companies_scheduled || [];
    const reported = earningsSummary.companies_reported || [];
    
    return [...scheduled, ...reported].slice(0, 10); // Limit to 10 companies
  }, [earningsSummary]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Calendar className="w-6 h-6" />
          Earnings Calendar
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPreviousWeek}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextWeek}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-4">
        {weekDates.map((date, index) => (
          <DateCard
            key={index}
            date={date}
            isSelected={date.toDateString() === selectedDate.toDateString()}
            isToday={isToday(date)}
            onClick={() => setSelectedDate(date)}
            earningsCount={getEarningsCount(date)}
          />
        ))}
      </div>

      {/* Selected Date Details */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-white">
          {formatDisplayDate(selectedDate).fullDate}
        </h2>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load earnings data: {error.message}
            </AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="border-b border-gray-700 pb-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="w-12 h-12 rounded-lg bg-gray-700" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="w-20 h-6 bg-gray-700" />
                    <Skeleton className="w-32 h-4 bg-gray-700" />
                    <Skeleton className="w-full h-20 bg-gray-700" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No earnings reports scheduled for this date.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {companies.map((company, index) => (
              <CompanyCard key={`${company.symbol}-${index}`} company={company} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EarningsCalendar;