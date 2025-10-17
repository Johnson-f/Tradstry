CREATE TABLE IF NOT EXISTS external_calendar_connections (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry TEXT NOT NULL,
    calendar_id TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS external_calendar_events (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    external_event_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    location TEXT,
    last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (connection_id) REFERENCES external_calendar_connections(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_external_calendar_events_connection_id ON external_calendar_events(connection_id);
CREATE INDEX IF NOT EXISTS idx_external_calendar_events_start_time ON external_calendar_events(start_time);


