"use client";

import { useState } from 'react';
import { OverviewTab } from './overview-tab/brain';
import { HistoricalDataTab } from './historical-data-tab';
import { FinancialTab } from './financial-tab/brain';
import { EarningsTab } from './earnings-tab';
import { HoldersTab } from './holder-tab';
import { ResearchTab } from './reasearch';

interface ManagerTabProps {
  symbol: string;
  className?: string;
}

type TabType = 'overview' | 'historical' | 'financials' | 'earnings' | 'holders' | 'research';

interface Tab {
  id: TabType;
  label: string;
  component: React.ComponentType<{ symbol: string }>;
}

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', component: OverviewTab },
  { id: 'historical', label: 'Historical Data', component: HistoricalDataTab },
  { id: 'financials', label: 'Financials', component: FinancialTab },
  { id: 'earnings', label: 'Earnings', component: EarningsTab },
  { id: 'holders', label: 'Holders', component: HoldersTab },
  { id: 'research', label: 'Research', component: ResearchTab },
];

export function ManagerTab({ symbol, className = '' }: ManagerTabProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || OverviewTab;

  return (
    <div className={`w-full ${className}`}>
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-6 bg-gray-800/50 p-1 rounded-lg backdrop-blur-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              relative px-6 py-3 rounded-md text-sm font-medium transition-all duration-200 ease-in-out
              ${activeTab === tab.id
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/25 transform translate-y-[-1px]'
                : 'text-gray-300 hover:text-white hover:bg-gray-700/50'
              }
            `}
            style={{
              boxShadow: activeTab === tab.id 
                ? '0 4px 14px 0 rgba(6, 182, 212, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                : 'none'
            }}
          >
            <span className="relative z-10">{tab.label}</span>
            {activeTab === tab.id && (
              <div className="absolute inset-0 bg-gradient-to-b from-cyan-500 to-cyan-700 rounded-md" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="w-full">
        <ActiveComponent symbol={symbol} />
      </div>
    </div>
  );
}

export default ManagerTab;