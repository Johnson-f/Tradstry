CREATE TABLE IF NOT EXISTS notebook_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notebook_templates_created_at ON notebook_templates(created_at);

CREATE TRIGGER IF NOT EXISTS update_notebook_templates_timestamp
AFTER UPDATE ON notebook_templates
FOR EACH ROW
BEGIN
    UPDATE notebook_templates SET updated_at = datetime('now') WHERE id = NEW.id;
END;


