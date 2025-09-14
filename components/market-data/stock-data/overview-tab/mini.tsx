"use client";

import React from 'react';
import { useCompanyInfo } from '@/lib/hooks/use-market-data';
import { Card, CardContent } from '@/components/ui/card';

interface StockMiniProps {
  symbol: string;
  className?: string;
}

interface MetricItemProps {
  label: string;
  value: string | number | null | undefined;
  isRange?: boolean;
}

const MetricItem = ({ label, value, isRange = false }: MetricItemProps) => {
  const formatValue = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '—';
    
    if (typeof val === 'number') {
      if (label === 'Market Cap') {
        // Format market cap in billions/millions
        if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
        if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
        if (val >= 1e3) return `$${(val / 1e3).toFixed(2)}K`;
        return `$${val.toFixed(2)}`;
      }
      
      if (label === 'Volume') {
        // Format volume in millions/thousands
        if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
        if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
        return val.toLocaleString();
      }
      
      if (label.includes('Yield') || label.includes('%')) {
        return `${val.toFixed(2)}%`;
      }
      
      if (label.includes('Price') || label.includes('Range') || label === 'Open' || label === 'EPS') {
        return `$${val.toFixed(2)}`;
      }
      
      return val.toFixed(2);
    }
    
    return String(val);
  };

  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium">
        {formatValue(value)}
      </span>
    </div>
  );
};

export function StockMini({ symbol, className = '' }: StockMiniProps) {
  const { companyInfo, isLoading, error } = useCompanyInfo(symbol);

  if (error) {
    return (
      <Card className={`bg-gray-900 border-gray-800 ${className}`}>
        <CardContent className="p-4">
          <div className="text-center text-red-400 text-sm">
            Error loading company data
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className={`bg-gray-900 border-gray-800 ${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!companyInfo) {
    return (
      <Card className={`bg-gray-900 border-gray-800 ${className}`}>
        <CardContent className="p-4">
          <div className="text-center text-gray-400 text-sm">
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate day range
  const dayRange = companyInfo.low && companyInfo.high 
    ? `$${Number(companyInfo.low).toFixed(2)} - $${Number(companyInfo.high).toFixed(2)}`
    : '—';

  // Calculate 52W range
  const yearRange = companyInfo.year_low && companyInfo.year_high
    ? `$${Number(companyInfo.year_low).toFixed(2)} - $${Number(companyInfo.year_high).toFixed(2)}`
    : '—';

  return (
    <Card className={`bg-gray-900 border-gray-800 ${className}`}>
      <CardContent className="p-4">
        <div className="grid grid-cols-3 gap-x-8 gap-y-3">
          {/* Row 1 */}
          <MetricItem 
            label="Prev Close" 
            value={companyInfo.price ? Number(companyInfo.price) - Number(companyInfo.change || 0) : null} 
          />
          <MetricItem 
            label="52W Range" 
            value={yearRange}
            isRange={true}
          />
          <MetricItem 
            label="Market Cap" 
            value={companyInfo.market_cap ? Number(companyInfo.market_cap) : null} 
          />
          
          {/* Row 2 */}
          <MetricItem 
            label="Open" 
            value={companyInfo.open ? Number(companyInfo.open) : null} 
          />
          <MetricItem 
            label="P/E Ratio" 
            value={companyInfo.pe_ratio ? Number(companyInfo.pe_ratio) : null} 
          />
          <MetricItem 
            label="Dividend Yield" 
            value={companyInfo.yield ? Number(companyInfo.yield) : null} 
          />
          
          {/* Row 3 */}
          <MetricItem 
            label="Day Range" 
            value={dayRange}
            isRange={true}
          />
          <MetricItem 
            label="Volume" 
            value={companyInfo.volume ? Number(companyInfo.volume) : null} 
          />
          <MetricItem 
            label="EPS" 
            value={companyInfo.eps ? Number(companyInfo.eps) : null} 
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default StockMini;