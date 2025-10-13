-- The database design on Turso is per user, so no need for user_id in the table
-- Upsert trade note function (PostgreSQL syntax)
CREATE OR REPLACE FUNCTION upsert_trade_note(
    p_id TEXT,
    p_user_id TEXT,
    p_name TEXT,
    p_content TEXT
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
    INSERT INTO notes (id, user_id, name, content, created_at, updated_at)
    VALUES (p_id, p_user_id, p_name, p_content, NOW(), NOW())
    ON CONFLICT(id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        name = EXCLUDED.name,
        content = EXCLUDED.content,
        updated_at = NOW()
    RETURNING notes.id, notes.user_id, notes.name, notes.content, notes.created_at, notes.updated_at;
END;
$$;