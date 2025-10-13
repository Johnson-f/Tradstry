-- The database design on Turso is per user, so no need for user_id in the table
CREATE OR REPLACE FUNCTION get_trade_note_by_id(
    p_id TEXT,
    p_user_id TEXT
)
RETURNS TABLE(
    id TEXT,
    user_id TEXT,
    name TEXT,
    content TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT notes.id, notes.user_id, notes.name, notes.content, notes.created_at, notes.updated_at
    FROM notes
    WHERE notes.id = p_id AND notes.user_id = p_user_id;
END;
$$;