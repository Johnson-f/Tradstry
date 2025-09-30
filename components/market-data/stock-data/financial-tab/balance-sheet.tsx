"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBalanceSheet } from '@/lib/hooks/use-market-data';
import { Sheet, TrendingUp, TrendingDown, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BalanceSheetProps {
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

export function BalanceSheet({ symbol, frequency = 'annual', className = '' }: BalanceSheetProps) {
  const [limit, setLimit] = useState(4);
  
  const { balanceSheet, isLoading, error, refetch } = useBalanceSheet({
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
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center p-2 border rounded">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
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
            Failed to load balance sheet for {symbol}: {error.message}
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
  if (!balanceSheet || balanceSheet.length === 0) {
    return (
      <div className={cn("space-y-6", className)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Sheet className="h-5 w-5" />
              <span>Balance Sheet - {symbol}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No balance sheet data available for {symbol}
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
              <Sheet className="h-5 w-5" />
              <span>Balance Sheet - {symbol}</span>
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
                  <TableHead className="font-semibold">Item</TableHead>
                  {balanceSheet.slice(0, 4).map((statement, index) => (
                    <TableHead key={index} className="text-right font-semibold">
                      {formatDate(statement.fiscal_date)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Assets Section */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg">ASSETS</TableCell>
                  {balanceSheet.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                {/* Current Assets */}
                <TableRow className="bg-muted/30">
                  <TableCell className="font-semibold pl-4">Current Assets</TableCell>
                  {balanceSheet.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-8">Cash and Cash Equivalents</TableCell>
                  {balanceSheet.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.cash_and_cash_equivalents)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-8">Total Current Assets</TableCell>
                  {balanceSheet.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.current_assets)}
                    </TableCell>
                  ))}
                </TableRow>
                
                {/* Non-Current Assets */}
                <TableRow className="bg-muted/30">
                  <TableCell className="font-semibold pl-4">Non-Current Assets</TableCell>
                  {balanceSheet.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-8">Property, Plant & Equipment</TableCell>
                  {balanceSheet.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.properties_plant_equipment_net)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-8">Total Assets</TableCell>
                  {balanceSheet.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency(statement.total_assets)}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Liabilities Section */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg pt-6">LIABILITIES</TableCell>
                  {balanceSheet.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                {/* Current Liabilities */}
                <TableRow className="bg-muted/30">
                  <TableCell className="font-semibold pl-4">Current Liabilities</TableCell>
                  {balanceSheet.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-8">Total Current Liabilities</TableCell>
                  {balanceSheet.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono">
                      {formatCurrency(statement.current_liabilities)}
                    </TableCell>
                  ))}
                </TableRow>
                
                {/* Non-Current Liabilities */}
                <TableRow className="bg-muted/30">
                  <TableCell className="font-semibold pl-4">Non-Current Liabilities</TableCell>
                  {balanceSheet.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-8">Total Liabilities</TableCell>
                  {balanceSheet.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency(statement.total_liabilities_net_minority_interest)}
                    </TableCell>
                  ))}
                </TableRow>

                {/* Equity Section */}
                <TableRow className="bg-muted/50">
                  <TableCell className="font-bold text-lg pt-6">EQUITY</TableCell>
                  {balanceSheet.slice(0, 4).map((_, index) => (
                    <TableCell key={index}></TableCell>
                  ))}
                </TableRow>
                
                <TableRow>
                  <TableCell className="pl-8">Total Stockholders' Equity</TableCell>
                  {balanceSheet.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency(statement.stockholders_equity)}
                    </TableCell>
                  ))}
                </TableRow>
                
                <TableRow className="border-t-2 border-primary/20">
                  <TableCell className="font-bold">Total Liabilities & Equity</TableCell>
                  {balanceSheet.slice(0, 4).map((statement, index) => (
                    <TableCell key={index} className="text-right font-mono font-bold">
                      {formatCurrency((statement.total_liabilities_net_minority_interest || 0) + (statement.stockholders_equity || 0))}
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

export default BalanceSheet;