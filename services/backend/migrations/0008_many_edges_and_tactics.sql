-- A trade can have several edges and entry tactics, linked like tags and mistakes.
ALTER TABLE trade_annotation_labels DROP CONSTRAINT trade_annotation_labels_kind_check;
ALTER TABLE trade_annotation_labels
    ADD CONSTRAINT trade_annotation_labels_kind_check
    CHECK (kind IN ('edge', 'entry_tactic', 'tag', 'mistake'));

INSERT INTO trade_annotation_labels (annotation_id, label_id, kind)
SELECT id, edge_id, 'edge' FROM trade_annotations WHERE edge_id IS NOT NULL
UNION ALL
SELECT id, entry_tactic_id, 'entry_tactic' FROM trade_annotations WHERE entry_tactic_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE trade_annotations
    DROP COLUMN edge_id,
    DROP COLUMN edge_kind,
    DROP COLUMN entry_tactic_id,
    DROP COLUMN entry_tactic_kind;
