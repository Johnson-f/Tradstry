"use client";

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/services/api-client';

export interface PublicHoliday {
  id: string;
  country_code: string;
  holiday_name: string;
  holiday_date: string;
  is_national: boolean;
  description?: string;
}

export function usePublicHolidays(startDate: string, endDate: string, countryCode?: string) {
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchHolidays = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get<PublicHoliday[]>(
        `/notebook/calendar/holidays?start=${startDate}&end=${endDate}`
      );
      setHolidays(response);
    } catch (err) {
      console.error('Failed to fetch holidays:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch holidays'));
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const syncHolidays = useCallback(async (country?: string, year?: number) => {
    try {
      const params = new URLSearchParams();
      if (country) params.append('country_code', country);
      if (year) params.append('year', year.toString());
      
      await apiClient.post(`/notebook/calendar/holidays/sync?${params}`);
      await fetchHolidays();
    } catch (err) {
      console.error('Failed to sync holidays:', err);
      throw err;
    }
  }, [fetchHolidays]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  return {
    holidays,
    loading,
    error,
    refetch: fetchHolidays,
    syncHolidays,
  };
}
