'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/lib/hooks/use-analytics';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, ArrowUp, ArrowDown, Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const StatCard = ({
  title,
  value,
  change,
  icon: Icon,
  isLoading = false,
  className = '',
}: {
  title: string;
  value: string;
  change?: { value: number; label: string };
  icon: React.ComponentType<{ className?: string }>;
  isLoading?: boolean;
  className?: string;
}) => (
  <Card className={cn('h-full', className)}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-muted-foreground">
        {title}
      </CardTitle>
      <div className="h-4 w-4 text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">
        {isLoading ? <Skeleton className="h-8 w-24" /> : value}
      </div>
      {change && (
        <p className="text-xs text-muted-foreground flex items-center mt-1">
          {change.value > 0 ? (
            <ArrowUp className="h-3 w-3 text-green-500 mr-1" />
          ) : (
            <ArrowDown className="h-3 w-3 text-red-500 mr-1" />
          )}
          <span className={cn(
            'text-xs',
            change.value > 0 ? 'text-green-500' : 'text-red-500'
          )}>
            {change.value > 0 ? '+' : ''}{change.value}% {change.label}
          </span>
        </p>
      )}
    </CardContent>
  </Card>
);

export function AnalyticsDashboard() {
  const { stocks, options, isLoading, error, refetch } = useAnalytics();

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load analytics data. {error.message}
          <button 
            onClick={() => refetch()} 
            className="ml-2 text-blue-500 hover:underline"
          >
            Retry
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Tabs defaultValue="stocks" className="w-full">
      <TabsList className="grid w-full grid-cols-2 max-w-xs mb-6">
        <TabsTrigger value="stocks">Stocks</TabsTrigger>
        <TabsTrigger value="options">Options</TabsTrigger>
      </TabsList>

      <TabsContent value="stocks" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Win Rate"
            value={isLoading ? '--' : `${Math.round(stocks?.winRate || 0)}%`}
            change={{ value: 12, label: 'vs last period' }}
            icon={Trophy}
            className="bg-blue-50 dark:bg-blue-900/20"
          />
          <StatCard
            title="Risk/Reward"
            value={isLoading ? '--' : `1:${(stocks?.riskRewardRatio || 0).toFixed(2)}`}
            change={{ value: 8, label: 'vs last period' }}
            icon={TrendingUp}
            className="bg-green-50 dark:bg-green-900/20"
          />
          <StatCard
            title="Avg. Win"
            value={isLoading ? '--' : formatCurrency(stocks?.averageGain || 0)}
            change={{ value: 5, label: 'vs last period' }}
            icon={ArrowUp}
            className="bg-purple-50 dark:bg-purple-900/20"
          />
          <StatCard
            title="Avg. Loss"
            value={isLoading ? '--' : formatCurrency(stocks?.averageLoss || 0)}
            change={{ value: -3, label: 'vs last period' }}
            icon={TrendingDown}
            className="bg-red-50 dark:bg-red-900/20"
          />
        </div>
      </TabsContent>

      <TabsContent value="options" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Win Rate"
            value={isLoading ? '--' : `${Math.round(options?.winRate || 0)}%`}
            change={{ value: 10, label: 'vs last period' }}
            icon={Trophy}
            className="bg-blue-50 dark:bg-blue-900/20"
          />
          <StatCard
            title="Risk/Reward"
            value={isLoading ? '--' : `1:${(options?.riskRewardRatio || 0).toFixed(2)}`}
            change={{ value: 6, label: 'vs last period' }}
            icon={TrendingUp}
            className="bg-green-50 dark:bg-green-900/20"
          />
          <StatCard
            title="Avg. Win"
            value={isLoading ? '--' : formatCurrency(options?.averageGain || 0)}
            change={{ value: 4, label: 'vs last period' }}
            icon={ArrowUp}
            className="bg-purple-50 dark:bg-purple-900/20"
          />
          <StatCard
            title="Avg. Loss"
            value={isLoading ? '--' : formatCurrency(options?.averageLoss || 0)}
            change={{ value: -2, label: 'vs last period' }}
            icon={TrendingDown}
            className="bg-red-50 dark:bg-red-900/20"
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
