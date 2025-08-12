"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Activity, Target, Lock, Users, BarChart3 } from 'lucide-react';
import { SetupSummary } from '@/lib/types/setups';
import { setupsService } from '@/lib/services/setups-service';

interface SetupsDashboardProps {
  onSetupClick?: (setupId: number) => void;
}

export function SetupsDashboard({ onSetupClick }: SetupsDashboardProps) {
  const [summaries, setSummaries] = useState<SetupSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummaries();
  }, []);

  const loadSummaries = async () => {
    try {
      setLoading(true);
      const data = await setupsService.getSetupSummaries();
      setSummaries(data);
    } catch (error) {
      console.error('Error loading setup summaries:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTotalMetrics = () => {
    if (summaries.length === 0) return null;

    return {
      totalSetups: summaries.length,
      totalTrades: summaries.reduce((sum, s) => sum + s.total_trades, 0),
      totalProfitLoss: summaries.reduce((sum, s) => sum + s.avg_profit_loss, 0),
      avgWinRate: summaries.reduce((sum, s) => sum + (s.winning_trades / Math.max(s.total_trades, 1)), 0) / summaries.length * 100
    };
  };

  const getCategoryBreakdown = () => {
    const breakdown: Record<string, number> = {};
    summaries.forEach(summary => {
      breakdown[summary.category] = (breakdown[summary.category] || 0) + 1;
    });
    return breakdown;
  };

  const totalMetrics = getTotalMetrics();
  const categoryBreakdown = getCategoryBreakdown();

  if (loading) {
    return (
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      {totalMetrics && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Setups</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMetrics.totalSetups}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMetrics.totalTrades}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Win Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalMetrics.avgWinRate.toFixed(1)}%</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total P&L</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${totalMetrics.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${totalMetrics.totalProfitLoss.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Setup Categories</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(categoryBreakdown).map(([category, count]) => (
              <div key={category} className="flex items-center justify-between p-3 border rounded-lg">
                <span className="font-medium">{category}</span>
                <Badge variant="secondary">{count}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top Performing Setups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Top Performing Setups</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summaries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No setups available
            </div>
          ) : (
            <div className="space-y-4">
              {summaries
                .filter(s => s.total_trades > 0)
                .sort((a, b) => b.avg_profit_loss - a.avg_profit_loss)
                .slice(0, 5)
                .map((summary) => (
                  <div
                    key={summary.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => onSetupClick?.(summary.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h4 className="font-medium">{summary.name}</h4>
                        <Badge variant="outline">{summary.category}</Badge>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                        <span>{summary.total_trades} trades</span>
                        <span>{summary.stock_trades} stocks</span>
                        <span>{summary.option_trades} options</span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className={`font-semibold ${summary.avg_profit_loss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${summary.avg_profit_loss.toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {summary.winning_trades > 0 ? 
                          `${((summary.winning_trades / summary.total_trades) * 100).toFixed(1)}% win rate` : 
                          'No wins yet'
                        }
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Activity className="h-5 w-5" />
            <span>Recent Activity</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summaries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent activity
            </div>
          ) : (
            <div className="space-y-3">
              {summaries
                .filter(s => s.total_trades > 0)
                .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
                .slice(0, 5)
                .map((summary) => (
                  <div key={summary.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-2 h-2 rounded-full ${summary.avg_profit_loss >= 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                      <span className="font-medium">{summary.name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {summary.total_trades} trades
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 