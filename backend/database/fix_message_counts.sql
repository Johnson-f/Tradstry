-- Fix message counts for existing chat sessions
-- This script recalculates the message_count for all existing chat sessions
-- by counting the actual messages in the chat_messages table

UPDATE chat_sessions 
SET message_count = (
    SELECT COUNT(*) 
    FROM chat_messages 
    WHERE chat_messages.session_id = chat_sessions.id
)
WHERE EXISTS (
    SELECT 1 
    FROM chat_messages 
    WHERE chat_messages.session_id = chat_sessions.id
);
