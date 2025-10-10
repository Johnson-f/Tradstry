'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDbOperations, getSyncService } from './index';

interface UseBrowserDatabaseReturn {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  syncStatus: {
    isOnline: boolean;
    lastSync: Date | null;
    pendingChanges: number;
  };
  manualSync: () => Promise<void>;
  operations: ReturnType<typeof getDbOperations>;
}

/**
 * React hook for browser database management
 * Handles initialization, sync, and provides database operations
 */
export function useBrowserDatabase(): UseBrowserDatabaseReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState({
    isOnline: navigator.onLine,
    lastSync: null as Date | null,
    pendingChanges: 0,
  });

  const operations = getDbOperations();
  const syncService = getSyncService();

  useEffect(() => {
    let mounted = true;

    const initializeDatabase = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get current user
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
          throw new Error('User not authenticated');
        }

        // Initialize database operations
        await operations.initialize(user.id);

        // Initialize sync service
        await syncService.initialize(user.id);

        if (mounted) {
          setIsInitialized(true);
          setSyncStatus(syncService.getSyncStatus());
        }
      } catch (err) {
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to initialize database';
          setError(errorMessage);
          console.error('Browser database initialization failed:', err);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initializeDatabase();

    // Update sync status periodically
    const statusInterval = setInterval(() => {
      if (mounted) {
        setSyncStatus(syncService.getSyncStatus());
      }
    }, 10000); // Update every 10 seconds

    return () => {
      mounted = false;
      clearInterval(statusInterval);
    };
  }, []);

  const handleManualSync = async () => {
    try {
      setError(null);
      const result = await syncService.manualSync();
      
      if (!result.success) {
        setError(result.error || 'Sync failed');
      } else {
        setSyncStatus(syncService.getSyncStatus());
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      setError(errorMessage);
    }
  };

  return {
    isInitialized,
    isLoading,
    error,
    syncStatus,
    manualSync: handleManualSync,
    operations,
  };
}
