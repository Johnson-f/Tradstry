-- The TinyAgents runtime does not migrate legacy chat or AI-derived state.
-- Saved prompts are deliberately preserved; every other old chat, agent,
-- generated artifact, checkpoint, and vector-memory table is removed.

DROP TABLE IF EXISTS ai_artifact_sources CASCADE;
DROP TABLE IF EXISTS ai_artifacts CASCADE;
DROP TABLE IF EXISTS ai_source_documents CASCADE;
DROP TABLE IF EXISTS ai_jobs CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS checkpoints CASCADE;
DROP TABLE IF EXISTS writes CASCADE;
DROP TABLE IF EXISTS store_embeddings CASCADE;
DROP TABLE IF EXISTS store_items CASCADE;
DROP TABLE IF EXISTS vector_context_cache CASCADE;
DROP TABLE IF EXISTS vector_documents CASCADE;
DROP TABLE IF EXISTS vector_parents CASCADE;
DROP TABLE IF EXISTS vector_memories CASCADE;
DROP TABLE IF EXISTS vector_schema_version CASCADE;
DROP TABLE IF EXISTS user_agents CASCADE;
