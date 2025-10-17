CREATE TABLE IF NOT EXISTS notebook_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#gray',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notebook_note_tags (
    note_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES notebook_notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES notebook_tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notebook_note_tags_note_id ON notebook_note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_notebook_note_tags_tag_id ON notebook_note_tags(tag_id);


