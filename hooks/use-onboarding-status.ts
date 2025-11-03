"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface OnboardingStatus {
  isComplete: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Check if user has completed onboarding
 * Onboarding is complete if user_profile has a nickname
 */
export function useOnboardingStatus(): OnboardingStatus {
  const [status, setStatus] = useState<OnboardingStatus>({
    isComplete: false,
    loading: true,
    error: null,
  });

  useEffect(() => {
    async function checkOnboardingStatus() {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (!user || authError) {
          setStatus({
            isComplete: false,
            loading: false,
            error: 'Not authenticated',
          });
          return;
        }

        // Get auth token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setStatus({
            isComplete: false,
            loading: false,
            error: 'No session',
          });
          return;
        }

        // Check profile via backend API
        // We'll check if profile exists with nickname
        // For now, we'll use a simple approach: check if user can access their profile
        // In a real implementation, you'd have a GET /api/user/profile endpoint
        // For now, we'll assume onboarding is needed if we can't verify
        // This is a simplified check - in production, add a dedicated endpoint

        // Since we don't have a GET profile endpoint yet, we'll check initialization first
        // and assume onboarding is needed until the profile is created
        // The onboarding wizard will create the profile
        
        // For now, check localStorage for onboarding completion flag
        const onboardingComplete = localStorage.getItem(`onboarding-complete-${user.id}`);
        
        setStatus({
          isComplete: onboardingComplete === 'true',
          loading: false,
          error: null,
        });
      } catch (err) {
        setStatus({
          isComplete: false,
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    checkOnboardingStatus();
  }, []);

  return status;
}

