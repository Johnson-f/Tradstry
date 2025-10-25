export interface CalendarConnection {
  id: string;
  provider: 'google';
  calendar_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExternalCalendarEvent {
  id: string;
  connection_id: string;
  external_event_id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  location?: string;
}

export interface SyncResult {
  success: boolean;
  synced: number;
}

export interface CalendarEventsResponse {
  success: boolean;
  local_events: unknown[];
  external_events: ExternalCalendarEvent[];
}

export interface OAuthCodePayload {
  code: string;
  redirect_uri: string;
  client_id: string;
  client_secret: string;
  tenant?: string;
}

export interface ConnectPayload {
  access_token: string;
  refresh_token: string;
  token_expiry: string;
  calendar_id?: string;
}

export interface DateRangeQuery {
  start: string;
  end: string;
}
