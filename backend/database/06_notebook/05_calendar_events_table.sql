CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    reminder_id TEXT NOT NULL,
    event_title TEXT NOT NULL,
    event_description TEXT,
    event_time TEXT NOT NULL,
    is_synced BOOLEAN NOT NULL DEFAULT false,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (reminder_id) REFERENCES notebook_reminders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_reminder_id ON calendar_events(reminder_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_event_time ON calendar_events(event_time);

CREATE TRIGGER IF NOT EXISTS update_calendar_events_timestamp
AFTER UPDATE ON calendar_events
FOR EACH ROW
BEGIN
    UPDATE calendar_events SET updated_at = datetime('now') WHERE id = NEW.id;
END;


