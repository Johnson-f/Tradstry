CREATE TABLE IF NOT EXISTS agent_tool_calls (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    call_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    arguments_json JSONB NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    result_summary TEXT,
    error_code TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (run_id, call_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run_started
    ON agent_tool_calls (run_id, started_at);

CREATE TABLE IF NOT EXISTS agent_evidence (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    tool_call_id TEXT REFERENCES agent_tool_calls(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_version TEXT NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    source_url TEXT,
    freshness TEXT NOT NULL CHECK (freshness IN ('canonical', 'fresh', 'stale', 'external')),
    payload_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_evidence_run_created
    ON agent_evidence (run_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_agent_evidence_source
    ON agent_evidence (user_id, workspace_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS agent_claims (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL REFERENCES agent_messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    claim_key TEXT NOT NULL,
    claim_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, claim_key)
);

CREATE TABLE IF NOT EXISTS agent_claim_evidence (
    claim_id TEXT NOT NULL REFERENCES agent_claims(id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL REFERENCES agent_evidence(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    PRIMARY KEY (claim_id, evidence_id),
    UNIQUE (claim_id, ordinal)
);

CREATE TABLE IF NOT EXISTS agent_conversation_summary_jobs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    target_sequence BIGINT NOT NULL,
    summary_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    lease_owner TEXT,
    leased_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_summary_jobs_one_queued
    ON agent_conversation_summary_jobs (conversation_id)
    WHERE status = 'queued';
