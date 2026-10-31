-- Trade notes have one canonical format: a serialized Lexical document.
-- Preserve existing text (including line breaks) during the one-time conversion.
CREATE FUNCTION pg_temp.trade_note_document(content text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
    SELECT jsonb_build_object('root', jsonb_build_object(
        'type', 'root', 'version', 1, 'direction', NULL, 'format', '', 'indent', 0,
        'children', jsonb_build_array(jsonb_build_object(
            'type', 'paragraph', 'version', 1, 'direction', NULL, 'format', '', 'indent', 0,
            'textFormat', 0, 'textStyle', '',
            'children', COALESCE((
                SELECT jsonb_agg(node ORDER BY position, part)
                FROM unnest(string_to_array(content, E'\n')) WITH ORDINALITY AS lines(line, position)
                CROSS JOIN LATERAL (
                    SELECT 0 AS part, jsonb_build_object('type', 'linebreak', 'version', 1) AS node
                    WHERE position > 1
                    UNION ALL
                    SELECT 1, jsonb_build_object(
                        'type', 'text', 'version', 1, 'text', line,
                        'format', 0, 'detail', 0, 'mode', 'normal', 'style', ''
                    ) WHERE line <> ''
                ) AS nodes
            ), '[]'::jsonb)
        ))
    ));
$$;

ALTER TABLE trade_annotations ALTER COLUMN notes DROP DEFAULT;
ALTER TABLE trade_annotations ALTER COLUMN notes TYPE jsonb USING pg_temp.trade_note_document(notes);
ALTER TABLE trade_annotations ALTER COLUMN notes SET DEFAULT
    '{"root":{"type":"root","version":1,"direction":null,"format":"","indent":0,"children":[{"type":"paragraph","version":1,"direction":null,"format":"","indent":0,"textFormat":0,"textStyle":"","children":[]}]}}'::jsonb;
ALTER TABLE trade_annotations ADD CONSTRAINT trade_annotations_note_document CHECK ((
    jsonb_typeof(notes) = 'object' AND jsonb_typeof(notes->'root') = 'object'
    AND notes->'root'->>'type' = 'root'
) IS TRUE);
