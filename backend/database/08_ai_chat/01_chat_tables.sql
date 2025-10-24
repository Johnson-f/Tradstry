-- AI Chat Tables Migration
-- This migration creates tables for AI chat functionality

-- Chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    last_message_at TEXT
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    context_vectors TEXT, -- JSON array of vector IDs
    token_count INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON chat_sessions(updated_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

-- Triggers to update session metadata
CREATE TRIGGER IF NOT EXISTS update_chat_session_on_message_insert
    AFTER INSERT ON chat_messages
    FOR EACH ROW
BEGIN
    UPDATE chat_sessions 
    SET 
        message_count = message_count + 1,
        last_message_at = NEW.created_at,
        updated_at = NEW.created_at
    WHERE id = NEW.session_id;
END;

CREATE TRIGGER IF NOT EXISTS update_chat_session_on_message_delete
    AFTER DELETE ON chat_messages
    FOR EACH ROW
BEGIN
    UPDATE chat_sessions 
    SET 
        message_count = message_count - 1,
        updated_at = datetime('now')
    WHERE id = OLD.session_id;
END;

