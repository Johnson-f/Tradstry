'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Replicache } from 'replicache';
import { REPLICACHE_CONFIG } from './config';
import { registerMutators } from './mutators';

interface ReplicacheContextType {
  rep: Replicache | null;
  isInitialized: boolean;
  isOnline: boolean;
}

const ReplicacheContext = createContext<ReplicacheContextType>({
  rep: null,
  isInitialized: false,
  isOnline: true,
});

export function ReplicacheProvider({ 
  children, 
  userId 
}: { 
  children: React.ReactNode; 
  userId: string;
}) {
  const [rep, setRep] = useState<Replicache | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const initReplicache = async () => {
      const replicache = new Replicache({
        name: `${REPLICACHE_CONFIG.name}-${userId}`,
        licenseKey: REPLICACHE_CONFIG.licenseKey,
        pushURL: REPLICACHE_CONFIG.pushURL,
        pullURL: REPLICACHE_CONFIG.pullURL,
        mutators: registerMutators(),
      });

      setRep(replicache);
      setIsInitialized(true);

      // Initial pull
      await replicache.pull();

      // Setup 5-hour sync interval
      syncIntervalRef.current = setInterval(() => {
        replicache.pull();
        replicache.push();
      }, REPLICACHE_CONFIG.syncInterval);

      // Online/offline detection
      window.addEventListener('online', () => {
        setIsOnline(true);
        replicache.pull();
      });
      
      window.addEventListener('offline', () => {
        setIsOnline(false);
      });
    };

    initReplicache();

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      rep?.close();
    };
  }, [userId]);

  // Sync on logout/session expiry
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (rep) {
        await rep.push();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [rep]);

  return (
    <ReplicacheContext.Provider value={{ rep, isInitialized, isOnline }}>
      {children}
    </ReplicacheContext.Provider>
  );
}

export const useReplicache = () => useContext(ReplicacheContext);
