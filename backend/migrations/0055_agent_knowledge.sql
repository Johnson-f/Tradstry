CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agent_knowledge_passages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('journal_entry', 'notebook_note', 'playbook')),
    source_id TEXT NOT NULL,
    source_version TEXT NOT NULL,
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    search_text TEXT NOT NULL,
    embedding halfvec(2048),
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', search_text)) STORED,
    trade_ids TEXT[] NOT NULL DEFAULT '{}',
    playbook_ids TEXT[] NOT NULL DEFAULT '{}',
    note_ids TEXT[] NOT NULL DEFAULT '{}',
    symbols TEXT[] NOT NULL DEFAULT '{}',
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ,
    content_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, workspace_id, source_type, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_agent_knowledge_embedding_hnsw
    ON agent_knowledge_passages USING hnsw (embedding halfvec_cosine_ops)
    WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_search_gin
    ON agent_knowledge_passages USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_scope_source
    ON agent_knowledge_passages (user_id, workspace_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_dates
    ON agent_knowledge_passages (user_id, workspace_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_trade_ids
    ON agent_knowledge_passages USING gin (trade_ids);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_playbook_ids
    ON agent_knowledge_passages USING gin (playbook_ids);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_note_ids
    ON agent_knowledge_passages USING gin (note_ids);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_symbols
    ON agent_knowledge_passages USING gin (symbols);

CREATE TABLE IF NOT EXISTS agent_index_outbox (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('journal_entry', 'notebook_note', 'playbook')),
    source_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_index_outbox_one_queued
    ON agent_index_outbox (user_id, workspace_id, source_type, source_id)
    WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_agent_index_outbox_claimable
    ON agent_index_outbox (status, available_at, created_at)
    WHERE status IN ('queued', 'running');

CREATE OR REPLACE FUNCTION agent_enqueue_index_work(
    p_user_id TEXT,
    p_workspace_id TEXT,
    p_source_type TEXT,
    p_source_id TEXT,
    p_operation TEXT
) RETURNS VOID AS $$
BEGIN
    IF p_user_id IS NULL OR p_workspace_id IS NULL OR p_source_id IS NULL THEN
        RETURN;
    END IF;
    INSERT INTO agent_index_outbox
        (user_id, workspace_id, source_type, source_id, operation)
    VALUES (p_user_id, p_workspace_id, p_source_type, p_source_id, p_operation)
    ON CONFLICT (user_id, workspace_id, source_type, source_id)
        WHERE status = 'queued'
    DO UPDATE SET operation = EXCLUDED.operation, available_at = now(),
                  updated_at = now(), error_code = NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agent_source_index_trigger() RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    source_kind TEXT;
BEGIN
    payload := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    source_kind := CASE TG_TABLE_NAME
        WHEN 'journal_entries' THEN 'journal_entry'
        WHEN 'notebook_notes' THEN 'notebook_note'
        WHEN 'playbooks' THEN 'playbook'
    END;
    PERFORM agent_enqueue_index_work(
        payload->>'user_id', payload->>'workspace_id', source_kind, payload->>'id',
        CASE WHEN TG_OP = 'DELETE' OR payload->>'deleted_at' IS NOT NULL THEN 'delete' ELSE 'upsert' END
    );
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_index_journal ON journal_entries;
CREATE TRIGGER trg_agent_index_journal
    AFTER INSERT OR UPDATE OR DELETE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION agent_source_index_trigger();
DROP TRIGGER IF EXISTS trg_agent_index_notebook ON notebook_notes;
CREATE TRIGGER trg_agent_index_notebook
    AFTER INSERT OR UPDATE OR DELETE ON notebook_notes
    FOR EACH ROW EXECUTE FUNCTION agent_source_index_trigger();
DROP TRIGGER IF EXISTS trg_agent_index_playbook ON playbooks;
CREATE TRIGGER trg_agent_index_playbook
    AFTER INSERT OR UPDATE OR DELETE ON playbooks
    FOR EACH ROW EXECUTE FUNCTION agent_source_index_trigger();

CREATE OR REPLACE FUNCTION agent_relationship_index_trigger() RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    owner_user TEXT;
    owner_workspace TEXT;
    trade_id TEXT;
    note_id TEXT;
BEGIN
    payload := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
    IF TG_TABLE_NAME = 'notebook_note_trades' THEN
        note_id := payload->>'note_id';
        trade_id := payload->>'trade_id';
        SELECT user_id, workspace_id INTO owner_user, owner_workspace
          FROM notebook_notes WHERE id = note_id;
        PERFORM agent_enqueue_index_work(owner_user, owner_workspace, 'notebook_note', note_id, 'upsert');
        SELECT user_id, workspace_id INTO owner_user, owner_workspace
          FROM journal_entries WHERE id = trade_id;
        PERFORM agent_enqueue_index_work(owner_user, owner_workspace, 'journal_entry', trade_id, 'upsert');
    ELSE
        trade_id := payload->>'journal_entry_id';
        SELECT user_id, workspace_id INTO owner_user, owner_workspace
          FROM journal_entries WHERE id = trade_id;
        PERFORM agent_enqueue_index_work(owner_user, owner_workspace, 'journal_entry', trade_id, 'upsert');
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_index_note_trade ON notebook_note_trades;
CREATE TRIGGER trg_agent_index_note_trade
    AFTER INSERT OR UPDATE OR DELETE ON notebook_note_trades
    FOR EACH ROW EXECUTE FUNCTION agent_relationship_index_trigger();
DROP TRIGGER IF EXISTS trg_agent_index_trade_tag ON trade_tags;
CREATE TRIGGER trg_agent_index_trade_tag
    AFTER INSERT OR UPDATE OR DELETE ON trade_tags
    FOR EACH ROW EXECUTE FUNCTION agent_relationship_index_trigger();
DROP TRIGGER IF EXISTS trg_agent_index_trade_principle ON trade_principle_violations;
CREATE TRIGGER trg_agent_index_trade_principle
    AFTER INSERT OR UPDATE OR DELETE ON trade_principle_violations
    FOR EACH ROW EXECUTE FUNCTION agent_relationship_index_trigger();

CREATE OR REPLACE FUNCTION agent_related_record_index_trigger() RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    related_id TEXT;
    row_value RECORD;
BEGIN
    payload := to_jsonb(NEW);
    related_id := payload->>'id';
    IF TG_TABLE_NAME = 'tags' THEN
        FOR row_value IN
            SELECT j.user_id, j.workspace_id, j.id
              FROM trade_tags tt JOIN journal_entries j ON j.id = tt.journal_entry_id
             WHERE tt.tag_id = related_id
        LOOP
            PERFORM agent_enqueue_index_work(row_value.user_id, row_value.workspace_id, 'journal_entry', row_value.id, 'upsert');
        END LOOP;
    ELSE
        FOR row_value IN
            SELECT j.user_id, j.workspace_id, j.id
              FROM trade_principle_violations v JOIN journal_entries j ON j.id = v.journal_entry_id
             WHERE v.principle_id = related_id
        LOOP
            PERFORM agent_enqueue_index_work(row_value.user_id, row_value.workspace_id, 'journal_entry', row_value.id, 'upsert');
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_index_tag_update ON tags;
CREATE TRIGGER trg_agent_index_tag_update
    AFTER UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION agent_related_record_index_trigger();
DROP TRIGGER IF EXISTS trg_agent_index_principle_update ON trading_principles;
CREATE TRIGGER trg_agent_index_principle_update
    AFTER UPDATE ON trading_principles FOR EACH ROW EXECUTE FUNCTION agent_related_record_index_trigger();
