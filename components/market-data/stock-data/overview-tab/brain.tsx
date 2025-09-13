"use client";

import React from 'react';
import { PriceCard } from './price-card';
import { PriceChart } from './charts';
import { StockMini } from './mini';
import { RecentDevelopments } from './recent-development';
import { LatestPriceMovement } from './latest-price';

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

      {/* Grid layout for Mini, Recent Developments, and Latest Price Movement */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mini - Third */}
        <div className="lg:col-span-1">
          <StockMini symbol={symbol} />
        </div>

        {/* Recent Developments - Fourth */}
        <div className="lg:col-span-2">
          <RecentDevelopments symbol={symbol} />
        </div>
      </div>

      {/* Latest Price Movement - Fifth */}
      <div className="w-full">
        <LatestPriceMovement symbol={symbol} />
      </div>
    </div>
  );
}

export default OverviewTab;