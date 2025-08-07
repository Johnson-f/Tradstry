'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/lib/hooks/use-analytics';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export function AnalyticsDashboard() {
  const { portfolio, stocks, options, isLoading, error, refetch } = useAnalytics();

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

  const renderMetricCard = (title: string, value: string | number, description?: string) => (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">
          {isLoading ? <Skeleton className="h-8 w-24" /> : value}
        </CardTitle>
      </CardHeader>
      {description && (
        <CardContent>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      )}
    </Card>
  );

  const renderProgressCard = (title: string, value: number, description?: string) => (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">
          {isLoading ? <Skeleton className="h-8 w-24" /> : `${Math.round(value)}%`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={value} className="h-2" />
        {description && <p className="mt-2 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );

  const renderCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Trading Analytics</h2>
          <p className="text-muted-foreground">
            Key metrics and performance indicators for your trading portfolio
          </p>
        </div>
      </div>

      <Tabs defaultValue="portfolio" className="space-y-4">
        <TabsList>
          <TabsTrigger value="portfolio">Portfolio Overview</TabsTrigger>
          <TabsTrigger value="stocks">Stocks</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
        </TabsList>

        <TabsContent value="portfolio" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {renderMetricCard(
              'Total P&L',
              isLoading ? '--' : renderCurrency((portfolio?.stocks.net_pnl || 0) + (portfolio?.options.net_pnl || 0)),
              'Combined profit/loss from all trades'
            )}
            {renderMetricCard(
              'Stocks P&L',
              isLoading ? '--' : renderCurrency(portfolio?.stocks.net_pnl || 0),
              'Profit/loss from stock trades'
            )}
            {renderMetricCard(
              'Options P&L',
              isLoading ? '--' : renderCurrency(portfolio?.options.net_pnl || 0),
              'Profit/loss from options trades'
            )}
          </div>
        </TabsContent>

        <TabsContent value="stocks" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {renderProgressCard(
              'Win Rate',
              stocks?.winRate || 0,
              'Percentage of winning trades'
            )}
            {renderMetricCard(
              'Avg. Gain',
              isLoading ? '--' : renderCurrency(stocks?.averageGain || 0),
              'Average profit per winning trade'
            )}
            {renderMetricCard(
              'Avg. Loss',
              isLoading ? '--' : renderCurrency(stocks?.averageLoss || 0),
              'Average loss per losing trade'
            )}
            {renderMetricCard(
              'Risk/Reward',
              isLoading ? '--' : (stocks?.riskRewardRatio || 0).toFixed(2),
              'Ratio of average loss to average gain'
            )}
            {renderMetricCard(
              'Expectancy',
              isLoading ? '--' : renderCurrency(stocks?.tradeExpectancy || 0),
              'Expected value per trade'
            )}
          </div>
        </TabsContent>

        <TabsContent value="options" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {renderProgressCard(
              'Win Rate',
              options?.winRate || 0,
              'Percentage of winning trades'
            )}
            {renderMetricCard(
              'Avg. Gain',
              isLoading ? '--' : renderCurrency(options?.averageGain || 0),
              'Average profit per winning trade'
            )}
            {renderMetricCard(
              'Avg. Loss',
              isLoading ? '--' : renderCurrency(options?.averageLoss || 0),
              'Average loss per losing trade'
            )}
            {renderMetricCard(
              'Risk/Reward',
              isLoading ? '--' : (options?.riskRewardRatio || 0).toFixed(2),
              'Ratio of average loss to average gain'
            )}
            {renderMetricCard(
              'Expectancy',
              isLoading ? '--' : renderCurrency(options?.tradeExpectancy || 0),
              'Expected value per trade'
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
