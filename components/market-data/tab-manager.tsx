"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMajorIndicesData } from '@/lib/hooks/use-market-data';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, Clock, RefreshCw } from 'lucide-react';

// Format percentage with proper styling
const formatPercentage = (value: number | undefined) => {
  if (value === undefined || value === null) return '0.00%';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
};

// Format price with proper decimals
const formatPrice = (value: number | undefined) => {
  if (value === undefined || value === null) return '$0.00';
  return `$${value.toFixed(2)}`;
};

// Button component with Tailwind-only depth effects
interface DepthButtonProps {
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
}

const DepthButton: React.FC<DepthButtonProps> = ({ 
  children, 
  isActive = false, 
  onClick,
  icon 
}) => {
  // Active button classes (elevated, prominent)
  const activeClasses = `
    inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium cursor-pointer select-none
    bg-white text-slate-900 border border-slate-200/80
    shadow-[0_2px_8px_-2px_rgba(0,0,0,0.12),0_1px_3px_-1px_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.8),inset_0_-1px_0_0_rgba(0,0,0,0.06)]
    hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.15),0_2px_6px_-1px_rgba(0,0,0,0.10),inset_0_1px_0_0_rgba(255,255,255,0.9),inset_0_-1px_0_0_rgba(0,0,0,0.08)]
    hover:-translate-y-0.5 hover:scale-[1.02]
    active:translate-y-0 active:scale-100
    active:shadow-[0_1px_3px_-1px_rgba(0,0,0,0.12),inset_0_2px_4px_-1px_rgba(0,0,0,0.1),inset_0_1px_0_0_rgba(255,255,255,0.7)]
    transition-all duration-200 ease-out
  `.replace(/\s+/g, ' ').trim();

  // Inactive button classes (receded, subtle)
  const inactiveClasses = `
    inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium cursor-pointer select-none
    bg-slate-50/80 text-slate-500 border border-slate-200/60
    shadow-[0_1px_3px_-1px_rgba(0,0,0,0.06),inset_0_1px_0_0_rgba(255,255,255,0.6),inset_0_-1px_0_0_rgba(0,0,0,0.04)]
    hover:bg-white hover:text-slate-700 hover:border-slate-200
    hover:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.08),0_1px_3px_-1px_rgba(0,0,0,0.06),inset_0_1px_0_0_rgba(255,255,255,0.7)]
    hover:-translate-y-0.5 hover:scale-[1.01]
    active:translate-y-0 active:scale-100
    active:shadow-[inset_0_1px_3px_-1px_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.5)]
    transition-all duration-200 ease-out
  `.replace(/\s+/g, ' ').trim();

  return (
    <button
      className={isActive ? activeClasses : inactiveClasses}
      onClick={onClick}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

// US Flag icon component
const USFlag: React.FC = () => (
  <div className="w-4 h-3 rounded-sm overflow-hidden border border-slate-300/50 shadow-sm">
    <div className="w-full h-full relative bg-white">
      {/* Red stripes */}
      <div className="absolute inset-0">
        <div className="h-full w-full bg-gradient-to-b from-red-500 to-red-600"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
      </div>
      
      {/* Blue canton */}
      <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-gradient-to-br from-blue-600 to-blue-700 rounded-sm"></div>
      
      {/* White stripes effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
    </div>
  </div>
);

// Chevron down icon
const ChevronDown: React.FC = () => (
  <svg 
    className="w-3 h-3 text-current transition-transform duration-200" 
    fill="none" 
    stroke="currentColor" 
    viewBox="0 0 24 24"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

// Index card component
interface IndexCardProps {
  symbol: string;
  cachedData: {
    symbol: string;
    data_points: Array<{
      id: number;
      symbol: string;
      open?: number;
      high?: number;
      low?: number;
      adjclose?: number;
      volume?: number;
      period_start: string;
      period_end: string;
      period_type: string;
      data_provider: string;
      cache_timestamp: string;
    }>;
    latest_timestamp?: string;
    data_points_count: number;
  } | null;
}

const IndexCard: React.FC<IndexCardProps> = ({ symbol, cachedData }) => {
  if (!cachedData || cachedData.data_points.length === 0) {
    return (
      <Card className="w-full min-w-[280px] max-w-[320px] h-[140px] flex flex-col">
        <CardHeader className="pb-1 px-4 pt-3">
          <div className="flex items-start justify-between mb-1">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">{symbol}</CardTitle>
              <div className="text-xs text-muted-foreground mt-0.5">No data available</div>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const { data_points } = cachedData;
  
  // Prepare chart data from cached data points
  const chartData = data_points.slice(-60).map(point => ({
    time: new Date(point.period_start).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false 
    }),
    price: point.adjclose || point.open || 0,
    timestamp: new Date(point.period_start).getTime()
  }));

  // Calculate current price and change (using latest data point)
  const latestPoint = data_points[data_points.length - 1];
  const previousPoint = data_points.length > 1 ? data_points[data_points.length - 2] : null;
  
  const currentPrice = latestPoint.adjclose || latestPoint.open || 0;
  const previousPrice = previousPoint ? (previousPoint.adjclose || previousPoint.open || 0) : currentPrice;
  
  const change = currentPrice - previousPrice;
  const changePercent = previousPrice !== 0 ? (change / previousPrice) * 100 : 0;

  const isPositive = changePercent >= 0;

  // Get ticker symbol for display
  const getTickerSymbol = (symbol: string) => {
    switch (symbol) {
      case 'SPY': return 'SPYUSD';
      case 'QQQ': return 'QQQUSD';
      case 'DIA': return 'DIAUSD';
      case 'VIX': return '^VIX';
      default: return `${symbol}USD`;
    }
  };

  return (
    <Card className="w-full min-w-[280px] max-w-[320px] h-[140px] flex flex-col">
      <CardHeader className="pb-1 px-4 pt-3">
        <div className="flex items-start justify-between mb-1">
          <div>
            <CardTitle className="text-sm font-medium text-muted-foreground">{symbol}</CardTitle>
            <div className="text-xs text-muted-foreground mt-0.5">
              {getTickerSymbol(symbol)}
            </div>
          </div>
          <div className="text-right">
            <Badge 
              variant={isPositive ? "default" : "destructive"}
              className="flex items-center gap-1 text-xs px-2 py-0.5 mb-1"
            >
              {isPositive ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {formatPercentage(changePercent)}
            </Badge>
            <div className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {change > 0 ? '+' : ''}{Math.abs(change).toFixed(0)}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 pt-0 px-4 pb-3">
        {/* Chart takes most of the space */}
        <div className="h-[60px] w-full mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis 
                dataKey="time" 
                axisLine={false}
                tickLine={false}
                tick={false}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={false}
                domain={['dataMin - 1', 'dataMax + 1']}
              />
              <Tooltip 
                labelFormatter={(label) => `Time: ${label}`}
                formatter={(value: number) => [formatPrice(value), 'Price']}
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '11px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke={isPositive ? "#22c55e" : "#ef4444"}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Price at bottom */}
        <div className="text-lg font-bold">
          {formatPrice(currentPrice)}
        </div>
      </CardContent>
    </Card>
  );
};

// Loading skeleton for cards
const IndexCardSkeleton: React.FC = () => (
  <Card className="w-full min-w-[280px] max-w-[320px] h-[140px] flex flex-col">
    <CardHeader className="pb-1 px-4 pt-3">
      <div className="flex items-start justify-between mb-1">
        <div>
          <Skeleton className="w-16 h-4 mb-1" />
          <Skeleton className="w-12 h-3" />
        </div>
        <div className="text-right">
          <Skeleton className="w-16 h-5 rounded-full mb-1" />
          <Skeleton className="w-8 h-3" />
        </div>
      </div>
    </CardHeader>
    <CardContent className="flex-1 pt-0 px-4 pb-3">
      <Skeleton className="w-full h-[60px] rounded mb-2" />
      <Skeleton className="w-20 h-5" />
    </CardContent>
  </Card>
);

// Main component
export const TabManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState('us-markets');
  const { majorIndicesData, isLoading, error, refetch } = useMajorIndicesData(100);

  const formatLastUpdated = (timestamp: string) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>Failed to load market indices: {error.message}</span>
            <button 
              onClick={refetch}
              className="inline-flex items-center gap-1 text-sm underline hover:no-underline"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tab Navigation with depth effects */}
        <DepthButton
          isActive={activeTab === 'us-markets'}
          onClick={() => setActiveTab('us-markets')}
          icon={
            <div className="flex items-center gap-1">
              <USFlag />
            </div>
          }
        >
          US Markets
        </DepthButton>
        
        <DepthButton
          isActive={activeTab === 'crypto'}
          onClick={() => setActiveTab('crypto')}
        >
          Crypto
        </DepthButton>
        
        <DepthButton
          isActive={activeTab === 'earnings'}
          onClick={() => setActiveTab('earnings')}
        >
          Earnings
        </DepthButton>
        
        <DepthButton
          isActive={activeTab === 'screener'}
          onClick={() => setActiveTab('screener')}
        >
          Screener
        </DepthButton>

      {/* Content based on active tab */}
      {activeTab === 'us-markets' ? (
        <div className="space-y-4">
          {/* Header with last updated info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Last updated: {majorIndicesData ? formatLastUpdated(majorIndicesData.timestamp) : 'Never'}</span>
            </div>
          </div>

          {/* Cards container */}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {isLoading && !majorIndicesData ? (
              // Show skeletons only on initial load
              ['SPY', 'QQQ', 'DIA', 'VIX'].map((symbol) => (
                <IndexCardSkeleton key={symbol} />
              ))
            ) : (
              // Show actual data
              ['SPY', 'QQQ', 'DIA', 'VIX'].map((symbol) => {
                const cachedData = majorIndicesData?.[symbol.toLowerCase() as keyof typeof majorIndicesData] || null;
                return (
                  <IndexCard 
                    key={symbol} 
                    symbol={symbol} 
                    cachedData={cachedData}
                  />
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Other tab content */
        <div className="p-6 bg-white rounded-xl border border-slate-200/50 shadow-sm">
          <div className="text-center py-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              {activeTab === 'crypto' && 'Cryptocurrency'}
              {activeTab === 'earnings' && 'Earnings Calendar'}
              {activeTab === 'screener' && 'Stock Screener'}
            </h2>
            <p className="text-slate-500">
              {activeTab === 'crypto' && 'Track cryptocurrency prices and market movements.'}
              {activeTab === 'earnings' && 'Stay updated with upcoming earnings announcements.'}
              {activeTab === 'screener' && 'Find stocks based on your custom criteria.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabManager;