// hooks/use-calendar-connections.ts
"use client";

import { useState, useEffect, useCallback } from 'react';
import { CalendarConnection } from '@/lib/types/calendar';
import { apiClient } from '@/lib/services/api-client';
import { toast } from 'sonner';
import { SyncResult } from '@/lib/types/calendar';

export function useCalendarConnections() {
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<CalendarConnection[]>('/notebook/calendar/connections');
      
      // Handle both array and object responses
      setConnections(response);
    } catch (err) {
      console.error('Failed to fetch connections:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch connections'));
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const connectGoogle = useCallback(async () => {
    try {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      const redirectUri = `${window.location.origin}/api/auth/callback/google`;
      
      if (!clientId) {
        throw new Error('Google Client ID not configured');
      }
      
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        access_type: 'offline',
        prompt: 'consent',
      });
      
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    } catch (err) {
      console.error('Failed to initiate Google OAuth:', err);
      setError(err instanceof Error ? err : new Error('Failed to connect to Google'));
    }
  }, []);

  const disconnect = useCallback(async (connectionId: string) => {
    try {
      await apiClient.delete(`/notebook/calendar/connections/${connectionId}`);
      await fetchConnections();
    } catch (err) {
      console.error('Failed to disconnect:', err);
      throw err;
    }
  }, [fetchConnections]);

  const syncConnection = useCallback(async (connectionId: string) => {
    // Check if sync was done recently (within 5 minutes)
    const lastSyncKey = `calendar-sync-${connectionId}`;
    const lastSync = localStorage.getItem(lastSyncKey);
    const now = Date.now();
    
    if (lastSync && (now - parseInt(lastSync)) < 5 * 60 * 1000) {
      toast.info("Sync was done recently. Please wait a moment.");
      return;
    }
    
    try {
      const result = await apiClient.post<SyncResult>(`/notebook/calendar/connections/${connectionId}/sync`);
      localStorage.setItem(lastSyncKey, now.toString());
      toast.success(`Synced ${result.synced || 0} events`);
      await fetchConnections();
    } catch (err) {
      console.error('Failed to sync:', err);
      toast.error('Failed to sync calendar');
      throw err;
    }
  }, [fetchConnections]);

  return {
    connections,
    loading,
    error,
    connectGoogle,
    disconnect,
    syncConnection,
    refetch: fetchConnections,
  };
}