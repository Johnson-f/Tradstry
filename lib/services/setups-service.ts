import { apiClient } from './api-client';
import {
  SetupCreate,
  SetupUpdate,
  SetupInDB,
  TradeSetupCreate,
  SetupAnalytics,
  TradeBySetup,
  SetupSummary,
  SetupCategory,
  SetupTradeAssociation,
} from '@/lib/types/setups';

export class SetupsService {
  

  // Create a new setup
  async createSetup(setup: SetupCreate): Promise<SetupInDB> {
    try {
      const response = await apiClient.post<SetupInDB>('/setups/', setup);
      return response;
    } catch (error) {
      console.error('Error creating setup:', error);
      throw error;
    }
  }

  // Get all setups with optional filtering
  async getSetups(
    category?: SetupCategory,
    isActive?: boolean
  ): Promise<SetupInDB[]> {
    try {
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      if (isActive !== undefined) params.append('is_active', isActive.toString());

      const url = `/setups/${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await apiClient.get<SetupInDB[]>(url);
      return response;
    } catch (error) {
      console.error('Error fetching setups:', error);
      throw error;
    }
  }

  // Get a specific setup by ID
  async getSetup(setupId: number): Promise<SetupInDB> {
    try {
      const response = await apiClient.get<SetupInDB>(`/setups/${setupId}`);
      return response;
    } catch (error) {
      console.error('Error fetching setup:', error);
      throw error;
    }
  }

  // Update an existing setup
  async updateSetup(setupId: number, updates: SetupUpdate): Promise<SetupInDB> {
    try {
      const response = await apiClient.put<SetupInDB>(`/setups/${setupId}`, updates);
      return response;
    } catch (error) {
      console.error('Error updating setup:', error);
      throw error;
    }
  }

  // Delete a setup
  async deleteSetup(setupId: number): Promise<void> {
    try {
      await apiClient.delete(`/setups/${setupId}`);
    } catch (error) {
      console.error('Error deleting setup:', error);
      throw error;
    }
  }

  // Add a trade to a setup
  async addTradeToSetup(tradeSetup: TradeSetupCreate): Promise<number> {
    try {
      const response = await apiClient.post<number>('/setups/trades', tradeSetup);
      return response;
    } catch (error) {
      console.error('Error adding trade to setup:', error);
      throw error;
    }
  }

  // Remove a trade from a setup
  async removeTradeFromSetup(
    tradeType: 'stock' | 'option',
    tradeId: number,
    setupId: number
  ): Promise<void> {
    try {
      await apiClient.delete(`/setups/trades/${tradeType}/${tradeId}/${setupId}`);
    } catch (error) {
      console.error('Error removing trade from setup:', error);
      throw error;
    }
  }

  // Get trades for a specific setup
  async getSetupTrades(
    setupId: number,
    status?: 'open' | 'closed',
    limit: number = 100,
    offset: number = 0
  ): Promise<TradeBySetup[]> {
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      params.append('limit', limit.toString());
      params.append('offset', offset.toString());

      const url = `/setups/${setupId}/trades?${params.toString()}`;
      const response = await apiClient.get<TradeBySetup[]>(url);
      return response;
    } catch (error) {
      console.error('Error fetching setup trades:', error);
      throw error;
    }
  }

  // Get analytics for a specific setup
  async getSetupAnalytics(
    setupId: number,
    startDate?: string,
    endDate?: string
  ): Promise<SetupAnalytics> {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const url = `/setups/${setupId}/analytics${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await apiClient.get<SetupAnalytics>(url);
      return response;
    } catch (error) {
      console.error('Error fetching setup analytics:', error);
      throw error;
    }
  }

  // Get summary information for all setups
  async getSetupSummaries(): Promise<SetupSummary[]> {
    try {
      const response = await apiClient.get<SetupSummary[]>('/setups/summary/all');
      return response;
    } catch (error) {
      console.error('Error fetching setup summaries:', error);
      throw error;
    }
  }

  // Search setups by name or description
  async searchSetups(query: string): Promise<SetupInDB[]> {
    try {
      // This would need to be implemented on the backend
      // For now, we'll filter client-side
      const allSetups = await this.getSetups();
      const searchTerm = query.toLowerCase();
      
      return allSetups.filter(setup => 
        setup.name.toLowerCase().includes(searchTerm) ||
        setup.description?.toLowerCase().includes(searchTerm) ||
        setup.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    } catch (error) {
      console.error('Error searching setups:', error);
      throw error;
    }
  }

  // Get setups by category
  async getSetupsByCategory(category: SetupCategory): Promise<SetupInDB[]> {
    try {
      return await this.getSetups(category);
    } catch (error) {
      console.error('Error fetching setups by category:', error);
      throw error;
    }
  }

  // Get active setups only
  async getActiveSetups(): Promise<SetupInDB[]> {
    try {
      return await this.getSetups(undefined, true);
    } catch (error) {
      console.error('Error fetching active setups:', error);
      throw error;
    }
  }

  // Get setup performance metrics
  async getSetupPerformance(setupId: number): Promise<{
    totalTrades: number;
    winRate: number;
    avgProfit: number;
    avgLoss: number;
    profitFactor: number;
  }> {
    try {
      const analytics = await this.getSetupAnalytics(setupId);
      return {
        totalTrades: analytics.total_trades,
        winRate: analytics.win_rate,
        avgProfit: analytics.avg_profit,
        avgLoss: analytics.avg_loss,
        profitFactor: analytics.profit_factor,
      };
    } catch (error) {
      console.error('Error fetching setup performance:', error);
      throw error;
    }
  }

  // Add a setup to an existing stock trade
  async addSetupToStock(
    stockId: number,
    setupId: number,
    confidenceRating?: number,
    notes?: string
  ): Promise<number> {
    try {
      const params = new URLSearchParams();
      if (confidenceRating) params.append('confidence_rating', confidenceRating.toString());
      if (notes) params.append('notes', notes);

      const url = `/setups/stocks/${stockId}/setups/${setupId}${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await apiClient.post<number>(url);
      return response;
    } catch (error) {
      console.error('Error adding setup to stock:', error);
      throw error;
    }
  }

  // Add a setup to an existing option trade
  async addSetupToOption(
    optionId: number,
    setupId: number,
    confidenceRating?: number,
    notes?: string
  ): Promise<number> {
    try {
      const params = new URLSearchParams();
      if (confidenceRating) params.append('confidence_rating', confidenceRating.toString());
      if (notes) params.append('notes', notes);

      const url = `/setups/options/${optionId}/setups/${setupId}${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await apiClient.post<number>(url);
      return response;
    } catch (error) {
      console.error('Error adding setup to option:', error);
      throw error;
    }
  }

  // Get all setups for a specific stock trade
  async getSetupsForStock(stockId: number): Promise<SetupTradeAssociation[]> {
    try {
      const response = await apiClient.get<SetupTradeAssociation[]>(`/setups/stocks/${stockId}/setups`);
      return response;
    } catch (error) {
      console.error('Error fetching setups for stock:', error);
      throw error;
    }
  }

  // Get all setups for a specific option trade
  async getSetupsForOption(optionId: number): Promise<SetupTradeAssociation[]> {
    try {
      const response = await apiClient.get<SetupTradeAssociation[]>(`/setups/options/${optionId}/setups`);
      return response;
    } catch (error) {
      console.error('Error fetching setups for option:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const setupsService = new SetupsService(); 