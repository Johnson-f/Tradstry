"use client";

import React, { useState } from 'react';
import { MarketSummary } from './General-tab/market-summary';
import { IndicesTab } from './General-tab/indicies-tab';
import { Standouts } from './General-tab/standouts';
import { ActiveCard } from './active-card';
import { EarningsCalendar } from './Earnings-tab/earnings';


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
    inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer select-none
    bg-red-500 text-white border border-red-500
    shadow-sm hover:shadow-md
    transition-all duration-200 ease-out
  `.replace(/\s+/g, ' ').trim();

  // Inactive button classes (receded, subtle)
  const inactiveClasses = `
    inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer select-none
    bg-transparent text-gray-400 border-0
    hover:text-gray-300 hover:bg-gray-800/50
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


// Main component
export const TabManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState('us-markets');

  return (
    <div className="space-y-6">
      {/* Tab Navigation - Horizontal Layout */}
      <div className="flex items-center gap-1">
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

        {/* Right Column - Active Card (Always visible) */}
        <div className="w-full xl:w-80 xl:flex-shrink-0">
          <div className="xl:sticky xl:top-4">
            <ActiveCard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TabManager;