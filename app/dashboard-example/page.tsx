"use client";

import React, { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  AlertTriangle,
  Wallet,
  BarChart3,
  PieChart
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useStocks,
  useOpenStockPositions,
  useClosedStockPositions,
  useStockTradingStats
} from '@/lib/hooks/use-stocks';
import {
  useOptions,
  useOpenOptionPositions,
  useClosedOptionPositions,
  useOptionTradingStats,
  useOptionsExpiringWithin
} from '@/lib/hooks/use-options';
import { StockTradingExample } from '@/components/examples/stock-trading-example';
import { apiClient } from '@/lib/services/api-client';

export default function DashboardExample() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Trading Dashboard</h1>
          <p className="text-muted-foreground">
            Connected to your FastAPI backend with real-time data
          </p>
        </div>
        <ConnectionStatus />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stocks">Stocks</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Suspense fallback={<StatCardSkeleton />}>
              <PortfolioValueCard />
            </Suspense>
            <Suspense fallback={<StatCardSkeleton />}>
              <OpenPositionsCard />
            </Suspense>
            <Suspense fallback={<StatCardSkeleton />}>
              <TodaysPLCard />
            </Suspense>
            <Suspense fallback={<StatCardSkeleton />}>
              <WinRateCard />
            </Suspense>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Suspense fallback={<CardSkeleton />}>
              <RecentTradesCard />
            </Suspense>
            <Suspense fallback={<CardSkeleton />}>
              <ExpiringOptionsCard />
            </Suspense>
          </div>
        </TabsContent>

        <TabsContent value="stocks">
          <StockTradingExample />
        </TabsContent>

        <TabsContent value="options">
          <Suspense fallback={<div>Loading options...</div>}>
            <OptionsOverview />
          </Suspense>
        </TabsContent>

        <TabsContent value="analytics">
          <Suspense fallback={<div>Loading analytics...</div>}>
            <TradingAnalytics />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Connection Status Component
