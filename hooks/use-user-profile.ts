import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type UserProfile = {
  firstName: string;
  loading: boolean;
  error: Error | null;
  email: string;
};

export function useUserProfile(): UserProfile {
  const [profile, setProfile] = useState<{
    firstName: string;
    loading: boolean;
    error: Error | null;
    email: string;
  }>({
    firstName: '',
    loading: true,
    error: null,
    email: ''
  });

  useEffect(() => {
    async function fetchUserProfile() {
      try {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (!user || authError) {
          setProfile(prev => ({
            ...prev,
            loading: false,
            error: authError || new Error('No authenticated user')
          }));
          return;
        }

        // Get the user's email
        const userEmail = user.email || '';
        let firstName = '';
        
        // Extract first name from user metadata or email
        // Check if user has a name in user_metadata
        const userMetadata = user.user_metadata;
        if (userMetadata?.first_name) {
          firstName = userMetadata.first_name;
        } else if (userMetadata?.full_name) {
          firstName = userMetadata.full_name.split(' ')[0];
        } else if (userMetadata?.name) {
          firstName = userMetadata.name.split(' ')[0];
        }
        
        // If no first name from profile, extract from email
        if (!firstName && userEmail) {
          // Extract username part before @ and capitalize first letter
          const emailUsername = userEmail.split('@')[0];
          firstName = emailUsername.charAt(0).toUpperCase() + emailUsername.slice(1);
        }
        
        // Final fallback
        if (!firstName) {
          firstName = 'User';
        }
        
        setProfile({
          firstName,
          email: userEmail,
          loading: false,
          error: null
        });
        
      } catch (err) {
        setProfile(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err : new Error('Failed to load user data')
        }));
      }
    }

    fetchUserProfile();
  }, []);

  return profile;
}