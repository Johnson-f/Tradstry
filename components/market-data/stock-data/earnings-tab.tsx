"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface EarningsTabProps {
  symbol: string;
  className?: string;
}

export function EarningsTab({ symbol, className = '' }: EarningsTabProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle>Earnings Data for {symbol}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Earnings data and analysis will be displayed here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default EarningsTab;