function ConnectionStatus() {
  const [status, setStatus] = React.useState<'checking' | 'connected' | 'error'>('checking');

  React.useEffect(() => {
    const checkConnection = async () => {
      try {
        await apiClient.healthCheck();
        setStatus('connected');
      } catch (error) {
        setStatus('error');
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${
        status === 'connected' ? 'bg-green-500' :
        status === 'error' ? 'bg-red-500' : 'bg-yellow-500'
      }`} />
      <span className="text-sm text-muted-foreground">
        {status === 'connected' ? 'Backend Connected' :
         status === 'error' ? 'Backend Offline' : 'Checking...'}
      </span>
    </div>
  );
}

// Portfolio Value Card
function PortfolioValueCard() {
  const { stats: stockStats } = useStockTradingStats();
  const { stats: optionStats } = useOptionTradingStats();

  const totalPL = (stockStats?.total_profit_loss || 0) + (optionStats?.total_profit_loss || 0);
  const isPositive = totalPL >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          ${totalPL.toFixed(2)}
        </div>
        <p className="text-xs text-muted-foreground">
          All time profit/loss
        </p>
      </CardContent>
    </Card>
  );
}

// Open Positions Card
function OpenPositionsCard() {
  const { openPositions: stockPositions } = useOpenStockPositions();
  const { openPositions: optionPositions } = useOpenOptionPositions();

  const totalOpenPositions = (stockPositions?.length || 0) + (optionPositions?.length || 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Open Positions</CardTitle>
        <Activity className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{totalOpenPositions}</div>
        <p className="text-xs text-muted-foreground">
          {stockPositions?.length || 0} stocks, {optionPositions?.length || 0} options
        </p>
      </CardContent>
    </Card>
  );
}

// Today's P&L Card (mock data - you'd calculate this from today's trades)
function TodaysPLCard() {
  // This would typically filter trades by today's date
  const todaysPL = 0; // Mock value
  const isPositive = todaysPL >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Today's P&L</CardTitle>
        {isPositive ? (
          <TrendingUp className="h-4 w-4 text-green-600" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-600" />
        )}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          ${Math.abs(todaysPL).toFixed(2)}
        </div>
        <p className="text-xs text-muted-foreground">
          Today's trading performance
        </p>
      </CardContent>
    </Card>
  );
}

// Win Rate Card
function WinRateCard() {
  const { stats: stockStats } = useStockTradingStats();
  const { stats: optionStats } = useOptionTradingStats();

  // Calculate combined win rate
  const totalClosedTrades = (stockStats?.closed_trades || 0) + (optionStats?.closed_trades || 0);
  const stockWins = stockStats?.closed_trades ? (stockStats.win_rate / 100) * stockStats.closed_trades : 0;
  const optionWins = optionStats?.closed_trades ? (optionStats.win_rate / 100) * optionStats.closed_trades : 0;

  const overallWinRate = totalClosedTrades > 0 ? ((stockWins + optionWins) / totalClosedTrades) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{overallWinRate.toFixed(1)}%</div>
        <p className="text-xs text-muted-foreground">
          Across {totalClosedTrades} closed trades
        </p>
      </CardContent>
    </Card>
  );
}

// Recent Trades Card
function RecentTradesCard() {
  const { stocks } = useStocks();
  const { options } = useOptions();

  // Combine and sort recent trades
  const recentTrades = React.useMemo(() => {
    const stockTrades = (stocks || []).map(stock => ({
      ...stock,
      type: 'stock' as const,
      date: stock.entry_date,
    }));

    const optionTrades = (options || []).map(option => ({
      ...option,
      type: 'option' as const,
      date: option.entry_date,
    }));

    return [...stockTrades, ...optionTrades]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [stocks, options]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Trades</CardTitle>
        <CardDescription>Your latest trading activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recentTrades.length > 0 ? recentTrades.map((trade, index) => (
            <div key={`${trade.type}-${trade.id}`} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Badge variant={trade.type === 'stock' ? 'default' : 'secondary'}>
                  {trade.type}
                </Badge>
                <div>
                  <p className="text-sm font-medium">{trade.symbol}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(trade.date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Badge variant={trade.status === 'open' ? 'outline' : 'secondary'}>
                {trade.status}
              </Badge>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">No recent trades</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Expiring Options Card
function ExpiringOptionsCard() {
  const { expiringOptions } = useOptionsExpiringWithin(7); // Next 7 days

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Expiring Options
        </CardTitle>
        <CardDescription>Options expiring in the next 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {expiringOptions && expiringOptions.length > 0 ? expiringOptions.map((option) => (
            <div key={option.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{option.symbol}</p>
                <p className="text-xs text-muted-foreground">
                  ${option.strike_price} {option.option_type}
                </p>
              </div>
              <Badge variant="outline">
                {new Date(option.expiration_date).toLocaleDateString()}
              </Badge>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">No expiring options</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Options Overview Component
function OptionsOverview() {
  const { options, isLoading, error } = useOptions();

  if (error) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Error loading options: {error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Options Trading</h2>
          <p className="text-muted-foreground">Manage your options positions</p>
        </div>
        <Button>
          Add Option Trade
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Options</CardTitle>
          <CardDescription>Your options trading history</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading options...</p>
          ) : options && options.length > 0 ? (
            <div className="space-y-4">
              {options.slice(0, 10).map((option) => (
                <div key={option.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{option.symbol}</span>
                        <Badge variant={option.option_type === 'Call' ? 'default' : 'secondary'}>
                          {option.option_type}
                        </Badge>
                        <Badge variant="outline">
                          ${option.strike_price}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {option.number_of_contracts} contracts @ ${option.entry_price}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={option.status === 'open' ? 'outline' : 'secondary'}>
                      {option.status}
                    </Badge>
                    <div className="text-sm text-muted-foreground">
                      Exp: {new Date(option.expiration_date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No options found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Trading Analytics Component
function TradingAnalytics() {
  const { stats: stockStats } = useStockTradingStats();
  const { stats: optionStats } = useOptionTradingStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Trading Analytics</h2>
        <p className="text-muted-foreground">Comprehensive analysis of your trading performance</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stock Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            {stockStats ? (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Total Trades:</span>
                  <span>{stockStats.total_trades}</span>
                </div>
                <div className="flex justify-between">
                  <span>Win Rate:</span>
                  <span>{stockStats.win_rate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Total P&L:</span>
                  <span className={stockStats.total_profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}>
                    ${stockStats.total_profit_loss.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Win:</span>
                  <span className="text-green-600">${stockStats.average_win.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Loss:</span>
                  <span className="text-red-600">${stockStats.average_loss.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Loading stock statistics...</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Options Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            {optionStats ? (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Total Trades:</span>
                  <span>{optionStats.total_trades}</span>
                </div>
                <div className="flex justify-between">
                  <span>Win Rate:</span>
                  <span>{optionStats.win_rate.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Total P&L:</span>
                  <span className={optionStats.total_profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}>
                    ${optionStats.total_profit_loss.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Win:</span>
                  <span className="text-green-600">${optionStats.average_win.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg Loss:</span>
                  <span className="text-red-600">${optionStats.average_loss.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Loading options statistics...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Skeleton Components
function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-20 bg-gray-200 rounded animate-pulse mb-2" />
        <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
