"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCashFlow } from '@/lib/hooks/use-market-data';
import { Banknote, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CashFlowProps {
  symbol: string;
  frequency?: 'annual' | 'quarterly';
  className?: string;
}

// Format currency values
const formatCurrency = (value: any): string => {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return '$0.00';

  if (Math.abs(num) >= 1e12) {
    return `$${(num / 1e12).toFixed(2)}T`;
  } else if (Math.abs(num) >= 1e9) {
    return `$${(num / 1e9).toFixed(2)}B`;
  } else if (Math.abs(num) >= 1e6) {
    return `$${(num / 1e6).toFixed(2)}M`;
  } else if (Math.abs(num) >= 1e3) {
    return `$${(num / 1e3).toFixed(2)}K`;
  }
  return `$${num.toFixed(2)}`;
};

// Format date
const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Get trend indicator for cash flow values
const getTrendIndicator = (value: any) => {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return null;
  return num > 0 ? (
    <TrendingUp className="h-4 w-4 text-green-500 inline ml-1" />
  ) : (
    <TrendingDown className="h-4 w-4 text-red-500 inline ml-1" />
  );
};

export function CashFlow({ symbol, frequency = 'annual', className = '' }: CashFlowProps) {
  const [limit, setLimit] = useState(4);
  
  const { cashFlow, isLoading, error, refetch } = useCashFlow({
    symbol,
    frequency,
    limit,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-6", className)}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-48" />
              <div className="flex space-x-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center p-2 border rounded">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("space-y-6", className)}>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load cash flow statement for {symbol}: {error.message}
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-2"
              onClick={() => refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // No data state
  if (!cashFlow || cashFlow.length === 0) {
    return (
      <div className={cn("space-y-6", className)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Banknote className="h-5 w-5" />
              <span>Cash Flow Statement - {symbol}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No cash flow data available for {symbol}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Banknote className="h-5 w-5" />
              <span>Cash Flow Statement - {symbol}</span>
            </CardTitle>
            <div className="flex space-x-2">
              <Button
                variant={frequency === 'annual' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFrequency('annual')}
              >
                Annual
              </Button>
              <Button
                variant={frequency === 'quarterly' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFrequency('quarterly')}
              >
                Quarterly
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold">Cash Flow Item</TableHead>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableHead key={index} className="text-right font-semibold">
                      {formatDate(statement.fiscal_date)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Operating Activities */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg">OPERATING ACTIVITIES</TableCell>
                  {cashFlow.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Net Income</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.net_income)}
                      {getTrendIndicator(statement.net_income)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Depreciation & Amortization</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.depreciation_amortization_depletion)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Changes in Working Capital</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.changes_in_working_capital)}
                      {getTrendIndicator(statement.changes_in_working_capital)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow className="bg-blue-50 dark:bg-blue-900/20">
                  <TableCell className="font-bold pl-4">Operating Cash Flow</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency(statement.operating_cash_flow)}
                      {getTrendIndicator(statement.operating_cash_flow)}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Investing Activities */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg pt-6">INVESTING ACTIVITIES</TableCell>
                  {cashFlow.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Capital Expenditures</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.capital_expenditure)}
                      {getTrendIndicator(statement.capital_expenditure)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Acquisitions & Investments</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.investments_in_businesses_net)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow className="bg-orange-50 dark:bg-orange-900/20">
                  <TableCell className="font-bold pl-4">Investing Cash Flow</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency(statement.investing_cash_flow)}
                      {getTrendIndicator(statement.investing_cash_flow)}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Financing Activities */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg pt-6">FINANCING ACTIVITIES</TableCell>
                  {cashFlow.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Dividends Paid</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.cash_dividends_paid)}
                      {getTrendIndicator(statement.cash_dividends_paid)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Share Repurchases</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.repurchase_of_capital_stock)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Debt Issuance/(Repayment)</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.long_term_debt_issuance)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow className="bg-purple-50 dark:bg-purple-900/20">
                  <TableCell className="font-bold pl-4">Financing Cash Flow</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency(statement.financing_cash_flow)}
                      {getTrendIndicator(statement.financing_cash_flow)}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Net Change in Cash */}
                <TableRow className="border-t-2 border-primary/20 bg-green-50 dark:bg-green-900/20">
                  <TableCell className="font-bold text-lg">Net Change in Cash</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold text-lg">
                      {formatCurrency(statement.changes_in_cash)}
                      {getTrendIndicator(statement.changes_in_cash)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="font-semibold">Free Cash Flow</TableCell>
                  {cashFlow.slice(0, 4).map((statement, index) => {
                    const freeCashFlow = (statement.operating_cash_flow || 0) + (statement.capital_expenditure || 0);
                    return (
                      <TableCell key={index} className="text-right font-mono font-semibold">
                        {formatCurrency(freeCashFlow)}
                        {getTrendIndicator(freeCashFlow)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CashFlow;