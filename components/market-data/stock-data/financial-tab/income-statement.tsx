"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIncomeStatement } from '@/lib/hooks/use-market-data';
import { FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IncomeStatementProps {
  symbol: string;
  frequency?: 'annual' | 'quarterly';
  className?: string;
}

// Format currency values
const formatCurrency = (value: string | number | undefined | null): string => {
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

// Format percentage
const formatPercentage = (numerator: string | number | undefined | null, denominator: string | number | undefined | null): string => {
  const numNumerator = parseFloat(numerator);
  const numDenominator = parseFloat(denominator);

  if (isNaN(numNumerator) || isNaN(numDenominator) || numDenominator === 0) return 'N/A';
  
  const percentage = (numNumerator / numDenominator) * 100;
  return `${percentage.toFixed(1)}%`;
};

// Format date
const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

// Get trend indicator for income values
const getTrendIndicator = (value: string | number | undefined | null) => {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return null;
  return num > 0 ? (
    <TrendingUp className="h-4 w-4 text-green-500 inline ml-1" />
  ) : (
    <TrendingDown className="h-4 w-4 text-red-500 inline ml-1" />
  );
};

export function IncomeStatement({ symbol, frequency = 'annual', className = '' }: IncomeStatementProps) {
  const [limit] = useState(4);
  
  const { incomeStatement, isLoading, error, refetch } = useIncomeStatement({
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
              {Array.from({ length: 12 }).map((_, i) => (
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
            Failed to load income statement for {symbol}: {error.message}
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
  if (!incomeStatement || incomeStatement.length === 0) {
    return (
      <div className={cn("space-y-6", className)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>Income Statement - {symbol}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No income statement data available for {symbol}
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
              <FileText className="h-5 w-5" />
              <span>Income Statement - {symbol}</span>
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
                  <TableHead className="font-semibold">Income Statement Item</TableHead>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableHead key={index} className="text-right font-semibold">
                      {formatDate(statement.fiscal_date)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Revenue Section */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg">REVENUE</TableCell>
                  {incomeStatement.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow className="bg-green-50 dark:bg-green-900/20">
                  <TableCell className="font-bold pl-4">Total Revenue</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency(statement.total_revenue)}
                      {getTrendIndicator(statement.total_revenue)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Operating Revenue</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.operating_revenue)}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Cost & Expenses Section */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg pt-6">COSTS & EXPENSES</TableCell>
                  {incomeStatement.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Cost of Revenue</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.cost_of_revenue)}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({formatPercentage(statement.cost_of_revenue, statement.total_revenue)})
                      </span>
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow className="bg-blue-50 dark:bg-blue-900/20">
                  <TableCell className="font-bold pl-4">Gross Profit</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency(statement.gross_profit)}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({formatPercentage(statement.gross_profit, statement.total_revenue)})
                      </span>
                      {getTrendIndicator(statement.gross_profit)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Operating Expenses</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.operating_expense)}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({formatPercentage(statement.operating_expense, statement.total_revenue)})
                      </span>
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-8">Selling, General & Administrative</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.selling_general_and_administrative)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-8">Research & Development</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.research_and_development)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow className="bg-orange-50 dark:bg-orange-900/20">
                  <TableCell className="font-bold pl-4">Operating Income</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency(statement.operating_income)}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({formatPercentage(statement.operating_income, statement.total_revenue)})
                      </span>
                      {getTrendIndicator(statement.operating_income)}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Other Income/Expenses */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg pt-6">OTHER INCOME/(EXPENSE)</TableCell>
                  {incomeStatement.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Interest Income</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.interest_income)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Interest Expense</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.interest_expense)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Other Income/Expense</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.other_income_expense)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow className="bg-purple-50 dark:bg-purple-900/20">
                  <TableCell className="font-bold pl-4">Pretax Income</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency(statement.pretax_income)}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({formatPercentage(statement.pretax_income, statement.total_revenue)})
                      </span>
                      {getTrendIndicator(statement.pretax_income)}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Net Income Section */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg pt-6">NET INCOME</TableCell>
                  {incomeStatement.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow className="border-t-2 border-primary/20 bg-green-50 dark:bg-green-900/20">
                  <TableCell className="font-bold text-lg">Net Income (Common Stockholders)</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold text-lg">
                      {formatCurrency(statement.net_income_common_stockholders)}
                      <span className="text-xs text-muted-foreground ml-2">
                        ({formatPercentage(statement.net_income_common_stockholders, statement.total_revenue)})
                      </span>
                      {getTrendIndicator(statement.net_income_common_stockholders)}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Earnings Per Share */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg pt-6">EARNINGS PER SHARE</TableCell>
                  {incomeStatement.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Basic EPS</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-semibold">
                      {formatCurrency(statement.basic_eps)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-4">Diluted EPS</TableCell>
                  {incomeStatement.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-semibold">
                      {formatCurrency(statement.diluted_eps)}
                      {getTrendIndicator(statement.diluted_eps)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default IncomeStatement;