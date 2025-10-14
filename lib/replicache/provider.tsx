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
import { useRouter } from 'next/navigation';

interface ReplicacheContextType {
  replicache: Replicache | null;
  isLoading: boolean;
  error: Error | null;
  pull: () => Promise<void>;
  push: () => Promise<void>;
}

const ReplicacheContext = createContext<ReplicacheContextType | undefined>(
  undefined
);

export function ReplicacheProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [replicache, setReplicache] = useState<Replicache | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const pull = useCallback(async () => {
    if (replicache) {
      try {
        await replicache.pull();
        console.log('Replicache pull successful');
      } catch (e) {
        console.error('Replicache pull failed:', e);
        setError(e as Error);
      }
    }
  }, [replicache]);

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

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const initializeReplicache = async () => {
      if (!user) {
        console.log('No user, skipping Replicache initialization.');
        setReplicache(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        // Get the JWT token from Supabase
        const { data: { session }, error: sessionError } = await createClient().auth.getSession();
        
        if (sessionError || !session?.access_token) {
          throw new Error('Failed to get authentication token for Replicache.');
        }

        const rep = createReplicache(user.id, session.access_token);
        setReplicache(rep);

        // Configure sync every 5 hours
        syncIntervalRef.current = setInterval(() => {
          pull();
        }, 5 * 60 * 60 * 1000); // 5 hours

        // Sync on session expiration/logout
        const handleLogout = async () => {
          console.log('User logging out or session expiring, performing final sync...');
          await push();
          await pull(); // Ensure all local changes are pushed and latest server state is pulled
          rep.close(); // Close Replicache instance
          if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
          }
        };

        // Attach to logout/session expiration event
        window.addEventListener('beforeunload', handleLogout);
        
        // Also handle programmatic logout
        const originalSignOut = signOut;
        const enhancedSignOut = async () => {
          await handleLogout();
          await originalSignOut();
          router.push('/sign-in');
        };

        setIsLoading(false);

        return () => {
          if (syncIntervalRef.current) {
            clearInterval(syncIntervalRef.current);
          }
          window.removeEventListener('beforeunload', handleLogout);
          rep.close();
        };
      } catch (e) {
        console.error('Error initializing Replicache:', e);
        setError(e as Error);
        setIsLoading(false);
      }
    };

    initializeReplicache();
  }, [user, authLoading, pull, push, signOut, router]);

  return (
    <ReplicacheContext.Provider value={{
      replicache,
      isLoading,
      error,
      pull,
      push
    }}>
      {children}
    </ReplicacheContext.Provider>
  );
}

export function useReplicache() {
  const context = useContext(ReplicacheContext);
  if (context === undefined) {
    throw new Error('useReplicache must be used within a ReplicacheProvider');
  }
  return context;
}
