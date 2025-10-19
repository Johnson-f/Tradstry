CREATE TABLE IF NOT EXISTS notebook_notes (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES notebook_notes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notebook_notes_parent_id ON notebook_notes(parent_id);
CREATE INDEX IF NOT EXISTS idx_notebook_notes_is_deleted ON notebook_notes(is_deleted);
CREATE INDEX IF NOT EXISTS idx_notebook_notes_created_at ON notebook_notes(created_at);
CREATE INDEX IF NOT EXISTS idx_notebook_notes_position ON notebook_notes(parent_id, position);

CREATE TRIGGER IF NOT EXISTS update_notebook_notes_timestamp
AFTER UPDATE ON notebook_notes
FOR EACH ROW
BEGIN
    UPDATE notebook_notes SET updated_at = datetime('now') WHERE id = NEW.id;
END;


