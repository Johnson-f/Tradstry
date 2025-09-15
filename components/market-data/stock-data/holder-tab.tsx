"use client";

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface HoldersTabProps {
  symbol: string;
  className?: string;
}

export function HoldersTab({ symbol, className = '' }: HoldersTabProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      <Card>
        <CardHeader>
          <CardTitle>Holders Information for {symbol}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Institutional and insider holdings data will be displayed here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default HoldersTab;