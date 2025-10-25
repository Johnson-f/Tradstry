'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { Replicache } from 'replicache';
import { createReplicache } from './config';
import { useAuth } from '@/lib/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { initializeUser } from '@/lib/services/user-service';

interface ReplicacheContextType {
  rep: Replicache | null; // Alias for consistency with hooks
  replicache: Replicache | null;
  isLoading: boolean;
  isInitialized: boolean; // Add this for hooks
  error: Error | null;
  pull: () => Promise<void>;
  push: () => Promise<void>;
  isInitializing: boolean;
}

const ReplicacheContext = createContext<ReplicacheContextType | undefined>(
  undefined
);

export function ReplicacheProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const [replicache, setReplicache] = useState<Replicache | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initializationAttemptsRef = useRef(0);
  const maxRetries = 5;
  
  // Track initialization state per user to prevent re-initialization
  const initializedUsersRef = useRef<Set<string>>(new Set());
  const initializationPromiseRef = useRef<Promise<void> | null>(null);

  // Ensure we only run client-side code after mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const pullWithRetry = useCallback(async (rep: Replicache, retryCount = 0): Promise<void> => {
    try {
      console.log(`Attempting Replicache pull (attempt ${retryCount + 1}/${maxRetries})`);
      await rep.pull();
      console.log('Replicache pull successful');
      initializationAttemptsRef.current = 0; // Reset on success
    } catch (e) {
      console.error(`Replicache pull failed (attempt ${retryCount + 1}):`, e);
      
      if (retryCount < maxRetries - 1) {
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        console.log(`Retrying pull in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return pullWithRetry(rep, retryCount + 1);
      } else {
        initializationAttemptsRef.current = retryCount + 1;
        throw e;
      }
    }
  }, [maxRetries]);

  const pull = useCallback(async () => {
    if (replicache) {
      try {
        await pullWithRetry(replicache);
      } catch (e) {
        console.error('Replicache pull failed after all retries:', e);
        setError(e as Error);
      }
    }
  }, [replicache, pullWithRetry]);

  const push = useCallback(async () => {
    if (replicache) {
      try {
        await replicache.push();
        console.log('Replicache push successful');
      } catch (e) {
        console.error('Replicache push failed:', e);
        setError(e as Error);
      }
    }
  }, [replicache]);

  // Cleanup function to properly close Replicache and clear state
  const cleanupRef = useRef<(() => void) | null>(null);
  cleanupRef.current = () => {
    console.log('Cleaning up Replicache instance...');
    if (replicache) {
      replicache.close();
    }
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }
    setReplicache(null);
    setIsInitialized(false);
    setIsLoading(false);
    setIsInitializing(false);
    setError(null);
    initializationPromiseRef.current = null;
  };

  // Handle user changes (login/logout)
  useEffect(() => {
    // If not mounted yet or auth is still loading, don't do anything
    if (!isMounted || authLoading) {
      return;
    }

    // If no user (logged out), cleanup and return
    if (!user) {
      console.log('No user detected, cleaning up Replicache...');
      cleanupRef.current?.();
      initializedUsersRef.current.clear();
      return;
    }

    // If user exists but we already initialized for this user, skip
    if (initializedUsersRef.current.has(user.id)) {
      console.log(`User ${user.id} already initialized, skipping...`);
      return;
    }

    // If we're already initializing, skip
    if (initializationPromiseRef.current) {
      console.log('Initialization already in progress, skipping...');
      return;
    }

    // Start initialization for this user
    const initializeReplicache = async () => {
      console.log(`Starting Replicache initialization for user ${user.id}...`);
      
      setIsLoading(true);
      setIsInitializing(true);
      setError(null);
      
      try {
        // Step 1: Get the JWT token from Supabase
        const { data: { session }, error: sessionError } = await createClient().auth.getSession();
        
        if (sessionError || !session?.access_token) {
          throw new Error('Failed to get authentication token for Replicache.');
        }

        console.log('Step 1: Authentication token obtained');

        // Step 2: Initialize user (call /user/initialize endpoint) - ONLY ONCE
        console.log('Step 2: Calling /user/initialize endpoint...');
        if (!user.email) {
          throw new Error('User email is required for initialization');
        }
        
        const initResult = await initializeUser(user.email, user.id);
        
        if (!initResult.success) {
          throw new Error(`User initialization failed: ${initResult.message}`);
        }
        
        console.log('Step 2: User initialization completed successfully');

        // Step 3: Create Replicache instance
        console.log('Step 3: Creating Replicache instance...');
        const rep = createReplicache(user.id, session.access_token);
        setReplicache(rep);
        
        console.log('Step 3: Replicache instance created');

        // Step 4: Initial pull from backend (with retry logic) - ONLY ONCE
        console.log('Step 4: Performing initial pull from backend...');
        await pullWithRetry(rep);
        
        console.log('Step 4: Initial pull completed successfully');

        // Mark this user as initialized
        initializedUsersRef.current.add(user.id);
        setIsInitialized(true);
        console.log(`Replicache initialization sequence completed for user ${user.id}`);
        
      } catch (e) {
        console.error('Error in Replicache initialization sequence:', e);
        setError(e as Error);
        // Don't mark as initialized if there was an error
      } finally {
        setIsLoading(false);
        setIsInitializing(false);
        initializationPromiseRef.current = null;
      }
    };

    // Store the promise to prevent concurrent initializations
    initializationPromiseRef.current = initializeReplicache();
  }, [user, authLoading, pullWithRetry, isMounted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  return (
    <ReplicacheContext.Provider value={{
      rep: replicache, // Alias for hooks
      replicache,
      isLoading,
      isInitialized,
      error,
      pull,
      push,
      isInitializing
    }}>
      {children}
    </ReplicacheContext.Provider>
  );
}

export function useReplicache() {
  const context = useContext(ReplicacheContext);
  
  // During SSR, context might be undefined, so provide safe defaults
  if (context === undefined) {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
      // SSR - return safe defaults
      return {
        rep: null,
        replicache: null,
        isLoading: true,
        isInitialized: false,
        error: null,
        pull: async () => {},
        isInitializing: false,
      };
    }
    // Client-side but no provider - this is an error
    throw new Error('useReplicache must be used within a ReplicacheProvider');
  }
  return context;
}
