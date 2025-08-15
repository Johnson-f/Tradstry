'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AnalyticsFilters } from './analytics-filters';
import { OverviewTab } from './tabs/overview-tab';
import { DetailedTab } from './tabs/detailed-tab';
import { CompareTab } from './tabs/compare-tab';
import { AdvancedTab } from './tabs/advanced-tab';
import { SetupTab } from './tabs/setup-tab';
import { AnalyticsFilters as AnalyticsFiltersType } from '@/lib/types/analytics';

export function AnalyticsTabs() {
  const [activeTab, setActiveTab] = useState('overview');
  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFiltersType>({
    periodType: '30d',
    customStartDate: null,
    customEndDate: null
  });

  const handleFiltersChange = (newFilters: AnalyticsFiltersType) => {
    console.log('[AnalyticsTabs] Filters changed:', newFilters);
    setAnalyticsFilters(newFilters);
  };

  return (
    <div className="w-full space-y-6">
      <AnalyticsFilters 
        onFiltersChange={handleFiltersChange}
        initialFilters={analyticsFilters}
      />
      <Tabs 
        defaultValue="overview" 
        className="w-full"
        onValueChange={setActiveTab}
        value={activeTab}
      >
      <TabsList className="grid w-full grid-cols-5 h-12">
        <TabsTrigger value="overview" className="h-10">Overview</TabsTrigger>
        <TabsTrigger value="detailed" className="h-10">Detailed</TabsTrigger>
        <TabsTrigger value="compare" className="h-10">Compare</TabsTrigger>
        <TabsTrigger value="advanced" className="h-10">Advanced</TabsTrigger>
        <TabsTrigger value="setup" className="h-10">Setup</TabsTrigger>
      </TabsList>
      
      <div className="mt-6">
        <TabsContent value="overview">
          <OverviewTab filters={analyticsFilters} />
        </TabsContent>
        <TabsContent value="detailed">
          <DetailedTab filters={analyticsFilters} />
        </TabsContent>
        <TabsContent value="compare">
          <CompareTab filters={analyticsFilters} />
        </TabsContent>
        <TabsContent value="advanced">
          <AdvancedTab filters={analyticsFilters} />
        </TabsContent>
        <TabsContent value="setup">
          <SetupTab />
        </TabsContent>
      </div>
      </Tabs>
    </div>
  );
}
