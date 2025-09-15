"use client";

import React from 'react';
import { PriceCard } from './price-card';
import { PriceChart } from './charts';
import { StockMini } from './mini';
import { RecentDevelopments } from './recent-development';
import { StockMetrics } from './latest-price';

interface OverviewTabProps {
  symbol: string;
  className?: string;
}

export function OverviewTab({ symbol, className = '' }: OverviewTabProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Price Card - First */}
      <div className="w-full">
        <PriceCard symbol={symbol} />
      </div>

      {/* Charts - Second */}
      <div className="w-full">
        <PriceChart symbol={symbol} />
      </div>

      {/* Mini - Third */}
      <div className="w-full">
        <StockMini symbol={symbol} />
      </div>

      {/* Recent Developments - Fifth */}
      <div className="w-full">
        <RecentDevelopments symbol={symbol} />
      </div>

      {/* Stock Metrics - Sixth */}
      <div className="w-full">
        <StockMetrics symbol={symbol} />
      </div>
    </div>
  );
}

export default OverviewTab;