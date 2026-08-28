CREATE TABLE IF NOT EXISTS agent_memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('preference', 'goal', 'routine', 'instruction')),
    subject_key TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending_review', 'active', 'superseded', 'deleted')),
    pinned BOOLEAN NOT NULL DEFAULT false,
    source_conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
    source_message_id TEXT NOT NULL REFERENCES agent_messages(id) ON DELETE CASCADE,
    provenance_excerpt TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    extraction_version TEXT NOT NULL,
    normalized_hash TEXT NOT NULL,
    embedding halfvec(2048),
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED,
    user_edited BOOLEAN NOT NULL DEFAULT false,
    superseded_by TEXT REFERENCES agent_memories(id) ON DELETE SET NULL,
    use_count BIGINT NOT NULL DEFAULT 0 CHECK (use_count >= 0),
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (source_message_id, normalized_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_memories_one_active_subject
    ON agent_memories (user_id, workspace_id, kind, subject_key) NULLS NOT DISTINCT
    WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agent_memories_recall
    ON agent_memories (user_id, workspace_id, status, pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memories_search
    ON agent_memories USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_agent_memories_embedding
    ON agent_memories USING hnsw (embedding halfvec_cosine_ops)
    WHERE embedding IS NOT NULL AND status = 'active';

CREATE TABLE IF NOT EXISTS agent_memory_jobs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
    source_message_id TEXT NOT NULL REFERENCES agent_messages(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    extraction_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    lease_owner TEXT,
    leased_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (source_message_id, extraction_version)
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_jobs_claimable
    ON agent_memory_jobs (status, created_at)
    WHERE status IN ('queued', 'running');
