"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText, MoreVertical, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { useWeeklyPnLTrades, useRecentTickerSummary } from "@/hooks/use-analytics";
import { useCombinedPortfolioAnalytics } from "@/lib/hooks/use-analytics";

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function OverviewTab() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    // Get start of current week (Monday)
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Handle Sunday as 0
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  // Use React Query hooks for data fetching with caching
  const {
    data: dailyData = [],
    isLoading: loading,
    error: dailyError,
  } = useWeeklyPnLTrades(currentWeekStart);

  const {
    data: tickerData = [],
    isLoading: tickerLoading,
    error: tickerQueryError,
  } = useRecentTickerSummary(6);
  
  // Get weekly combined portfolio analytics for performance metrics
  const {
    combinedData: weeklyAnalytics,
    isLoading: weeklyAnalyticsLoading,
    error: weeklyAnalyticsError,
  } = useCombinedPortfolioAnalytics({
    periodType: 'custom',
    customStartDate: currentWeekStart,
    customEndDate: (() => {
      const endDate = new Date(currentWeekStart);
      endDate.setDate(currentWeekStart.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      return endDate;
    })()
  });

  // Convert error objects to string messages
  const error = dailyError ? String(dailyError) : null;
  const tickerError = tickerQueryError ? String(tickerQueryError) : null;


  // Generate the 7 days of current week
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(currentWeekStart);
    day.setDate(currentWeekStart.getDate() + i);
    weekDays.push(day);
  }

  // Helper function to get data for a specific date
  const getDataForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    return dailyData.find(item => item.trade_date === dateStr);
  };

  // Helper function to format currency
  const formatCurrency = (value: number) => {
    if (value === 0) return '$0';
    
    const isPositive = value >= 0;
    const absValue = Math.abs(value);
    
    if (absValue >= 1000) {
      const kValue = (absValue / 1000).toFixed(1);
      return `${isPositive ? '+' : '-'}$${kValue}k`;
    } else {
      const formatted = absValue.toFixed(0);
      return `${isPositive ? '+' : '-'}$${formatted}`;
    }
  };

  // Calculate heat map intensity based on P&L
  const getHeatMapIntensity = (pnl: number, maxPnl: number) => {
    if (pnl === 0) return 0;
    const absValue = Math.abs(pnl);
    const maxAbsValue = Math.abs(maxPnl);
    return maxAbsValue > 0 ? Math.min(absValue / maxAbsValue, 1) : 0;
  };

  // Calculate weekly statistics from daily data
  const weeklyStats = {
    totalPnl: dailyData.reduce((sum, day) => sum + (day.total_pnl || 0), 0),
    totalTrades: dailyData.reduce((sum, day) => sum + (day.total_trades || 0), 0),
    winningDays: dailyData.filter(day => (day.total_pnl || 0) > 0).length,
    losingDays: dailyData.filter(day => (day.total_pnl || 0) < 0).length,
    maxPnl: Math.max(...dailyData.map(day => Math.abs(day.total_pnl || 0)), 1)
  };

  // Use real analytics data when available, fallback to daily data calculations
  const totalTradingDays = weeklyStats.winningDays + weeklyStats.losingDays;
  const calculatedWinRate = totalTradingDays > 0 ? (weeklyStats.winningDays / totalTradingDays) * 100 : 0;
  
  const realWeeklyStats = {
    totalPnl: weeklyAnalytics?.netPnl ?? weeklyStats.totalPnl,
    winRate: weeklyAnalytics?.winRate ?? calculatedWinRate,
    totalTrades: weeklyStats.totalTrades,
    winningDays: weeklyStats.winningDays,
    losingDays: weeklyStats.losingDays,
    maxPnl: weeklyStats.maxPnl,
    profitFactor: weeklyAnalytics?.profitFactor ?? null,
    biggestWinner: weeklyAnalytics?.biggestWinner ?? null,
    biggestLoser: weeklyAnalytics?.biggestLoser ?? null,
    avgHoldTimeWinners: weeklyAnalytics?.avgHoldTimeWinners ?? null,
    tradeExpectancy: weeklyAnalytics?.tradeExpectancy ?? null
  };

  // Goals and risk utilization - could come from user settings in the future
  const monthlyGoal = 10000; // $10k monthly goal
  const monthlyProgress = Math.max(0, Math.min(100, (realWeeklyStats.totalPnl / monthlyGoal) * 100));
  const riskUtilization = Math.min(100, (realWeeklyStats.totalTrades / 50) * 100); // Assuming 50 trades is max risk

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeekStart = new Date(currentWeekStart);
    if (direction === 'prev') {
      newWeekStart.setDate(newWeekStart.getDate() - 7);
    } else {
      newWeekStart.setDate(newWeekStart.getDate() + 7);
    }
    setCurrentWeekStart(newWeekStart);
  };

  const goToToday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };

  // Get week range for display
  const getWeekRange = () => {
    const endOfWeek = new Date(currentWeekStart);
    endOfWeek.setDate(currentWeekStart.getDate() + 6);
    
    const startMonth = MONTHS[currentWeekStart.getMonth()];
    const endMonth = MONTHS[endOfWeek.getMonth()];
    const startYear = currentWeekStart.getFullYear();
    const endYear = endOfWeek.getFullYear();
    
    if (startMonth === endMonth && startYear === endYear) {
      return `${startMonth} ${currentWeekStart.getDate()}-${endOfWeek.getDate()}, ${startYear}`;
    } else if (startYear === endYear) {
      return `${startMonth} ${currentWeekStart.getDate()} - ${endMonth} ${endOfWeek.getDate()}, ${startYear}`;
    } else {
      return `${startMonth} ${currentWeekStart.getDate()}, ${startYear} - ${endMonth} ${endOfWeek.getDate()}, ${endYear}`;
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {/* Weekly P&L Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Stats Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Trades Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-4 w-4" />
                  </div>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                  <Skeleton className="h-12 w-full mt-4" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-red-500">Error: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">
              Weekly P&L Overview
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateWeek('prev')}
                className="p-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
                className="px-4 py-2"
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigateWeek('next')}
                className="p-2"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {getWeekRange()}
          </p>
        </CardHeader>
        
        <CardContent>
          {/* Week Grid - Single Row of 7 Days */}
          <div className="grid grid-cols-7 gap-4">
            {weekDays.map((date, index) => {
              const dayData = getDataForDate(date);
              const weekdayName = WEEKDAYS[index]; // Direct index since Monday = 0
              const dayOfMonth = date.getDate();
              
              const pnl = dayData?.total_pnl || 0;
              const trades = dayData?.total_trades || 0;
              
              // Determine card styling based on P&L
              const isProfitable = pnl > 0;
              const hasLoss = pnl < 0;
              const noTrades = trades === 0;
              
              // Calculate heat map intensity
              const intensity = getHeatMapIntensity(pnl, realWeeklyStats.maxPnl);
              
              // Check if this is today
              const today = new Date();
              const isToday = date.toDateString() === today.toDateString();

              // Generate mock sparkline data (in real app, this would come from actual trade data)
              const sparklineData = Array.from({ length: 8 }, (_, i) => ({
                value: pnl === 0 ? 0 : pnl + (Math.random() - 0.5) * (pnl * 0.3)
              }));
              
              return (
                <div
                  key={date.toISOString()}
                  className={`
                    relative p-4 rounded-lg border min-h-[140px] transition-all duration-200
                    ${isToday ? 'ring-2 ring-blue-200 border-blue-300' : 'border-gray-300'}
                    hover:shadow-md hover:scale-105 cursor-pointer
                  `}
                  style={{
                    background: noTrades 
                      ? '#f9fafb' 
                      : isProfitable 
                      ? `rgba(34, 197, 94, ${0.1 + intensity * 0.2})` 
                      : hasLoss 
                      ? `rgba(239, 68, 68, ${0.1 + intensity * 0.2})` 
                      : '#ffffff'
                  }}
                >
                  {/* Date Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span className={`text-lg font-semibold ${
                        isToday ? 'text-blue-600' : 'text-gray-900'
                      }`}>
                        {String(dayOfMonth).padStart(2, '0')}
                      </span>
                      <span className="text-sm text-gray-500">
                        {weekdayName}
                      </span>
                    </div>
                    {trades > 0 && (
                      <div className="flex items-center space-x-1">
                        <FileText className="h-3 w-3 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Mini Sparkline Chart */}
                  {trades > 0 && (
                    <div className="h-8 mb-2 opacity-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparklineData}>
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            stroke={isProfitable ? '#22c55e' : hasLoss ? '#ef4444' : '#6b7280'} 
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* P&L and Trades */}
                  <div className="space-y-1">
                    <div className={`text-lg font-semibold ${
                      isProfitable 
                        ? 'text-green-600' 
                        : hasLoss 
                        ? 'text-red-600' 
                        : 'text-gray-500'
                    }`}>
                      {formatCurrency(pnl)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {trades} trade{trades !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Weekly Performance Stats */}
      <Card className="mt-6">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            Weekly Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Show loading state only if we don't have basic daily data */}
          {weeklyAnalyticsLoading && dailyData.length === 0 && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-700">Loading weekly metrics...</div>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Win Rate Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Win Rate</span>
                <span className="text-sm font-semibold text-gray-900">
                  {realWeeklyStats.winRate ? realWeeklyStats.winRate.toFixed(1) : '0.0'}%
                </span>
              </div>
              <Progress value={realWeeklyStats.winRate || 0} className="h-3" />
              <div className="text-xs text-gray-500">
                {realWeeklyStats.winningDays} winning days out of {realWeeklyStats.winningDays + realWeeklyStats.losingDays || realWeeklyStats.winningDays}
              </div>
            </div>

            {/* Monthly Goal Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <Target className="h-4 w-4" />
                  Monthly Goal
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(realWeeklyStats.totalPnl)} / {formatCurrency(monthlyGoal)}
                </span>
              </div>
              <Progress value={monthlyProgress} className="h-3" />
              <div className="text-xs text-gray-500">
                {monthlyProgress.toFixed(1)}% of monthly target achieved
              </div>
            </div>

            {/* Risk Utilization */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Risk Utilization</span>
                <span className="text-sm font-semibold text-gray-900">{riskUtilization.toFixed(1)}%</span>
              </div>
              <Progress 
                value={riskUtilization} 
                className="h-3"
              />
              <div className="text-xs text-gray-500">
                {realWeeklyStats.totalTrades} trades this week
              </div>
            </div>
          </div>

          {/* Advanced Analytics Section - Only show when real analytics data is available */}
          {weeklyAnalytics && !weeklyAnalyticsLoading && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-4">Advanced Weekly Metrics</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                {realWeeklyStats.profitFactor !== null && (
                  <div className="space-y-1">
                    <div className={`text-lg font-semibold ${
                      realWeeklyStats.profitFactor >= 1.2 ? 'text-green-600' : realWeeklyStats.profitFactor >= 1.0 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {realWeeklyStats.profitFactor.toFixed(2)}
                    </div>
                    <div className="text-xs text-gray-500">Profit Factor</div>
                  </div>
                )}
                {realWeeklyStats.tradeExpectancy !== null && (
                  <div className="space-y-1">
                    <div className={`text-lg font-semibold ${
                      realWeeklyStats.tradeExpectancy >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(realWeeklyStats.tradeExpectancy)}
                    </div>
                    <div className="text-xs text-gray-500">Expectancy</div>
                  </div>
                )}
                {realWeeklyStats.biggestWinner !== null && (
                  <div className="space-y-1">
                    <div className="text-lg font-semibold text-green-600">
                      {formatCurrency(realWeeklyStats.biggestWinner)}
                    </div>
                    <div className="text-xs text-gray-500">Best Trade</div>
                  </div>
                )}
                {realWeeklyStats.avgHoldTimeWinners !== null && (
                  <div className="space-y-1">
                    <div className="text-lg font-semibold text-blue-600">
                      {realWeeklyStats.avgHoldTimeWinners.toFixed(1)}d
                    </div>
                    <div className="text-xs text-gray-500">Avg Hold Time</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Weekly Summary Stats */}
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="space-y-1">
                <div className={`text-lg font-semibold ${
                  realWeeklyStats.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatCurrency(realWeeklyStats.totalPnl)}
                </div>
                <div className="text-xs text-gray-500">Total P&L</div>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-gray-900">{realWeeklyStats.totalTrades}</div>
                <div className="text-xs text-gray-500">Total Trades</div>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-green-600">{realWeeklyStats.winningDays}</div>
                <div className="text-xs text-gray-500">Winning Days</div>
              </div>
              <div className="space-y-1">
                <div className="text-lg font-semibold text-red-600">{realWeeklyStats.losingDays}</div>
                <div className="text-xs text-gray-500">Losing Days</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Shared Trades Section */}
      <Card className="mt-6">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">
              Your recent shared trades
            </CardTitle>
            <Button variant="ghost" size="sm" className="p-2">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          {tickerLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-gray-500">Loading ticker data...</div>
            </div>
          ) : tickerError ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-red-500">Error: {tickerError}</div>
            </div>
          ) : tickerData.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <div className="text-gray-500">No ticker data available</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tickerData.map((ticker) => {
                const isProfitable = ticker.total_profit > 0;
                const hasLoss = ticker.total_profit < 0;
                const avgProfitPerTrade = ticker.total_trades > 0 ? ticker.total_profit / ticker.total_trades : 0;
                
                return (
                  <div
                    key={ticker.symbol}
                    className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow"
                  >
                    {/* Ticker Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-bold text-gray-700">
                            {ticker.symbol.charAt(0)}
                          </span>
                        </div>
                        <span className="font-semibold text-gray-900">
                          {ticker.symbol}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" className="p-1">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Performance Metrics */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Total P&L</span>
                        <span className={`font-semibold ${
                          isProfitable 
                            ? 'text-green-600' 
                            : hasLoss 
                            ? 'text-red-600' 
                            : 'text-gray-500'
                        }`}>
                          {formatCurrency(ticker.total_profit)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Stock Trades</span>
                        <span className="text-sm font-medium text-gray-900">
                          {ticker.stock_trades}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Option Trades</span>
                        <span className="text-sm font-medium text-gray-900">
                          {ticker.option_trades}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Avg/Trade</span>
                        <span className={`text-sm font-medium ${
                          avgProfitPerTrade > 0
                            ? 'text-green-600'
                            : avgProfitPerTrade < 0
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}>
                          {formatCurrency(avgProfitPerTrade)}
                        </span>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Total Trades</span>
                        <span className="text-sm font-medium text-gray-900">
                          {ticker.total_trades}
                        </span>
                      </div>
                    </div>

                    {/* Mini Performance Chart */}
                    <div className="mt-4 h-12 bg-gray-50 rounded border overflow-hidden">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={Array.from({ length: 12 }, (_, i) => ({
                          value: ticker.total_profit + (Math.random() - 0.5) * (ticker.total_profit * 0.2)
                        }))}>
                          <Line 
                            type="monotone" 
                            dataKey="value" 
                            stroke={isProfitable ? '#22c55e' : hasLoss ? '#ef4444' : '#6b7280'} 
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
