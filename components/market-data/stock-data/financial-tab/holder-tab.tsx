"use client";

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { KeyStats } from './key-stats';
import { IncomeStatement } from './income-statement';
import { BalanceSheet } from './balance-sheet';
import { CashFlow } from './cash-flow';
import { Building2, FileText, Sheet, Banknote, BarChart3, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FinancialTabHolderProps {
  symbol: string;
  className?: string;
}

// Tab configuration with icons and descriptions
const FINANCIAL_TABS = [
  {
    id: 'key-stats',
    label: 'Key Statistics',
    icon: BarChart3,
    description: 'Key financial metrics and ratios',
    component: KeyStats,
  },
  {
    id: 'income-statement',
    label: 'Income Statement',
    icon: FileText,
    description: 'Revenue, expenses, and profitability',
    component: IncomeStatement,
  },
  {
    id: 'balance-sheet',
    label: 'Balance Sheet',
    icon: Sheet,
    description: 'Assets, liabilities, and equity',
    component: BalanceSheet,
  },
  {
    id: 'cash-flow',
    label: 'Cash Flow',
    icon: Banknote,
    description: 'Operating, investing, and financing activities',
    component: CashFlow,
  },
] as const;

export function FinancialTabHolder({ symbol, className = '' }: FinancialTabHolderProps) {
  const [activeTab, setActiveTab] = useState('key-stats');

  return (
    <div className={cn("space-y-6", className)}>

      {/* Tabbed Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:w-fit lg:grid-cols-4 gap-1 h-auto p-1 bg-muted/50">
          {FINANCIAL_TABS.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex flex-col items-center space-y-2 p-3 h-auto data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 data-[state=active]:shadow-sm"
              >
                <div className="flex items-center space-x-2">
                  <IconComponent className="h-4 w-4" />
                  <span className="font-medium text-xs lg:text-sm">{tab.label}</span>
                </div>
                <span className="text-xs text-muted-foreground hidden lg:block text-center leading-tight">
                  {tab.description}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Content */}
        <div className="mt-6">
          {FINANCIAL_TABS.map((tab) => {
            const Component = tab.component;
            return (
              <TabsContent
                key={tab.id}
                value={tab.id}
                className="space-y-6 focus-visible:outline-none"
              >
                <div className="relative">
                  {/* Tab Header with active indicator */}
                  <div className="mb-6 flex items-center space-x-3 p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50 rounded-lg border">
                    <div className="p-2 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                      <tab.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {tab.label}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {tab.description}
                      </p>
                    </div>
                    <div className="ml-auto flex items-center space-x-2">
                      <Badge variant="outline" className="text-xs">
                        {symbol}
                      </Badge>
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    </div>
                  </div>

                  {/* Component Content */}
                  <Component symbol={symbol} />
                </div>
              </TabsContent>
            );
          })}
        </div>
      </Tabs>

      {/* Footer Information */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center space-x-4">
              <span>📊 Real-time financial data</span>
              <span>📈 Historical comparisons</span>
              <span>🔄 Auto-refreshing</span>
            </div>
            <div className="text-xs">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default FinancialTabHolder;