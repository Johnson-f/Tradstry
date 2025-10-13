/**
 * Example usage of Playbook Database Operations
 * This file demonstrates how to use the playbook functionality
 */

import { usePlaybookDatabase } from '@/lib/drizzle/playbook';
import type { PlaybookFormData, TagTradeRequest } from '@/lib/drizzle/playbook';

// Example React component using playbook operations
export function PlaybookExample() {
  const userId = 'user-123'; // In real app, get from auth context
  const {
    // Database state
    isInitialized,
    isInitializing,
    error,
    
    // Playbook operations
    createPlaybook,
    getAllPlaybooks,
    getPlaybookById,
    updatePlaybook,
    deletePlaybook,
    searchPlaybooks,
    
    // Trade tagging operations
    tagTrade,
    untagTrade,
    
    // Association queries
    getPlaybooksForTrade,
    getTradesForPlaybook,
    
    // Statistics
    getPlaybookStats,
    getPlaybooksWithUsage,
  } = usePlaybookDatabase(userId);

  // Example: Create a new playbook
  const handleCreatePlaybook = async () => {
    try {
      const playbookData: PlaybookFormData = {
        name: 'Bull Flag Breakout',
        description: 'A classic bullish continuation pattern'
      };
      
      const newPlaybook = await createPlaybook(playbookData);
      console.log('Created playbook:', newPlaybook);
    } catch (error) {
      console.error('Failed to create playbook:', error);
    }
  };

  // Example: Tag a trade with a playbook
  const handleTagTrade = async () => {
    try {
      const tagRequest: TagTradeRequest = {
        tradeId: 123,
        tradeType: 'stock',
        setupId: 'playbook-uuid-here'
      };
      
      const association = await tagTrade(tagRequest);
      console.log('Tagged trade:', association);
    } catch (error) {
      console.error('Failed to tag trade:', error);
    }
  };

  // Example: Get playbooks for a trade
  const handleGetPlaybooksForTrade = async () => {
    try {
      const playbooks = await getPlaybooksForTrade(123, 'stock');
      console.log('Playbooks for trade:', playbooks);
    } catch (error) {
      console.error('Failed to get playbooks for trade:', error);
    }
  };

  // Example: Get playbook statistics
  const handleGetStats = async () => {
    try {
      const stats = await getPlaybookStats();
      console.log('Playbook stats:', stats);
    } catch (error) {
      console.error('Failed to get stats:', error);
    }
  };

  if (isInitializing) {
    return <div>Initializing playbook database...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!isInitialized) {
    return <div>Database not initialized</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Playbook Management</h2>
      
      <div className="space-x-2">
        <button 
          onClick={handleCreatePlaybook}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Create Playbook
        </button>
        
        <button 
          onClick={handleTagTrade}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          Tag Trade
        </button>
        
        <button 
          onClick={handleGetPlaybooksForTrade}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
        >
          Get Trade Playbooks
        </button>
        
        <button 
          onClick={handleGetStats}
          className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600"
        >
          Get Stats
        </button>
      </div>
    </div>
  );
}

// Example: Custom hook for playbook management
export function usePlaybookManager(userId: string) {
  const playbookDb = usePlaybookDatabase(userId);

  const createPlaybookSetup = async (name: string, description?: string) => {
    return playbookDb.createPlaybook({ name, description });
  };

  const tagStockWithPlaybook = async (stockId: number, playbookId: string) => {
    return playbookDb.tagStockTrade(stockId, playbookId);
  };

  const tagOptionWithPlaybook = async (optionId: number, playbookId: string) => {
    return playbookDb.tagOptionTrade(optionId, playbookId);
  };

  const getTradeAnalysis = async (tradeId: number, tradeType: 'stock' | 'option') => {
    const playbooks = await playbookDb.getPlaybooksForTrade(tradeId, tradeType);
    const stats = await playbookDb.getPlaybookStats();
    
    return {
      tradePlaybooks: playbooks,
      totalPlaybooks: stats.totalPlaybooks,
      mostUsedPlaybook: stats.mostUsedPlaybook
    };
  };

  return {
    ...playbookDb,
    createPlaybookSetup,
    tagStockWithPlaybook,
    tagOptionWithPlaybook,
    getTradeAnalysis,
  };
}
