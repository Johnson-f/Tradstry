"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useState, useRef } from "react";
import { User } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef(createClient());
  const initialCheckDone = useRef(false);

  useEffect(() => {
    const supabase = supabaseRef.current;
    
    // CRITICAL: Check for existing session first
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Error checking session:", error);
          setUser(null);
        } else {
          setUser(session?.user ?? null);
        }
      } catch (error) {
        console.error("Session check failed:", error);
        setUser(null);
      } finally {
        setLoading(false);
        initialCheckDone.current = true;
      }
    };

    // Run initial session check
    checkSession();

    // Listen for auth changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Only update after initial check is done to avoid race conditions
        if (initialCheckDone.current) {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      }
    );

    // Cleanup subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    loading,
    isAuthenticated: !!user,
    signOut: async () => {
      setLoading(true);
      await supabaseRef.current.auth.signOut();
      setUser(null);
      setLoading(false);
    },
  };
}

export default useAuth;