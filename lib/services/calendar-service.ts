import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { 
  CalendarConnection, 
  SyncResult, 
  CalendarEventsResponse 
} from '@/lib/types/calendar';

export class CalendarService {
  static async initiateGoogleOAuth(): Promise<void> {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/auth/callback/google`;
    const scope = 'https://www.googleapis.com/auth/calendar.readonly';
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `prompt=consent`;
    
    window.location.href = authUrl;
  }
  
  static async getConnections(): Promise<CalendarConnection[]> {
    return apiClient.get<CalendarConnection[]>(
      apiConfig.endpoints.notebook.calendar.connections
    );
  }
  
  static async disconnectCalendar(connectionId: string): Promise<void> {
    await apiClient.delete(
      apiConfig.endpoints.notebook.calendar.disconnect(connectionId)
    );
  }
  
  static async syncCalendar(connectionId: string): Promise<SyncResult> {
    return apiClient.post<SyncResult>(
      apiConfig.endpoints.notebook.calendar.sync(connectionId)
    );
  }
  
  static async getExternalEvents(startDate: Date, endDate: Date): Promise<CalendarEventsResponse> {
    const start = startDate.toISOString();
    const end = endDate.toISOString();
    return apiClient.get<CalendarEventsResponse>(
      `${apiConfig.endpoints.notebook.calendar.events}?start=${start}&end=${end}`
    );
  }
}