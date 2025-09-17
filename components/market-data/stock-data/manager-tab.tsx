"use client";

import { useState } from 'react';
import { OverviewTab } from './overview-tab/brain';
import { HistoricalDataTab } from './historical-data-tab';
import { FinancialTab } from './financial-tab/brain';
import { EarningsTab } from './earnings-tab';
import { HoldersTab } from './holder-tab';
import { ResearchTab } from './reasearch';
import { CompanyInfoCard } from './company-info-card';
import { PeersCard } from './peers-card';
import { ActiveCard } from '../active-card';
import { FinanceTabButton } from '../../finance-tab-button';

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
      <div className="flex items-center gap-4 mb-6">
        {tabs.map((tab) => (
          <FinanceTabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </FinanceTabButton>
        ))}
      </div>

      {/* Main Content Layout */}
      <div className="flex gap-6">
        {/* Tab Content - Left Side */}
        <div className="flex-1 min-w-0">
          <ActiveComponent symbol={symbol} />
        </div>

        {/* Right Sidebar */}
        <div className="w-80 flex-shrink-0 -mt-40 space-y-6">
          <CompanyInfoCard symbol={symbol} />
          
          <ActiveCard />
          
          <PeersCard 
            symbol={symbol} 
            limit={6}
            className="h-fit"
          />
        </div>
      </div>
    </div>
  );
}

export default ManagerTab;