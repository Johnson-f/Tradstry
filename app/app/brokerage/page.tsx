"use client";

import { useState } from 'react';
import { useBrokerage } from '@/lib/hooks/use-brokerage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, 
  Trash2, 
  Plus, 
  Link as LinkIcon, 
  Wallet, 
  TrendingUp, 
  Activity,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import type { ConnectBrokerageRequest } from '@/lib/types/brokerage';

export default function BrokeragePage() {
  const {
    // Connections
    connections,
    connectionsLoading,
    connectionsError,
    refetchConnections,
    
    // Initiate connection
    initiateConnection,
    initiating,
    
    // Connection status
    getConnectionStatus,
    statusLoading,
    
    // Delete connection
    deleteConnection,
    deleting,
    
    // Complete connection sync
    completeConnectionSync,
    completingSync,
    
    // Accounts
    accounts,
    accountsLoading,
    accountsError,
    refetchAccounts,
    
    // Sync accounts
    syncAccounts,
    syncing,
    
    // Transactions
    transactions,
    transactionsLoading,
    transactionsError,
    refetchTransactions,
    
    // Holdings
    holdings,
    holdingsLoading,
    holdingsError,
    refetchHoldings,
  } = useBrokerage();

  // Form state for initiating connection
  const [brokerageId, setBrokerageId] = useState('');
  const [connectionType, setConnectionType] = useState<'read' | 'trade'>('read');
  const [checkingStatusId, setCheckingStatusId] = useState<string | null>(null);
  const [completingSyncId, setCompletingSyncId] = useState<string | null>(null);

  const handleInitiateConnection = async () => {
    if (!brokerageId.trim()) {
      toast.error('Please enter a brokerage ID');
      return;
    }

    try {
      const request: ConnectBrokerageRequest = {
        brokerage_id: brokerageId,
        connection_type: connectionType,
      };
      
      console.log('Initiating connection with request:', request);
      const loadingToast = toast.loading('Initiating connection...');
      
      const response = await initiateConnection(request);
      console.log('Connection response:', response);
      
      // Open redirect URL in new window
      if (response?.redirect_url) {
        console.log('Opening redirect URL:', response.redirect_url);
        
        // Create a temporary link element and click it programmatically
        // This avoids popup blockers better than window.open() after async
        const link = document.createElement('a');
        link.href = response.redirect_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.dismiss(loadingToast);
        toast.success('Opening connection portal in new tab...');
      } else {
        console.error('No redirect_url in response:', response);
        toast.dismiss(loadingToast);
        toast.error('Connection initiated but no redirect URL received. Check console for details.');
      }
      
      // Clear form
      setBrokerageId('');
      setConnectionType('read');
      
      // Refetch connections
      refetchConnections();
    } catch (error) {
      console.error('Failed to initiate connection:', error);
      toast.error(`Failed to initiate connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCheckStatus = async (connectionId: string) => {
    setCheckingStatusId(connectionId);
    try {
      const status = await getConnectionStatus(connectionId);
      console.log('Connection status:', status);
      alert(`Status: ${status.status}`);
      refetchConnections();
    } catch (error) {
      console.error('Failed to check status:', error);
    } finally {
      setCheckingStatusId(null);
    }
  };

  const handleDeleteConnection = async (connectionId: string) => {
    if (!confirm('Are you sure you want to delete this connection?')) {
      return;
    }

    try {
      await deleteConnection(connectionId);
      refetchConnections();
      refetchAccounts();
    } catch (error) {
      console.error('Failed to delete connection:', error);
    }
  };

  const handleSyncAccounts = async () => {
    try {
      await syncAccounts();
      refetchAccounts();
      refetchTransactions();
      refetchHoldings();
    } catch (error) {
      console.error('Failed to sync accounts:', error);
    }
  };

  const handleCompleteSync = async (connectionId: string) => {
    setCompletingSyncId(connectionId);
    try {
      await completeConnectionSync(connectionId);
      refetchConnections();
      refetchAccounts();
      refetchTransactions();
      refetchHoldings();
    } catch (error) {
      console.error('Failed to complete sync:', error);
    } finally {
      setCompletingSyncId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Connected</Badge>;
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'disconnected':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Disconnected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Brokerage Test Page</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Test all brokerage functionality
        </p>
      </div>
      
      {/* Main content - Scrollable area */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8 space-y-6">
            {/* Initiate Connection Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LinkIcon className="w-5 h-5" />
                  Initiate New Connection
                </CardTitle>
                <CardDescription>
                  Connect a new brokerage account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Brokerage ID (e.g., alderaan, questrade)"
                      value={brokerageId}
                      onChange={(e) => setBrokerageId(e.target.value)}
                    />
                  </div>
                  <select
                    value={connectionType}
                    onChange={(e) => setConnectionType(e.target.value as 'read' | 'trade')}
                    className="px-3 py-2 border rounded-md"
                  >
                    <option value="read">Read Only</option>
                    <option value="trade">Trade</option>
                  </select>
                  <Button
                    onClick={handleInitiateConnection}
                    disabled={initiating || !brokerageId.trim()}
                  >
                    {initiating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Initiating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        Initiate Connection
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Connections Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <LinkIcon className="w-5 h-5" />
                      Connections
                    </CardTitle>
                    <CardDescription>
                      {connections.length} connection(s) found
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchConnections()}
                    disabled={connectionsLoading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${connectionsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {connectionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : connectionsError ? (
                  <div className="text-destructive py-4">
                    Error: {connectionsError.message}
                  </div>
                ) : connections.length === 0 ? (
                  <div className="text-muted-foreground py-4 text-center">
                    No connections found. Initiate a new connection above.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {connections.map((connection) => (
                      <div
                        key={connection.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">{connection.brokerage_name}</h3>
                            {getStatusBadge(connection.status)}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <div>ID: {connection.id}</div>
                            {connection.connection_id && (
                              <div>Connection ID: {connection.connection_id}</div>
                            )}
                            {connection.last_sync_at && (
                              <div>Last Sync: {new Date(connection.last_sync_at).toLocaleString()}</div>
                            )}
                            <div>Created: {new Date(connection.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {(connection.status === 'connected' || connection.status === 'pending') && (
                            <Button
                              size="sm"
                              onClick={() => handleCompleteSync(connection.id)}
                              disabled={completingSyncId === connection.id || completingSync}
                            >
                              {completingSyncId === connection.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Syncing...
                                </>
                              ) : (
                                <>
                                  <ArrowRight className="w-4 h-4 mr-2" />
                                  Continue
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCheckStatus(connection.id)}
                            disabled={checkingStatusId === connection.id || statusLoading}
                          >
                            {checkingStatusId === connection.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Activity className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteConnection(connection.id)}
                            disabled={deleting}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Accounts Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="w-5 h-5" />
                      Accounts
                    </CardTitle>
                    <CardDescription>
                      {accounts.length} account(s) found
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchAccounts()}
                      disabled={accountsLoading}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${accountsLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSyncAccounts}
                      disabled={syncing}
                    >
                      {syncing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Sync Accounts
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {accountsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : accountsError ? (
                  <div className="text-destructive py-4">
                    Error: {accountsError.message}
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="text-muted-foreground py-4 text-center">
                    No accounts found. Sync accounts to load them.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accounts.map((account) => (
                      <div
                        key={account.id}
                        className="p-4 border rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold">
                            {account.account_name || account.account_number || 'Unnamed Account'}
                          </h3>
                          {account.balance !== undefined && (
                            <div className="text-lg font-bold">
                              {account.balance.toLocaleString(undefined, {
                                style: 'currency',
                                currency: account.currency || 'USD',
                              })}
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>Type: {account.account_type || 'N/A'}</div>
                          <div>Institution: {account.institution_name || 'N/A'}</div>
                          {account.account_number && (
                            <div>Account #: {account.account_number}</div>
                          )}
                          <div>Created: {new Date(account.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transactions Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      Transactions
                    </CardTitle>
                    <CardDescription>
                      {transactions.length} transaction(s) found
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchTransactions()}
                    disabled={transactionsLoading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${transactionsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {transactionsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : transactionsError ? (
                  <div className="text-destructive py-4">
                    Error: {transactionsError.message}
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-muted-foreground py-4 text-center">
                    No transactions found. Sync accounts to load transactions.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transactions.slice(0, 10).map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {transaction.symbol && (
                              <span className="font-semibold">{transaction.symbol}</span>
                            )}
                            {transaction.transaction_type && (
                              <Badge variant="outline">{transaction.transaction_type}</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {transaction.quantity && (
                              <span>Qty: {transaction.quantity} </span>
                            )}
                            {transaction.price && (
                              <span>@ ${transaction.price} </span>
                            )}
                            {transaction.amount && (
                              <span className="font-semibold">
                                = {transaction.amount.toLocaleString(undefined, {
                                  style: 'currency',
                                  currency: transaction.currency || 'USD',
                                })}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(transaction.trade_date).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                    {transactions.length > 10 && (
                      <div className="text-center text-sm text-muted-foreground pt-2">
                        Showing 10 of {transactions.length} transactions
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Holdings Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      Holdings
                    </CardTitle>
                    <CardDescription>
                      {holdings.length} holding(s) found
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchHoldings()}
                    disabled={holdingsLoading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${holdingsLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {holdingsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : holdingsError ? (
                  <div className="text-destructive py-4">
                    Error: {holdingsError.message}
                  </div>
                ) : holdings.length === 0 ? (
                  <div className="text-muted-foreground py-4 text-center">
                    No holdings found. Sync accounts to load holdings.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {holdings.map((holding) => (
                      <div
                        key={holding.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-lg">{holding.symbol}</span>
                            <Badge variant="outline">
                              {holding.quantity} shares
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            {holding.average_cost && (
                              <div>Avg Cost: ${holding.average_cost.toFixed(2)}</div>
                            )}
                            {holding.current_price && (
                              <div>Current Price: ${holding.current_price.toFixed(2)}</div>
                            )}
                            {holding.market_value && (
                              <div className="font-semibold text-foreground">
                                Market Value: {holding.market_value.toLocaleString(undefined, {
                                  style: 'currency',
                                  currency: holding.currency || 'USD',
                                })}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Updated: {new Date(holding.last_updated).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
