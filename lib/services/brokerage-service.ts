import { apiConfig, getFullUrl } from '@/lib/config/api';
import { createClient } from '@/lib/supabase/client';
import type {
  ConnectBrokerageRequest,
  ConnectBrokerageResponse,
  BrokerageConnection,
  BrokerageAccount,
  BrokerageTransaction,
  BrokerageHolding,
  SyncSummary,
  ConnectionStatusResponse,
  GetTransactionsQuery,
  GetHoldingsQuery,
  ApiResponse,
} from '@/lib/types/brokerage';

/**
 * Brokerage Service
 * Handles all brokerage API calls to the Rust backend
 */
export class BrokerageService {
  private baseURL: string;
  private supabase;

  constructor() {
    this.baseURL = apiConfig.baseURL + apiConfig.apiPrefix;
    this.supabase = createClient();
  }

  /**
   * Get authentication token
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      return session?.access_token || null;
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  /**
   * Initiate brokerage connection
   */
  async initiateConnection(
    request: ConnectBrokerageRequest
  ): Promise<ConnectBrokerageResponse> {
    const url = getFullUrl(apiConfig.endpoints.brokerage.connections.initiate);
    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as ApiResponse<unknown>).message ||
          `Failed to initiate connection: ${response.statusText}`
      );
    }

    const result: ApiResponse<ConnectBrokerageResponse> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to initiate connection');
    }

    return result.data;
  }

  /**
   * List all brokerage connections
   */
  async listConnections(): Promise<BrokerageConnection[]> {
    const url = getFullUrl(apiConfig.endpoints.brokerage.connections.base);
    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as ApiResponse<unknown>).message ||
          `Failed to list connections: ${response.statusText}`
      );
    }

    const result: ApiResponse<BrokerageConnection[]> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to list connections');
    }

    return result.data;
  }

  /**
   * Get connection status
   */
  async getConnectionStatus(
    connectionId: string
  ): Promise<ConnectionStatusResponse> {
    const url = getFullUrl(
      apiConfig.endpoints.brokerage.connections.status(connectionId)
    );
    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as ApiResponse<unknown>).message ||
          `Failed to get connection status: ${response.statusText}`
      );
    }

    const result: ApiResponse<ConnectionStatusResponse> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to get connection status');
    }

    return result.data;
  }

  /**
   * Delete brokerage connection
   */
  async deleteConnection(connectionId: string): Promise<void> {
    const url = getFullUrl(
      apiConfig.endpoints.brokerage.connections.byId(connectionId)
    );
    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as ApiResponse<unknown>).message ||
          `Failed to delete connection: ${response.statusText}`
      );
    }

    const result: ApiResponse<unknown> = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to delete connection');
    }
  }

  /**
   * List all brokerage accounts
   */
  async listAccounts(): Promise<BrokerageAccount[]> {
    const url = getFullUrl(apiConfig.endpoints.brokerage.accounts.base);
    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as ApiResponse<unknown>).message ||
          `Failed to list accounts: ${response.statusText}`
      );
    }

    const result: ApiResponse<BrokerageAccount[]> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to list accounts');
    }

    return result.data;
  }

  /**
   * Sync accounts from brokerage
   */
  async syncAccounts(): Promise<SyncSummary> {
    const url = getFullUrl(apiConfig.endpoints.brokerage.accounts.sync);
    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as ApiResponse<unknown>).message ||
          `Failed to sync accounts: ${response.statusText}`
      );
    }

    const result: ApiResponse<SyncSummary> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to sync accounts');
    }

    return result.data;
  }

  /**
   * Get transactions
   */
  async getTransactions(
    query?: GetTransactionsQuery
  ): Promise<BrokerageTransaction[]> {
    const url = new URL(
      getFullUrl(apiConfig.endpoints.brokerage.transactions.base)
    );

    if (query?.account_id) {
      url.searchParams.append('account_id', query.account_id);
    }

    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as ApiResponse<unknown>).message ||
          `Failed to get transactions: ${response.statusText}`
      );
    }

    const result: ApiResponse<BrokerageTransaction[]> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to get transactions');
    }

    return result.data;
  }

  /**
   * Get holdings
   */
  async getHoldings(query?: GetHoldingsQuery): Promise<BrokerageHolding[]> {
    const url = new URL(
      getFullUrl(apiConfig.endpoints.brokerage.holdings.base)
    );

    if (query?.account_id) {
      url.searchParams.append('account_id', query.account_id);
    }

    const token = await this.getAuthToken();

    if (!token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        (errorData as ApiResponse<unknown>).message ||
          `Failed to get holdings: ${response.statusText}`
      );
    }

    const result: ApiResponse<BrokerageHolding[]> = await response.json();

    if (!result.success || !result.data) {
      throw new Error(result.message || 'Failed to get holdings');
    }

    return result.data;
  }
}

// Export singleton instance
export const brokerageService = new BrokerageService();

