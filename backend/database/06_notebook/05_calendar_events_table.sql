CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    reminder_id TEXT NOT NULL,
    event_title TEXT NOT NULL,
    event_description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    is_all_day BOOLEAN NOT NULL DEFAULT false,
    is_synced BOOLEAN NOT NULL DEFAULT false,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (reminder_id) REFERENCES notebook_reminders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_reminder_id ON calendar_events(reminder_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end_date ON calendar_events(end_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date_range ON calendar_events(start_date, end_date);

CREATE TRIGGER IF NOT EXISTS update_calendar_events_timestamp
AFTER UPDATE ON calendar_events
FOR EACH ROW
BEGIN
    UPDATE calendar_events SET updated_at = datetime('now') WHERE id = NEW.id;
END;


