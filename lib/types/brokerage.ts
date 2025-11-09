// =====================================================
// Brokerage Types (from backend/src/routes/brokerage.rs)
// =====================================================

/**
 * API Response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

/**
 * Request to initiate brokerage connection
 */
export interface ConnectBrokerageRequest {
  brokerage_id: string;
  connection_type?: 'read' | 'trade';
  redirect_uri?: string;
}

/**
 * Response from initiating brokerage connection
 */
export interface ConnectBrokerageResponse {
  redirect_url: string;
  connection_id: string;
}

/**
 * Brokerage connection status
 */
export type ConnectionStatus = 'pending' | 'connected' | 'disconnected' | 'error';

/**
 * Brokerage connection
 */
export interface BrokerageConnection {
  id: string;
  connection_id?: string;
  brokerage_name: string;
  status: ConnectionStatus;
  last_sync_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Sync accounts response
 */
export interface SyncAccountsResponse {
  accounts: unknown[];
  holdings: unknown[];
  transactions: unknown[];
}

/**
 * Sync summary
 */
export interface SyncSummary {
  accounts_synced: number;
  holdings_synced: number;
  transactions_synced: number;
  last_sync_at: string;
}

/**
 * Brokerage account
 */
export interface BrokerageAccount {
  id: string;
  connection_id: string;
  snaptrade_account_id: string;
  account_number?: string;
  account_name?: string;
  account_type?: string;
  balance?: number;
  currency?: string;
  institution_name?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Brokerage transaction
 */
export interface BrokerageTransaction {
  id: string;
  account_id: string;
  snaptrade_transaction_id: string;
  symbol?: string;
  transaction_type?: string;
  quantity?: number;
  price?: number;
  amount?: number;
  currency?: string;
  trade_date: string;
  settlement_date?: string;
  fees?: number;
  created_at: string;
}

/**
 * Brokerage holding
 */
export interface BrokerageHolding {
  id: string;
  account_id: string;
  symbol: string;
  quantity: number;
  average_cost?: number;
  current_price?: number;
  market_value?: number;
  currency?: string;
  last_updated: string;
}

/**
 * Query parameters for transactions
 */
export interface GetTransactionsQuery {
  account_id?: string;
}

/**
 * Query parameters for holdings
 */
export interface GetHoldingsQuery {
  account_id?: string;
}

/**
 * Connection status response (from SnapTrade)
 */
export interface ConnectionStatusResponse {
  status: string;
  [key: string]: unknown;
}

// =====================================================
// Hook Return Types
// =====================================================

/**
 * Return type for useBrokerageConnections hook
 */
export interface UseBrokerageConnectionsReturn {
  connections: BrokerageConnection[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Return type for useBrokerageAccounts hook
 */
export interface UseBrokerageAccountsReturn {
  accounts: BrokerageAccount[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Return type for useBrokerageTransactions hook
 */
export interface UseBrokerageTransactionsReturn {
  transactions: BrokerageTransaction[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Return type for useBrokerageHoldings hook
 */
export interface UseBrokerageHoldingsReturn {
  holdings: BrokerageHolding[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Return type for useBrokerage hook (main hook)
 */
export interface UseBrokerageReturn {
  // Connections
  connections: BrokerageConnection[];
  connectionsLoading: boolean;
  connectionsError: Error | null;
  refetchConnections: () => void;
  
  // Initiate connection
  initiateConnection: (request: ConnectBrokerageRequest) => Promise<ConnectBrokerageResponse>;
  initiating: boolean;
  
  // Connection status
  getConnectionStatus: (connectionId: string) => Promise<ConnectionStatusResponse>;
  statusLoading: boolean;
  
  // Delete connection
  deleteConnection: (connectionId: string) => Promise<void>;
  deleting: boolean;
  
  // Complete connection sync
  completeConnectionSync: (connectionId: string) => Promise<SyncSummary>;
  completingSync: boolean;
  
  // Accounts
  accounts: BrokerageAccount[];
  accountsLoading: boolean;
  accountsError: Error | null;
  refetchAccounts: () => void;
  
  // Sync accounts
  syncAccounts: () => Promise<SyncSummary>;
  syncing: boolean;
  
  // Transactions
  transactions: BrokerageTransaction[];
  transactionsLoading: boolean;
  transactionsError: Error | null;
  refetchTransactions: (query?: GetTransactionsQuery) => void;
  
  // Holdings
  holdings: BrokerageHolding[];
  holdingsLoading: boolean;
  holdingsError: Error | null;
  refetchHoldings: (query?: GetHoldingsQuery) => void;
}

