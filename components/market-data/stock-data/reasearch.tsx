"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ResearchTabProps {
  symbol: string;
  className?: string;
}

export function ResearchTab({ symbol, className = '' }: ResearchTabProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle>Research & Analysis for {symbol}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Research reports and analyst recommendations will be displayed here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default ResearchTab;