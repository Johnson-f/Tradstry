"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FinancialTabProps {
  symbol: string;
  className?: string;
}

export function FinancialTab({ symbol, className = '' }: FinancialTabProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle>Financial Data for {symbol}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Financial statements and analysis will be displayed here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default FinancialTab;