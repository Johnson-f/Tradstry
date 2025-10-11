/**
 * Example component showing how to use the Journal Database operations
 * This demonstrates the integration pattern for your journal components
 */

'use client';

import { useState, useEffect } from 'react';
import { useJournalDatabase, type JournalTrade, type TradeFormData } from './index';

interface JournalExampleProps {
  userId: string;
}

export function JournalDatabaseExample({ userId }: JournalExampleProps) {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Initialize the journal database operations
  const {
    isInitialized,
    isInitializing,
    error,
    insertTrade,
    updateTrade,
    deleteTrade,
    getAllTrades,
    getTradesBySymbol,
    searchTrades,
    getStats,
    init
  } = useJournalDatabase(userId);

  // Load trades when database is ready
  useEffect(() => {
    if (isInitialized) {
      loadTrades();
    }
  }, [isInitialized]);

  const loadTrades = async () => {
    setLoading(true);
    try {
      const allTrades = await getAllTrades({
        limit: 50,
        orderBy: 'entryDate',
        orderDirection: 'desc'
      });
      setTrades(allTrades);
    } catch (err) {
      console.error('Failed to load trades:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTrade = async () => {
    try {
      const newTrade: Omit<TradeFormData, 'userId'> = {
        symbol: 'AAPL',
        assetType: 'STOCK',
        tradeType: 'BUY',
        orderType: 'MARKET',
        entryPrice: 150.00,
        stopLoss: 140.00,
        numberOfShares: 100,
        entryDate: new Date().toISOString(),
        commissions: 0.00,
        notes: 'Example trade entry'
      };

      await insertTrade(newTrade);
      await loadTrades(); // Refresh the list
    } catch (err) {
      console.error('Failed to add trade:', err);
    }
  };

  const handleCloseTrade = async (tradeId: number) => {
    try {
      await updateTrade(tradeId, {
        exitPrice: 160.00,
        exitDate: new Date().toISOString(),
        status: 'closed'
      });
      await loadTrades(); // Refresh the list
    } catch (err) {
      console.error('Failed to close trade:', err);
    }
  };

  const handleDeleteTrade = async (tradeId: number) => {
    try {
      await deleteTrade(tradeId);
      await loadTrades(); // Refresh the list
    } catch (err) {
      console.error('Failed to delete trade:', err);
    }
  };

  if (isInitializing) {
    return <div>Initializing journal database...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!isInitialized) {
    return (
      <div>
        <p>Database not initialized</p>
        <button onClick={init}>Initialize Database</button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Trading Journal</h2>
      
      <div className="mb-4 space-x-2">
        <button
          onClick={handleAddTrade}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Add Sample Trade
        </button>
        <button
          onClick={loadTrades}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh Trades'}
        </button>
      </div>

      {trades.length === 0 ? (
        <p>No trades found. Add some trades to get started!</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-300">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 border-b text-left">Symbol</th>
                <th className="px-4 py-2 border-b text-left">Type</th>
                <th className="px-4 py-2 border-b text-left">Entry Price</th>
                <th className="px-4 py-2 border-b text-left">Exit Price</th>
                <th className="px-4 py-2 border-b text-left">Shares</th>
                <th className="px-4 py-2 border-b text-left">Status</th>
                <th className="px-4 py-2 border-b text-left">Entry Date</th>
                <th className="px-4 py-2 border-b text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 border-b">{trade.symbol}</td>
                  <td className="px-4 py-2 border-b">
                    <span className={`px-2 py-1 rounded text-sm ${
                      trade.tradeType === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {trade.tradeType}
                    </span>
                  </td>
                  <td className="px-4 py-2 border-b">${trade.entryPrice}</td>
                  <td className="px-4 py-2 border-b">
                    {trade.exitPrice ? `$${trade.exitPrice}` : '-'}
                  </td>
                  <td className="px-4 py-2 border-b">{trade.numberOfShares}</td>
                  <td className="px-4 py-2 border-b">
                    <span className={`px-2 py-1 rounded text-sm ${
                      trade.status === 'open' ? 'bg-blue-100 text-blue-800' : 
                      trade.status === 'closed' ? 'bg-gray-100 text-gray-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {trade.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 border-b">
                    {new Date(trade.entryDate).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 border-b space-x-2">
                    {trade.status === 'open' && (
                      <button
                        onClick={() => handleCloseTrade(trade.id)}
                        className="px-2 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600"
                      >
                        Close
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteTrade(trade.id)}
                      className="px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Example of how to use in a parent component:
/*
'use client';

import { JournalDatabaseExample } from '@/lib/drizzle/journal/example-usage';
import { useAuth } from '@/hooks/use-auth'; // Your auth hook

export function JournalPage() {
  const { user } = useAuth();

  if (!user) {
    return <div>Please log in to access your trading journal.</div>;
  }

  return <JournalDatabaseExample userId={user.id} />;
}
*/
