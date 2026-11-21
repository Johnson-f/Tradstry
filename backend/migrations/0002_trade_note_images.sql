-- Files are private and live on the backend's mounted disk. Keep metadata after
-- cascaded deletions until the backend has removed the corresponding file.
CREATE TABLE trade_note_images (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
    source_trade_id text NOT NULL,
    annotation_id uuid REFERENCES trade_annotations(id) ON DELETE SET NULL,
    request_id uuid NOT NULL,
    digest bytea NOT NULL,
    media_type text NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg', 'image/webp')),
    ready boolean NOT NULL DEFAULT false,
    delete_after timestamptz DEFAULT now() + interval '1 day',
    UNIQUE (user_id, request_id)
);
CREATE INDEX trade_note_images_annotation_idx ON trade_note_images(annotation_id);
CREATE INDEX trade_note_images_expiry_idx ON trade_note_images(delete_after) WHERE delete_after IS NOT NULL;
