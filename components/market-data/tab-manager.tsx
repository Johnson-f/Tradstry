"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MarketSummary } from './General-tab/market-summary';
import { IndicesTab } from './General-tab/indicies-tab';
import { Standouts } from './General-tab/standouts';
import { ActiveCard } from './active-card';
import { WatchlistCard } from './watchlist-card';
import { EarningsCalendar } from './Earnings-tab/earnings';
import { cn } from '@/lib/utils';

// Tab button component using shadcn/ui Button
interface TabButtonProps {
  children: React.ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
}

const TabButton: React.FC<TabButtonProps> = ({ 
  children, 
  isActive = false, 
  onClick,
  icon 
}) => {
  return (
    <Button
      variant={isActive ? "default" : "ghost"}
      onClick={onClick}
      className={cn(
        "gap-2 transition-all duration-200",
        isActive 
          ? "bg-blue-600 hover:bg-blue-700 dark:bg-red-500 dark:hover:bg-red-600 text-white border-blue-600 dark:border-red-500 shadow-sm hover:shadow-md" 
          : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50"
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </Button>
  );
};

// US Flag icon component - remove dead code 
/*
const USFlag: React.FC = () => (
  <div className="w-4 h-3 rounded-sm overflow-hidden border border-slate-300/50 shadow-sm">
    <div className="w-full h-full relative bg-white">

      <div className="absolute inset-0">
        <div className="h-full w-full bg-gradient-to-b from-red-500 to-red-600"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
      </div>
      <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-gradient-to-br from-blue-600 to-blue-700 rounded-sm"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
    </div>
  </div>
);
*/




// Main component
export const TabManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState('us-markets');

  return (
    <div className="space-y-6">
      {/* Tab Navigation - Horizontal Layout */}
      <div className="flex items-center gap-1">
        <TabButton
          isActive={activeTab === 'us-markets'}
          onClick={() => setActiveTab('us-markets')}
          icon={
            <div className="flex items-center gap-1">
             
            </div>
          }
        >
          US Markets
        </TabButton>
        
        <TabButton
          isActive={activeTab === 'crypto'}
          onClick={() => setActiveTab('crypto')}
        >
          Crypto
        </TabButton>
        
        <TabButton
          isActive={activeTab === 'earnings'}
          onClick={() => setActiveTab('earnings')}
        >
          Earnings
        </TabButton>
        
        <TabButton
          isActive={activeTab === 'screener'}
          onClick={() => setActiveTab('screener')}
        >
          Screener
        </TabButton>
      </div>

      {/* Content based on active tab */}
      <div className="flex flex-col xl:flex-row gap-6 xl:gap-6">
        {/* Left Column - Main Content */}
        <div className="flex-1 min-w-0 space-y-6 max-w-10xl">
          {activeTab === 'us-markets' ? (
            <>
              {/* Market Indices */}
              <div className="w-full max-w-4xl">
                <IndicesTab />
              </div>

              {/* Market Summary */}
              <div className="w-full max-w-4xl">
                <MarketSummary />
              </div>
              
              {/* Market Standouts */}
              <div className="w-full max-w-4xl">
                <Standouts />
              </div>
            </>
          ) : activeTab === 'earnings' ? (
            /* Earnings tab content */
            <div className="w-full max-w-4xl">
              <EarningsCalendar />
            </div>
          ) : (
            /* Other tab content */
            <div className="p-6 bg-gray-800/50 rounded-xl border border-gray-700/50">
              <div className="text-center py-8">
                <h2 className="text-xl font-semibold text-white mb-2">
                  {activeTab === 'crypto' && 'Cryptocurrency'}
                  {activeTab === 'screener' && 'Stock Screener'}
                </h2>
                <p className="text-gray-400">
                  {activeTab === 'crypto' && 'Track cryptocurrency prices and market movements.'}
                  {activeTab === 'screener' && 'Find stocks based on your custom criteria.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Active Card & Watchlist (Always visible) */}
        <div className="w-full xl:w-80 xl:flex-shrink-0 space-y-6">
          <div className="xl:sticky xl:top-4 space-y-6">
          <WatchlistCard />
            <ActiveCard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TabManager;