-- Edges, entry tactics, tags and mistakes become a catalog each user owns,
-- attached to journal entries by ID so a rename or merge reaches every trade.
-- The free-text fields they replace are dropped: nothing is in production.

CREATE TABLE journal_labels (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('edge', 'entry_tactic', 'tag', 'mistake')),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
    color text CHECK (color ~ '^#[0-9a-f]{6}$'),
    position integer NOT NULL DEFAULT 0,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, kind)
);

-- Active names are unique per kind, ignoring case and surrounding spaces.
CREATE UNIQUE INDEX journal_labels_name_idx
    ON journal_labels (user_id, kind, lower(btrim(name))) WHERE archived_at IS NULL;

ALTER TABLE trade_annotations
    DROP COLUMN setup,
    DROP COLUMN tags,
    DROP COLUMN mistakes,
    DROP COLUMN target_price,
    ADD COLUMN edge_id uuid,
    ADD COLUMN edge_kind text NOT NULL GENERATED ALWAYS AS ('edge') STORED,
    ADD COLUMN entry_tactic_id uuid,
    ADD COLUMN entry_tactic_kind text NOT NULL GENERATED ALWAYS AS ('entry_tactic') STORED,
    ADD COLUMN planned_risk numeric CHECK (planned_risk > 0);

-- The kind is part of each key, so an edge slot can never hold a tag. None of
-- these cascade: a label in use cannot be deleted, only archived or merged.
ALTER TABLE trade_annotations
    ADD FOREIGN KEY (edge_id, edge_kind) REFERENCES journal_labels (id, kind),
    ADD FOREIGN KEY (entry_tactic_id, entry_tactic_kind) REFERENCES journal_labels (id, kind);

ALTER TABLE trade_annotations RENAME COLUMN stop_price TO initial_stop;

CREATE TABLE trade_annotation_labels (
    annotation_id uuid NOT NULL REFERENCES trade_annotations (id) ON DELETE CASCADE,
    label_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('tag', 'mistake')),
    PRIMARY KEY (annotation_id, label_id),
    FOREIGN KEY (label_id, kind) REFERENCES journal_labels (id, kind)
);

CREATE INDEX trade_annotation_labels_label_idx ON trade_annotation_labels (label_id);
CREATE INDEX trade_annotations_edge_idx ON trade_annotations (edge_id) WHERE edge_id IS NOT NULL;
CREATE INDEX trade_annotations_tactic_idx ON trade_annotations (entry_tactic_id) WHERE entry_tactic_id IS NOT NULL;
