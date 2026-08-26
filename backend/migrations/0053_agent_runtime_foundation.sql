-- Durable TinyAgents runtime foundation. These tables coexist with the legacy
-- AI subsystem until the separately gated production cutover.

CREATE TABLE IF NOT EXISTS agent_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT,
    summary_text TEXT,
    summarized_through_sequence BIGINT NOT NULL DEFAULT 0,
    summary_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_conversations_user_workspace_updated
    ON agent_conversations (user_id, workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sequence BIGINT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'action')),
    content_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation_sequence
    ON agent_messages (conversation_id, sequence);

CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_run_id TEXT REFERENCES agent_runs(id) ON DELETE CASCADE,
    input_message_id TEXT REFERENCES agent_messages(id) ON DELETE CASCADE,
    lane TEXT NOT NULL CHECK (lane IN ('instant', 'fast_ai', 'deep')),
    status TEXT NOT NULL CHECK (
        status IN ('queued', 'running', 'waiting_for_approval', 'completed', 'failed', 'cancelled')
    ),
    stage TEXT NOT NULL DEFAULT 'queued',
    idempotency_key TEXT NOT NULL,
    budget_reserved_at TIMESTAMPTZ,
    next_event_sequence BIGINT NOT NULL DEFAULT 1,
    model_calls BIGINT NOT NULL DEFAULT 0 CHECK (model_calls >= 0),
    tool_calls BIGINT NOT NULL DEFAULT 0 CHECK (tool_calls >= 0),
    input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
    output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
    cached_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
    estimated_cost_micros BIGINT NOT NULL DEFAULT 0 CHECK (estimated_cost_micros >= 0),
    lease_owner TEXT,
    leased_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
    cancel_requested_at TIMESTAMPTZ,
    error_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_claimable
    ON agent_runs (status, heartbeat_at, created_at)
    WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_agent_runs_conversation_created
    ON agent_runs (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sequence BIGINT NOT NULL,
    kind TEXT NOT NULL,
    payload_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_sequence
    ON agent_run_events (run_id, sequence);

CREATE TABLE IF NOT EXISTS agent_checkpoints (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    sequence BIGINT NOT NULL,
    state_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_run_sequence
    ON agent_checkpoints (run_id, sequence DESC);
