import { useState, useEffect, useCallback } from 'react';
import { CalendarService } from '@/lib/services/calendar-service';
import { ExternalCalendarEvent } from '@/lib/types/calendar';
import { startOfDay, endOfDay } from 'date-fns';

export function useExternalEvents(selectedDate: Date) {
  const [events, setEvents] = useState<ExternalCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const start = startOfDay(selectedDate);
      const end = endOfDay(selectedDate);
      const response = await CalendarService.getExternalEvents(start, end);
      setEvents(response.external_events);
    } catch (err) {
      setError(err as Error);
      console.error('Failed to fetch external events:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    loading,
    error,
    refetch: fetchEvents,
  };
}
