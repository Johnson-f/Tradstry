CREATE TABLE IF NOT EXISTS notebook_reminders (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    reminder_time TEXT NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (note_id) REFERENCES notebook_notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notebook_reminders_note_id ON notebook_reminders(note_id);
CREATE INDEX IF NOT EXISTS idx_notebook_reminders_reminder_time ON notebook_reminders(reminder_time);
CREATE INDEX IF NOT EXISTS idx_notebook_reminders_is_completed ON notebook_reminders(is_completed);

CREATE TRIGGER IF NOT EXISTS update_notebook_reminders_timestamp
AFTER UPDATE ON notebook_reminders
FOR EACH ROW
BEGIN
    UPDATE notebook_reminders SET updated_at = datetime('now') WHERE id = NEW.id;
END;


