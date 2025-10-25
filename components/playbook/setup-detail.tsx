"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Edit, Trash2, Plus, TrendingUp, Activity } from 'lucide-react';
import { SetupInDB, TradeBySetup, SetupAnalytics, SetupCategory } from '@/lib/types/setups';
import { setupsService } from '@/lib/services/setups-service';
import { toast } from 'sonner';

interface SetupDetailProps {
  setup: SetupInDB;
  onEdit?: (setup: SetupInDB) => void;
  onDelete?: (setupId: number) => void;
}

export function SetupDetail({ setup, onEdit, onDelete }: SetupDetailProps) {
  const [trades, setTrades] = useState<TradeBySetup[]>([]);
  const [analytics, setAnalytics] = useState<SetupAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadSetupData();
  }, [setup.id, loadSetupData]);

  const loadSetupData = useCallback(async () => {
    try {
      setLoading(true);
      const [tradesData, analyticsData] = await Promise.all([
        setupsService.getSetupTrades(setup.id),
        setupsService.getSetupAnalytics(setup.id)
      ]);
      setTrades(tradesData);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Error loading setup data:', error);
      toast.error('Failed to load setup data');
    } finally {
      setLoading(false);
    }
  }, [setup.id]);

  const getCategoryColor = (category: SetupCategory) => {
    const colors = {
      Breakout: 'bg-blue-100 text-blue-800',
      Pullback: 'bg-green-100 text-green-800',
      Reversal: 'bg-red-100 text-red-800',
      Continuation: 'bg-purple-100 text-purple-800',
      Range: 'bg-yellow-100 text-yellow-800',
      Other: 'bg-gray-100 text-gray-800'
    };
    return colors[category] || colors.Other;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getProfitLossColor = (amount: number) => {
    return amount >= 0 ? 'text-green-600' : 'text-red-600';
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <h1 className="text-3xl font-bold">{setup.name}</h1>
            <Badge className={getCategoryColor(setup.category)}>
              {setup.category}
            </Badge>
            <div className={`w-3 h-3 rounded-full ${setup.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
          </div>
          
          {setup.description && (
            <p className="text-muted-foreground text-lg mb-4">{setup.description}</p>
          )}
          
          {setup.tags && setup.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {setup.tags.map((tag, index) => (
                <Badge key={index} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex space-x-2">
          {onEdit && (
            <Button variant="outline" size="sm" onClick={() => onEdit(setup)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {onDelete && (
            <Button variant="outline" size="sm" onClick={() => onDelete(setup.id)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.total_trades}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercentage(analytics.win_rate)}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total P&L</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getProfitLossColor(analytics.total_profit_loss)}`}>
                {formatCurrency(analytics.total_profit_loss)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Profit Factor</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.profit_factor.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trades">Trades ({trades.length})</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Setup Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Category</label>
                  <p className="text-sm">{setup.category}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Status</label>
                  <p className="text-sm">{setup.is_active ? 'Active' : 'Inactive'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Created</label>
                  <p className="text-sm">{new Date(setup.created_at).toLocaleDateString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Updated</label>
                  <p className="text-sm">{new Date(setup.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
              
              {setup.setup_conditions && Object.keys(setup.setup_conditions).length > 0 && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Setup Conditions</label>
                  <pre className="text-sm bg-muted p-3 rounded-md overflow-x-auto">
                    {JSON.stringify(setup.setup_conditions, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trades" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Associated Trades</h3>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Trade
            </Button>
          </div>
          
          {trades.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No trades associated with this setup yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Entry Date</TableHead>
                      <TableHead>Entry Price</TableHead>
                      <TableHead>Exit Price</TableHead>
                      <TableHead>P&L</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Confidence</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade) => (
                      <TableRow key={trade.trade_id}>
                        <TableCell>
                          <Badge variant={trade.trade_type === 'stock' ? 'default' : 'secondary'}>
                            {trade.trade_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{trade.symbol}</TableCell>
                        <TableCell>{new Date(trade.entry_date).toLocaleDateString()}</TableCell>
                        <TableCell>${trade.entry_price}</TableCell>
                        <TableCell>
                          {trade.exit_price ? `$${trade.exit_price}` : '-'}
                        </TableCell>
                        <TableCell className={getProfitLossColor(trade.profit_loss || 0)}>
                          {trade.profit_loss ? formatCurrency(trade.profit_loss) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={trade.status === 'closed' ? 'default' : 'outline'}>
                            {trade.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {trade.confidence_rating ? (
                            <div className="flex items-center space-x-2">
                              <span>{trade.confidence_rating}/5</span>
                              <Progress value={trade.confidence_rating * 20} className="w-16" />
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          {analytics ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Performance Metrics</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Win Rate</span>
                      <span className="font-medium">{formatPercentage(analytics.win_rate)}</span>
                    </div>
                    <Progress value={analytics.win_rate} className="w-full" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Profit Factor</span>
                      <span className="font-medium">{analytics.profit_factor.toFixed(2)}</span>
                    </div>
                    <Progress value={Math.min(analytics.profit_factor * 20, 100)} className="w-full" />
                  </div>
                  
                  <Separator />
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Avg Profit:</span>
                      <div className={`font-medium ${getProfitLossColor(analytics.avg_profit)}`}>
                        {formatCurrency(analytics.avg_profit)}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg Loss:</span>
                      <div className={`font-medium ${getProfitLossColor(-analytics.avg_loss)}`}>
                        {formatCurrency(-analytics.avg_loss)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Activity className="h-5 w-5" />
                    <span>Trade Distribution</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">By Type</h4>
                    <div className="space-y-2">
                      {Object.entries(analytics.trade_type_distribution).map(([type, count]) => (
                        <div key={type} className="flex justify-between items-center">
                          <span className="text-sm capitalize">{type}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <h4 className="text-sm font-medium mb-2">Top Symbols</h4>
                    <div className="space-y-2">
                      {Object.entries(analytics.symbol_distribution)
                        .slice(0, 5)
                        .map(([symbol, count]) => (
                          <div key={symbol} className="flex justify-between items-center">
                            <span className="text-sm font-mono">{symbol}</span>
                            <span className="font-medium">{count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No analytics available for this setup.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
} 