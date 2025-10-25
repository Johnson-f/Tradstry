import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, BarChart2, List, TrendingUp } from 'lucide-react';
import { setupsService } from '@/lib/services/setups-service';
import { SetupSummary, SetupInDB } from '@/lib/types/setups';

export function SetupTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setups, setSetups] = useState<SetupSummary[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedSetup, setSelectedSetup] = useState<SetupInDB | null>(null);
  const [setupDetails, setSetupDetails] = useState<Record<number, unknown>>({});

  useEffect(() => {
    const fetchSetups = async () => {
      try {
        setLoading(true);
        const data = await setupsService.getSetupSummaries();
        setSetups(data);
        
        // Fetch details for each setup
        const details: Record<number, unknown> = {};
        for (const setup of data) {
          try {
            const performance = await setupsService.getSetupPerformance(setup.id);
            details[setup.id] = performance;
          } catch (err) {
            console.error(`Error fetching details for setup ${setup.id}:`, err);
          }
        }
        setSetupDetails(details);
      } catch (err) {
        console.error('Error fetching setups:', err);
        setError('Failed to load setup data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchSetups();
  }, []);

  const handleSetupSelect = async (setupId: number) => {
    try {
      const details = await setupsService.getSetup(setupId);
      setSelectedSetup(details);
      setActiveTab('details');
    } catch (err) {
      console.error('Error fetching setup details:', err);
      setError('Failed to load setup details.');
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const renderSetupCard = (setup: SetupSummary) => {
    const details = setupDetails[setup.id];
    const winRate = details?.winRate || 0;
    const profitFactor = details?.profitFactor || 0;
    const totalTrades = details?.totalTrades || 0;

    return (
      <Card 
        key={setup.id} 
        className="cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => handleSetupSelect(setup.id)}
      >
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-lg">{setup.name}</CardTitle>
              <CardDescription className="text-sm">{setup.category}</CardDescription>
            </div>
            <div className="text-xs text-muted-foreground">
              {setup.tags.map(tag => `#${tag}`).join(' ')}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Win Rate</span>
                <span className="font-medium">{winRate.toFixed(1)}%</span>
              </div>
              <Progress value={winRate} className="h-2" />
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Profit Factor</div>
                <div className={`font-medium ${
                  profitFactor > 1.5 ? 'text-green-600' : 
                  profitFactor > 1 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {profitFactor.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Total Trades</div>
                <div className="font-medium">{totalTrades}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderSetupDetails = () => {
    if (!selectedSetup) return null;
    
    const details = setupDetails[selectedSetup.id] || {};
    const winRate = details.winRate || 0;
    const profitFactor = details.profitFactor || 0;
    const avgProfit = details.avgProfit || 0;
    const avgLoss = details.avgLoss || 0;
    const totalTrades = details.totalTrades || 0;
    const winLossRatio = winRate / (100 - winRate) || 0;

    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{selectedSetup.name}</CardTitle>
              <CardDescription>{selectedSetup.description}</CardDescription>
            </div>
            <div className="flex gap-2">
              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                {selectedSetup.category}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Performance Metrics */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-4">Performance Metrics</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Win Rate</span>
                      <span className="font-medium">{winRate.toFixed(1)}%</span>
                    </div>
                    <Progress value={winRate} className="h-2" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Profit Factor</div>
                      <div className={`text-xl font-semibold ${
                        profitFactor > 1.5 ? 'text-green-600' : 
                        profitFactor > 1 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {profitFactor.toFixed(2)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">Win/Loss Ratio</div>
                      <div className="text-xl font-semibold">{winLossRatio.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-4">Trade Statistics</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Total Trades</div>
                    <div className="text-xl font-semibold">{totalTrades}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Avg. Profit</div>
                    <div className="text-xl font-semibold text-green-600">
                      {formatCurrency(avgProfit)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Avg. Loss</div>
                    <div className="text-xl font-semibold text-red-600">
                      {formatCurrency(avgLoss)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Expectancy</div>
                    <div className={`text-xl font-semibold ${
                      (winRate * avgProfit - (100 - winRate) * Math.abs(avgLoss)) >= 0 ? 
                      'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency((winRate * avgProfit - (100 - winRate) * Math.abs(avgLoss)) / 100)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Setup Details */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Description</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedSetup.description || 'No description provided.'}
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedSetup.tags.length > 0 ? (
                    selectedSetup.tags.map((tag, index) => (
                      <span 
                        key={index}
                        className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700"
                      >
                        {tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No tags</span>
                  )}
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-medium mb-2">Last Updated</h3>
                <p className="text-sm text-muted-foreground">
                  {new Date(selectedSetup.updated_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2 mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="m-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Trading Setups</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            <span>Overview</span>
          </TabsTrigger>
          {selectedSetup && (
            <TabsTrigger value="details" className="flex items-center gap-2">
              <BarChart2 className="h-4 w-4" />
              <span>Setup Details</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {setups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {setups.map(renderSetupCard)}
            </div>
          ) : (
            <div className="text-center py-12">
              <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No setups found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Get started by creating a new trading setup.
              </p>
            </div>
          )}
        </TabsContent>

        {selectedSetup && (
          <TabsContent value="details">
            <div className="space-y-4">
              <button
                onClick={() => setActiveTab('overview')}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 mb-4"
              >
                ← Back to all setups
              </button>
              {renderSetupDetails()}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
