-- Add last sync timestamp to connections
ALTER TABLE external_calendar_connections 
ADD COLUMN last_sync_timestamp TEXT DEFAULT '';

-- Add external update tracking to events
ALTER TABLE external_calendar_events 
ADD COLUMN external_updated_at TEXT;

-- Add unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_external_calendar_events_unique 
ON external_calendar_events(connection_id, external_event_id);

-- Add index for efficient sync queries
CREATE INDEX IF NOT EXISTS idx_external_calendar_connections_last_sync 
ON external_calendar_connections(last_sync_timestamp);

-- Create public holidays table
CREATE TABLE IF NOT EXISTS public_holidays (
    id TEXT PRIMARY KEY,
    country_code TEXT NOT NULL,
    holiday_name TEXT NOT NULL,
    holiday_date TEXT NOT NULL,
    is_national BOOLEAN DEFAULT true,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_public_holidays_country_date 
ON public_holidays(country_code, holiday_date);

CREATE INDEX IF NOT EXISTS idx_public_holidays_date 
ON public_holidays(holiday_date);
