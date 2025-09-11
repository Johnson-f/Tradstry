"use client";

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { MarketSummary } from './General-tab/market-summary';
import { IndicesTab } from './General-tab/indicies-tab';
import { Standouts } from './General-tab/standouts';


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


// Main component
export const TabManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState('us-markets');

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
        <div className="space-y-6">
          
          {/* Market Indices - Full Width */}
          <div className="w-full">
              <IndicesTab />
          </div>

          {/* Market Summary - Full Width */}
          <div className="w-full">
            <MarketSummary />
          </div>
          
          {/* Market Standouts - Full Width */}
          <div className="w-full">
            <Standouts />
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