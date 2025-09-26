"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useKeyStats } from '@/lib/hooks/use-market-data';
import { TrendingUp, TrendingDown, DollarSign, Building2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KeyStatsProps {
  symbol: string;
  className?: string;
}

// Format currency values
const formatCurrency = (value: any): string => {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return 'N/A';

  if (Math.abs(num) >= 1e12) {
    return `$${(num / 1e12).toFixed(2)}T`;
  } else if (Math.abs(num) >= 1e9) {
    return `$${(num / 1e9).toFixed(2)}B`;
  } else if (Math.abs(num) >= 1e6) {
    return `$${(num / 1e6).toFixed(2)}M`;
  } else if (Math.abs(num) >= 1e3) {
    return `$${(num / 1e3).toFixed(2)}K`;
  }
  return `$${num.toFixed(2)}`;
};

// Format numbers with appropriate suffixes
const formatNumber = (value: any): string => {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return 'N/A';

  if (Math.abs(num) >= 1e9) {
    return `${(num / 1e9).toFixed(2)}B`;
  } else if (Math.abs(num) >= 1e6) {
    return `${(num / 1e6).toFixed(2)}M`;
  } else if (Math.abs(num) >= 1e3) {
    return `${(num / 1e3).toFixed(2)}K`;
  }
  return num.toFixed(2);
};

// Format percentage values
const formatPercentage = (value: any): string => {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return 'N/A';
  return `${num.toFixed(2)}%`;
};

// Stat card component for individual metrics
interface StatCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  subtitle?: string;
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  icon, 
  trend = 'neutral', 
  subtitle,
  className 
}) => {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : null;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-500';

  return (
    <Card className={cn("p-4 hover:shadow-md transition-shadow", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
            {icon}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            {subtitle && (
              <p className="text-xs text-gray-500 dark:text-gray-500">{subtitle}</p>
            )}
          </div>
        </div>
        {TrendIcon && (
          <div className={cn("p-1 rounded", trendColor)}>
            <TrendIcon className="h-5 w-5" />
          </div>
        )}
      </div>
    </Card>
  );
};

export function KeyStats({ symbol, className = '' }: KeyStatsProps) {
  const [frequency, setFrequency] = useState<'annual' | 'quarterly'>('annual');
  
  const { keyStats, isLoading, error, refetch } = useKeyStats({
    symbol,
    frequency,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-6", className)}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-48" />
              <div className="flex space-x-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-8 w-16" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("space-y-6", className)}>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load key statistics for {symbol}: {error.message}
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-2"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // No data state
  if (!keyStats) {
    return (
      <div className={cn("space-y-6", className)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Building2 className="h-5 w-5" />
              <span>Key Statistics - {symbol}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No key statistics data available for {symbol}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Building2 className="h-5 w-5" />
              <span>Key Statistics - {symbol}</span>
            </CardTitle>
            <div className="flex space-x-2">
              <Button
                variant={frequency === 'annual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFrequency('annual')}
              >
                Annual
              </Button>
              <Button
                variant={frequency === 'quarterly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFrequency('quarterly')}
              >
                Quarterly
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Market Capitalization */}
            <StatCard
              title="Market Cap"
              value={formatCurrency(keyStats.market_cap)}
              icon={<Building2 className="h-5 w-5 text-blue-600" />}
              subtitle="Total market value"
            />

            {/* Revenue */}
            <StatCard
              title="Revenue"
              value={formatCurrency(keyStats.revenue)}
              icon={<DollarSign className="h-5 w-5 text-green-600" />}
              subtitle="Total revenue"
              trend={keyStats.revenue && keyStats.revenue > 0 ? 'up' : 'down'}
            />

            {/* Net Income */}
            <StatCard
              title="Net Income"
              value={formatCurrency(keyStats.net_income_common_stockholders)}
              icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
              subtitle="Net income (common)"
              trend={keyStats.net_income_common_stockholders && keyStats.net_income_common_stockholders > 0 ? 'up' : 'down'}
            />

            {/* EBITDA */}
            <StatCard
              title="EBITDA"
              value={formatCurrency(keyStats.ebitda)}
              icon={<TrendingUp className="h-5 w-5 text-purple-600" />}
              subtitle="Earnings before interest, taxes, depreciation, and amortization"
            />

            {/* Enterprise Value */}
            <StatCard
              title="Enterprise Value"
              value={formatCurrency(keyStats.enterprise_value)}
              icon={<Building2 className="h-5 w-5 text-orange-600" />}
              subtitle="Market cap + debt - cash"
            />

            {/* Diluted EPS */}
            <StatCard
              title="Diluted EPS"
              value={formatCurrency(keyStats.diluted_eps)}
              icon={<DollarSign className="h-5 w-5 text-indigo-600" />}
              subtitle="Earnings per share (diluted)"
              trend={keyStats.diluted_eps && keyStats.diluted_eps > 0 ? 'up' : 'down'}
            />

            {/* Gross Profit */}
            <StatCard
              title="Gross Profit"
              value={formatCurrency(keyStats.gross_profit)}
              icon={<TrendingUp className="h-5 w-5 text-teal-600" />}
              subtitle="Revenue minus cost of goods sold"
            />

            {/* Operating Cash Flow */}
            <StatCard
              title="Operating Cash Flow"
              value={formatCurrency(keyStats.operating_cash_flow)}
              icon={<DollarSign className="h-5 w-5 text-cyan-600" />}
              subtitle="Cash generated from operations"
              trend={keyStats.operating_cash_flow && keyStats.operating_cash_flow > 0 ? 'up' : 'down'}
            />

            {/* Free Cash Flow */}
            <StatCard
              title="Free Cash Flow"
              value={formatCurrency(keyStats.free_cash_flow)}
              icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
              subtitle="Operating cash flow minus capital expenditures"
              trend={keyStats.free_cash_flow && keyStats.free_cash_flow > 0 ? 'up' : 'down'}
            />

            {/* Total Debt */}
            <StatCard
              title="Total Debt"
              value={formatCurrency(keyStats.total_debt)}
              icon={<TrendingDown className="h-5 w-5 text-red-600" />}
              subtitle="Total outstanding debt"
            />

            {/* Cash and Cash Equivalents */}
            <StatCard
              title="Cash & Equivalents"
              value={formatCurrency(keyStats.cash_and_cash_equivalents)}
              icon={<DollarSign className="h-5 w-5 text-green-500" />}
              subtitle="Available liquid assets"
            />

            {/* Capital Expenditure */}
            <StatCard
              title="Capital Expenditure"
              value={formatCurrency(keyStats.capital_expenditure)}
              icon={<Building2 className="h-5 w-5 text-gray-600" />}
              subtitle="Investment in fixed assets"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default KeyStats;