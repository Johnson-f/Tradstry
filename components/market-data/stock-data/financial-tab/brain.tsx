"use client";

import React from 'react';
import { FinancialTabHolder } from './holder-tab';

interface FinancialTabProps {
  symbol: string;
  className?: string;
}

export function FinancialTab({ symbol, className = '' }: FinancialTabProps) {
  return (
    <FinancialTabHolder 
      symbol={symbol} 
      className={className}
    />
  );
}

export default FinancialTab;