"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Calculator,
  PieChart
} from "lucide-react";

interface AnalyticsCardsProps {
  type: 'stocks' | 'options';
  winRate: number | null;
  avgGain: number | null;
  avgLoss: number | null;
  riskRewardRatio: number | null;
  tradeExpectancy: number | null;
  netPnl: number | null;
  isLoading: boolean;
}

export function AnalyticsCards({
  type,
  winRate,
  avgGain,
  avgLoss,
  riskRewardRatio,
  tradeExpectancy,
  netPnl,
  isLoading
}: AnalyticsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-20 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const formatPercentage = (value: number | null): string => {
    if (value === null || value === undefined) return 'N/A';
    return `${value.toFixed(2)}%`;
  };

  const formatCurrency = (value: number | null): string => {
    if (value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatNumber = (value: number | null): string => {
    if (value === null || value === undefined) return 'N/A';
    return value.toFixed(2);
  };

  const getValueColor = (value: number | null, isInverted: boolean = false): string => {
    if (value === null || value === undefined) return 'text-muted-foreground';
    const isPositive = value > 0;
    if (isInverted) {
      return isPositive ? 'text-red-600' : 'text-green-600';
    }
    return isPositive ? 'text-green-600' : 'text-red-600';
  };

  const cards = [
    {
      title: "Win Rate",
      value: formatPercentage(winRate),
      description: `Percentage of winning ${type} trades`,
      icon: Target,
      color: getValueColor(winRate),
    },
    {
      title: "Average Gain",
      value: formatCurrency(avgGain),
      description: `Average profit per winning ${type.slice(0, -1)} trade`,
      icon: TrendingUp,
      color: getValueColor(avgGain),
    },
    {
      title: "Average Loss",
      value: formatCurrency(avgLoss),
      description: `Average loss per losing ${type.slice(0, -1)} trade`,
      icon: TrendingDown,
      color: getValueColor(avgLoss, true), // Inverted because lower loss is better
    },
    {
      title: "Risk/Reward Ratio",
      value: formatNumber(riskRewardRatio),
      description: `Risk to reward ratio for ${type} trades`,
      icon: Calculator,
      color: getValueColor(riskRewardRatio ? -riskRewardRatio : null), // Lower is better
    },
    {
      title: "Trade Expectancy",
      value: formatCurrency(tradeExpectancy),
      description: `Expected value per ${type.slice(0, -1)} trade`,
      icon: PieChart,
      color: getValueColor(tradeExpectancy),
    },
    {
      title: "Net P&L",
      value: formatCurrency(netPnl),
      description: `Total profit/loss from ${type} trades`,
      icon: DollarSign,
      color: getValueColor(netPnl),
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card, index) => (
        <Card key={index} className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {card.title}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${card.color}`}>
              {card.value}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
