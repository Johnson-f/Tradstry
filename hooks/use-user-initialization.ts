'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { initializeUser } from '@/lib/services/user-service';

interface UserInitializationState {
  isInitialized: boolean;
  isInitializing: boolean;
  error: string | null;
}

/**
 * Hook to handle user initialization after login
 * This runs once when the user first accesses the protected app
 */
export function useUserInitialization() {
  const [state, setState] = useState<UserInitializationState>({
    isInitialized: false,
    isInitializing: false,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    const initializeUserOnLogin = async () => {
      const supabase = createClient();
      
      try {
        // Get current user session
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          console.log('No authenticated user found');
          return;
        }

        // Check if we've already tried to initialize this user in this session
        const initKey = `user-initialized-${user.id}`;
        const alreadyInitialized = sessionStorage.getItem(initKey);
        
        if (alreadyInitialized) {
          if (mounted) {
            setState({
              isInitialized: true,
              isInitializing: false,
              error: null,
            });
          }
          return;
        }

        // Set initializing state
        if (mounted) {
          setState(prev => ({
            ...prev,
            isInitializing: true,
            error: null,
          }));
        }

        console.log('Initializing user in backend...', { 
          email: user.email, 
          userId: user.id 
        });

        // Initialize user in backend
        const initResult = await initializeUser(user.email!, user.id);
        
        if (mounted) {
          if (initResult.success) {
            console.log('User successfully initialized in backend');
            // Mark as initialized in session storage
            sessionStorage.setItem(initKey, 'true');
            setState({
              isInitialized: true,
              isInitializing: false,
              error: null,
            });
          } else {
            console.warn('User initialization failed:', initResult.message);
            setState({
              isInitialized: false,
              isInitializing: false,
              error: initResult.message || 'Initialization failed',
            });
          }
        }
      } catch (error) {
        console.error('User initialization error:', error);
        if (mounted) {
          setState({
            isInitialized: false,
            isInitializing: false,
            error: error instanceof Error ? error.message : 'Unknown initialization error',
          });
        }
      }
    };

    // Run initialization
    initializeUserOnLogin();

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
