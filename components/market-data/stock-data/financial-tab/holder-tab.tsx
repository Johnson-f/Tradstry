"use client";

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KeyStats } from './key-stats';
import { IncomeStatement } from './income-statement';
import { BalanceSheet } from './balance-sheet';
import { CashFlow } from './cash-flow';
import { BarChart3, FileText, Sheet, Banknote, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FinancialTabHolderProps {
  symbol: string;
  className?: string;
}

// Tab configuration
const FINANCIAL_TABS = [
  {
    id: 'key-stats',
    label: 'Key Stats',
    icon: BarChart3,
    component: KeyStats,
  },
  {
    id: 'income-statement',
    label: 'Income Statement',
    icon: FileText,
    component: IncomeStatement,
  },
  {
    id: 'balance-sheet',
    label: 'Balance Sheet',
    icon: Sheet,
    component: BalanceSheet,
  },
  {
    id: 'cash-flow',
    label: 'Cash Flow',
    icon: Banknote,
    component: CashFlow,
  },
] as const;

export function FinancialTabHolder({ symbol, className = '' }: FinancialTabHolderProps) {
  const [activeTab, setActiveTab] = useState('key-stats');
  const [frequency, setFrequency] = useState<'annual' | 'quarterly'>('annual');

  const ActiveComponent = FINANCIAL_TABS.find(tab => tab.id === activeTab)?.component || KeyStats;

  return (
    <div className={cn("", className)}>
      <Card className="bg-card border">
        <CardContent className="p-0 -mt-5">
          {/* Integrated Header with Tabs and Controls */}
          <div className="flex items-center justify-between p-4 border-b">
            {/* Tab Navigation */}
            <div className="flex items-center space-x-1">
              {FINANCIAL_TABS.map((tab) => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <Button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    variant={isActive ? "default" : "ghost"}
                    size="sm"
                    className="flex items-center space-x-2"
                  >
                    <IconComponent className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </Button>
                );
              })}
            </div>

            {/* Controls */}
            <div className="flex items-center space-x-4">
              {/* Annual/Quarterly Select */}
              <Select value={frequency} onValueChange={(value: 'annual' | 'quarterly') => setFrequency(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>

              {/* Download Button */}
              <Button variant="ghost" size="icon">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Component Content */}
          <div className="p-0">
            <ActiveComponent 
              symbol={symbol} 
              frequency={frequency}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default FinancialTabHolder;