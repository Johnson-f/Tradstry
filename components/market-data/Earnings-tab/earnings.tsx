"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDailyEarningsSummary, useEarningsCalendarLogos } from '@/lib/hooks/use-market-data';
import { Calendar, ChevronLeft, ChevronRight, Building2, TrendingUp, TrendingDown } from 'lucide-react';
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
  logo?: string;
}

const CompanyCard: React.FC<CompanyCardProps> = ({ company, logo }) => {
  const getQuarterText = () => {
    if (company.fiscal_quarter && company.fiscal_year) {
      return `Q${company.fiscal_quarter} '${String(company.fiscal_year).slice(-2)}`;
    }
    return null;
  };

  const getTimeText = () => {
    if (company.time_of_day) {
      const time = company.time_of_day.toLowerCase();
      if (time.includes('before')) return 'bmo';
      if (time.includes('after')) return 'amc';
      if (time.includes('during')) return 'bmo';
      return 'bmo';
    }
    return 'bmo';
  };

  return (
    <Card className="bg-gray-900/50 border-gray-700 hover:bg-gray-800/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Company logo */}
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-blue-600 flex items-center justify-center flex-shrink-0 relative">
            {logo ? (
              <>
                <img
                  src={logo}
                  alt={`${company.symbol} logo`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = target.parentElement?.querySelector('.fallback-icon') as HTMLElement;
                    if (fallback) {
                      fallback.style.display = 'block';
                    }
                  }}
                />
                <Building2 className="fallback-icon w-5 h-5 text-white absolute inset-0 m-auto hidden" />
              </>
            ) : (
              <Building2 className="w-5 h-5 text-white" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Header with symbol and quarter */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">{company.symbol}</h3>
                <Badge variant="outline" className="text-xs border-gray-600 text-gray-400">
                  {getTimeText()}
                </Badge>
              </div>
              <div className="text-right">
                {getQuarterText() && (
                  <div className="text-sm font-medium text-gray-300">{getQuarterText()}</div>
                )}
                <div className="text-xs text-gray-500">10:00 PM</div>
              </div>
            </div>

            {/* Company name */}
            <div className="text-sm text-gray-400 mb-3">{company.symbol}</div>

            {/* Earnings summary */}
            {company.status === 'reported' && company.recent_news && company.recent_news.length > 0 ? (
              <div className="text-sm text-gray-300 leading-relaxed">
                <p className="line-clamp-3">
                  {company.recent_news[0]?.summary || company.recent_news[0]?.content || 
                   `${company.symbol} delivered record Q3 FY25 revenue with 10% YoY growth and raised full-year revenue and EPS targets. AI-first products like Firefly, Gen Studio, and Acrobat AI Assistant drove strong adoption and monetization, surpassing the $250M AI-first ARR target. AI integration boosted retention, new user growth, and enterprise automation, with margins remaining strong.`}
                </p>
              </div>
            ) : (
              <div className="text-sm text-gray-400">
                Earnings call scheduled for {formatDisplayDate(new Date()).fullDate}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Date card component
interface DateCardProps {
  date: Date;
  isSelected: boolean;
  isToday: boolean;
  onClick: () => void;
  earningsCount: number;
  companies: EarningsCompany[];
  logos: { symbol: string; logo: string }[];
}

const DateCard: React.FC<DateCardProps> = ({ date, isSelected, isToday, onClick, earningsCount, companies, logos }) => {
  const { dayName, dateNum } = formatDisplayDate(date);
  
  // Get logos for companies reporting on this date
  const getCompanyLogo = (symbol: string) => {
    return logos.find(logo => logo.symbol === symbol)?.logo;
  };

  // Show up to 4 company logos
  const displayCompanies = companies.slice(0, 4);
  const hasMoreCompanies = companies.length > 4;
  
  return (
    <Card 
      className={`cursor-pointer transition-all hover:bg-gray-800/50 ${
        isSelected ? 'bg-teal-600/20 border-teal-500' : 'bg-gray-900 border-gray-700'
      } ${isToday ? 'ring-1 ring-blue-500' : ''}`}
      onClick={onClick}
    >
      <CardContent className="px-1 py-1 text-center">
        <div className="text-sm text-gray-400 mb-1">{dayName}</div>
        <div className={`font-semibold mb-2 ${isSelected ? 'text-teal-300' : 'text-white'}`}>
          {dateNum}
        </div>
        
        {/* Company logos - overlapping */}
        {displayCompanies.length > 0 && (
          <div className="flex justify-center items-center mb-2 relative h-6">
            {displayCompanies.map((company, index) => {
              const logo = getCompanyLogo(company.symbol);
              return (
                <div 
                  key={company.symbol} 
                  className="w-6 h-6 rounded-sm overflow-hidden bg-blue-600 flex items-center justify-center flex-shrink-0 border border-gray-800 relative"
                  style={{ 
                    marginLeft: index > 0 ? '-8px' : '0',
                    zIndex: displayCompanies.length - index 
                  }}
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt={`${company.symbol} logo`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const fallback = target.parentElement?.querySelector('.fallback-icon') as HTMLElement;
                        if (fallback) {
                          fallback.style.display = 'block';
                        }
                      }}
                    />
                  ) : null}
                  <Building2 className={`fallback-icon w-3 h-3 text-white ${logo ? 'hidden' : ''}`} />
                </div>
              );
            })}
            {hasMoreCompanies && (
              <div 
                className="w-6 h-6 rounded-sm bg-gray-600 flex items-center justify-center text-xs text-white font-medium border border-gray-800"
                style={{ 
                  marginLeft: displayCompanies.length > 0 ? '-8px' : '0',
                  zIndex: 0 
                }}
              >
                +{companies.length - 4}
              </div>
            )}
          </div>
        )}
        
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

  // Fetch earnings data for all dates in the week using individual hooks
  const date0 = weekDates[0] ? formatDate(weekDates[0]) : '';
  const date1 = weekDates[1] ? formatDate(weekDates[1]) : '';
  const date2 = weekDates[2] ? formatDate(weekDates[2]) : '';
  const date3 = weekDates[3] ? formatDate(weekDates[3]) : '';
  const date4 = weekDates[4] ? formatDate(weekDates[4]) : '';
  const date5 = weekDates[5] ? formatDate(weekDates[5]) : '';
  const date6 = weekDates[6] ? formatDate(weekDates[6]) : '';

  const { earningsSummary: earnings0 } = useDailyEarningsSummary(date0);
  const { earningsSummary: earnings1 } = useDailyEarningsSummary(date1);
  const { earningsSummary: earnings2 } = useDailyEarningsSummary(date2);
  const { earningsSummary: earnings3 } = useDailyEarningsSummary(date3);
  const { earningsSummary: earnings4 } = useDailyEarningsSummary(date4);
  const { earningsSummary: earnings5 } = useDailyEarningsSummary(date5);
  const { earningsSummary: earnings6 } = useDailyEarningsSummary(date6);

  // Combine all week earnings data
  const weekEarningsData = useMemo(() => {
    const data: Record<string, any> = {};
    const earningsArray = [earnings0, earnings1, earnings2, earnings3, earnings4, earnings5, earnings6];
    
    weekDates.forEach((date, index) => {
      const dateStr = formatDate(date);
      data[dateStr] = earningsArray[index];
    });
    
    return data;
  }, [weekDates, earnings0, earnings1, earnings2, earnings3, earnings4, earnings5, earnings6]);

  // Get companies from earnings summary for selected date
  const companies = useMemo(() => {
    if (!earningsSummary) return [];
    
    const scheduled = earningsSummary.companies_scheduled || [];
    const reported = earningsSummary.companies_reported || [];
    
    return [...scheduled, ...reported].slice(0, 10); // Limit to 10 companies
  }, [earningsSummary]);

  // Get companies for a specific date using real database data
  const getCompaniesForDate = (date: Date): EarningsCompany[] => {
    const dateStr = formatDate(date);
    const earningsData = weekEarningsData[dateStr];
    
    if (!earningsData) return [];
    
    const scheduled = earningsData.companies_scheduled || [];
    const reported = earningsData.companies_reported || [];
    
    // Combine and limit to 4 companies for calendar grid display
    return [...scheduled, ...reported].slice(0, 4);
  };

  // Get all unique symbols for logo fetching
  const allSymbols = useMemo(() => {
    const symbolSet = new Set<string>();
    
    // Add symbols from selected date
    companies.forEach(company => symbolSet.add(company.symbol));
    
    // Add symbols from all week dates
    weekDates.forEach(date => {
      getCompaniesForDate(date).forEach(company => symbolSet.add(company.symbol));
    });
    
    return Array.from(symbolSet);
  }, [companies, weekDates, selectedDate]);

  // Fetch company logos for all companies
  const { logos } = useEarningsCalendarLogos({ 
    symbols: allSymbols.length > 0 ? allSymbols : [] 
  });

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
    const companiesForDate = getCompaniesForDate(date);
    return companiesForDate.length;
  };

  // Helper function to get company logo
  const getCompanyLogo = (symbol: string) => {
    return logos.find(logo => logo.symbol === symbol)?.logo;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold flex items-center gap-2">
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
            className="border-gray-700 hover:bg-gray-800"
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
            companies={getCompaniesForDate(date)}
            logos={logos}
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
          <div className="space-y-4">
            {companies.map((company, index) => (
              <CompanyCard 
                key={`${company.symbol}-${index}`} 
                company={company} 
                logo={getCompanyLogo(company.symbol)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EarningsCalendar;