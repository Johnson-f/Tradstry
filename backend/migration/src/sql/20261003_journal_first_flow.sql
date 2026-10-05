ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS journal_timezone text NOT NULL DEFAULT 'America/New_York';
ALTER TABLE workspaces ALTER COLUMN journal_timezone SET DEFAULT 'America/New_York';
ALTER TABLE journal_entries
    ALTER COLUMN open_date DROP NOT NULL,
    ALTER COLUMN close_date DROP NOT NULL,
    ALTER COLUMN entry_price DROP NOT NULL,
    ALTER COLUMN exit_price DROP NOT NULL,
    ALTER COLUMN position_size DROP NOT NULL,
    ALTER COLUMN status DROP NOT NULL,
    ALTER COLUMN total_pl DROP NOT NULL,
    ALTER COLUMN net_roi DROP NOT NULL,
    ALTER COLUMN duration DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS episode_id text REFERENCES trade_episodes(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'closed',
    ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS remaining_quantity numeric,
    ADD COLUMN IF NOT EXISTS realized_net numeric,
    ADD COLUMN IF NOT EXISTS fees_paid numeric,
    ADD COLUMN IF NOT EXISTS currency text,
    ADD COLUMN IF NOT EXISTS materialized_revision bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS record_version bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS issue_json jsonb,
    ADD COLUMN IF NOT EXISTS retired_at timestamptz,
    ADD COLUMN IF NOT EXISTS successor_id text REFERENCES journal_entries(id) ON DELETE SET NULL;
ALTER TABLE journal_entries ALTER COLUMN source_kind SET DEFAULT 'manual';
ALTER TABLE journal_entries ALTER COLUMN lifecycle_state SET DEFAULT 'closed';
ALTER TABLE journal_entries ALTER COLUMN outcome SET DEFAULT 'unknown';
ALTER TABLE journal_entries ALTER COLUMN materialized_revision SET DEFAULT 0;
ALTER TABLE journal_entries ALTER COLUMN record_version SET DEFAULT 0;
ALTER TABLE journal_entries ALTER COLUMN mistakes SET DEFAULT '';
ALTER TABLE journal_entries ALTER COLUMN entry_tactics SET DEFAULT '';
ALTER TABLE journal_entries ALTER COLUMN edges_spotted SET DEFAULT '';
DO $episode_unique$ DECLARE c text; BEGIN
    FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='journal_entries'::regclass
        AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (episode_id)' LOOP
        EXECUTE format('ALTER TABLE journal_entries DROP CONSTRAINT %I',c);
    END LOOP;
END $episode_unique$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_episode ON journal_entries(episode_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entry_owner ON journal_entries(id,user_id,workspace_id);
CREATE INDEX IF NOT EXISTS idx_journal_lifecycle_page ON journal_entries(user_id,workspace_id,lifecycle_state,created_at DESC,id DESC) WHERE deleted_at IS NULL AND retired_at IS NULL;
UPDATE journal_entries SET outcome=CASE WHEN total_pl>0 THEN 'profit' WHEN total_pl<0 THEN 'loss' WHEN total_pl=0 THEN 'breakeven' ELSE 'unknown' END WHERE outcome='unknown' AND source_kind='manual';

ALTER TABLE trade_episodes
    ADD COLUMN IF NOT EXISTS record_version bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS source_revision bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS retired_at timestamptz;
ALTER TABLE trade_episodes ALTER COLUMN record_version SET DEFAULT 0;
ALTER TABLE trade_episodes ALTER COLUMN source_revision SET DEFAULT 0;
ALTER TABLE trade_episode_fills ADD COLUMN IF NOT EXISTS allocation_order integer NOT NULL DEFAULT 0;
ALTER TABLE trade_episode_fills ALTER COLUMN allocation_order SET DEFAULT 0;
ALTER TABLE journal_brokerage_links DROP CONSTRAINT IF EXISTS journal_brokerage_links_brokerage_transaction_id_key;
DROP INDEX IF EXISTS idx_jbl_brokerage_tx_unique;
ALTER TABLE journal_brokerage_links ADD COLUMN IF NOT EXISTS allocated_quantity numeric;
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_link_entry_execution ON journal_brokerage_links(journal_entry_id,brokerage_transaction_id);

ALTER TABLE notebook_notes ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'general';
ALTER TABLE notebook_notes ALTER COLUMN purpose SET DEFAULT 'general';

CREATE TABLE IF NOT EXISTS journal_workspace_state (
    workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_revision bigint NOT NULL DEFAULT 0,
    sealed_revision bigint NOT NULL DEFAULT 0,
    projection_revision bigint NOT NULL DEFAULT 0,
    grouping_revision bigint NOT NULL DEFAULT 0,
    import_state text NOT NULL DEFAULT 'idle',
    enabled boolean NOT NULL DEFAULT false,
    opening_inventory jsonb NOT NULL DEFAULT '{}',
    last_error text,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS journal_projection_jobs (
    workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_revision bigint NOT NULL DEFAULT 0,
    state text NOT NULL DEFAULT 'pending',
    lease_owner text,
    lease_until timestamptz,
    attempt_count integer NOT NULL DEFAULT 0,
    available_at timestamptz NOT NULL DEFAULT now(),
    last_error text,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS brokerage_transaction_versions (
    id text PRIMARY KEY,
    transaction_id text NOT NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_revision bigint NOT NULL,
    operation text NOT NULL,
    record_json jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS journal_mutations (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    client_id text NOT NULL,
    mutation_id text NOT NULL,
    payload_hash text NOT NULL,
    result_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id,client_id,mutation_id)
);
CREATE TABLE IF NOT EXISTS journal_grouping_operations (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    kind text NOT NULL,
    state text NOT NULL DEFAULT 'preview',
    source_revision bigint NOT NULL,
    grouping_revision bigint NOT NULL,
    expected_versions jsonb NOT NULL,
    before_json jsonb NOT NULL,
    proposal_json jsonb NOT NULL,
    after_json jsonb,
    undo_of text REFERENCES journal_grouping_operations(id) ON DELETE SET NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    committed_at timestamptz
);
CREATE TABLE IF NOT EXISTS journal_grouping_suggestions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    episode_id text REFERENCES trade_episodes(id) ON DELETE SET NULL,
    source_revision bigint NOT NULL,
    candidate_key text NOT NULL,
    rule_version text NOT NULL,
    proposal_json jsonb NOT NULL,
    features_json jsonb NOT NULL,
    explanation text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id,workspace_id,candidate_key)
);
CREATE TABLE IF NOT EXISTS journal_grouping_feedback (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    suggestion_id text REFERENCES journal_grouping_suggestions(id) ON DELETE SET NULL,
    operation_id text REFERENCES journal_grouping_operations(id) ON DELETE SET NULL,
    disposition text NOT NULL,
    pattern_json jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS journal_trade_context (
    entry_id text PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_version bigint NOT NULL DEFAULT 0,
    stop_state text NOT NULL DEFAULT 'unknown',
    stop_price numeric,
    playbook_id text REFERENCES playbooks(id) ON DELETE SET NULL,
    companion_note_id text UNIQUE REFERENCES notebook_notes(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS journal_trade_context_events (
    id text PRIMARY KEY,
    entry_id text NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_version bigint NOT NULL,
    kind text NOT NULL,
    phase text NOT NULL,
    payload_json jsonb NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    claimed_at timestamptz
);
CREATE TABLE IF NOT EXISTS journal_review_sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    session_date date NOT NULL,
    timezone text NOT NULL,
    queue_json jsonb NOT NULL,
    completed_json jsonb NOT NULL DEFAULT '[]',
    cursor_entry_id text,
    record_version bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id,workspace_id,session_date,timezone)
);
CREATE TABLE IF NOT EXISTS journal_trade_reviews (
    id text PRIMARY KEY,
    entry_id text NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    review_version bigint NOT NULL,
    entry_revision bigint NOT NULL,
    context_revision bigint NOT NULL,
    takeaway text NOT NULL,
    choice_ids jsonb NOT NULL DEFAULT '[]',
    plan_adherence text,
    snapshot_json jsonb NOT NULL,
    session_id text REFERENCES journal_review_sessions(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(entry_id,review_version)
);
CREATE TABLE IF NOT EXISTS journal_review_drafts (
    entry_id text PRIMARY KEY REFERENCES journal_entries(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    record_version bigint NOT NULL DEFAULT 0,
    takeaway text NOT NULL DEFAULT '',
    choice_ids jsonb NOT NULL DEFAULT '[]',
    plan_adherence text,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS journal_changes (
    sequence bigserial PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    kind text NOT NULL,
    payload_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

DO $unique_contracts$ DECLARE item record; BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('journal_mutations','user_id, client_id, mutation_id'),
        ('journal_grouping_suggestions','user_id, workspace_id, candidate_key'),
        ('journal_review_sessions','user_id, workspace_id, session_date, timezone'),
        ('journal_trade_reviews','entry_id, review_version')
    ) AS definitions(table_name,columns) LOOP
        IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=item.table_name::regclass
            AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE ('||item.columns||')') THEN
            EXECUTE format('ALTER TABLE %I ADD UNIQUE (%s)',item.table_name,item.columns);
        END IF;
    END LOOP;
END $unique_contracts$;

DO $defaults$
DECLARE t text; c text;
BEGIN
    FOREACH t IN ARRAY ARRAY['journal_workspace_state','journal_projection_jobs','journal_mutations','journal_grouping_operations','journal_grouping_suggestions','journal_grouping_feedback','journal_trade_context','journal_trade_context_events','journal_review_sessions','journal_trade_reviews','journal_review_drafts','journal_changes','brokerage_transaction_versions'] LOOP
        FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=t AND column_name IN ('created_at','updated_at','recorded_at','available_at') LOOP
            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT now()',t,c);
        END LOOP;
        FOR c IN SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=t AND column_name IN ('record_version','source_revision','sealed_revision','projection_revision','grouping_revision','requested_revision','attempt_count') LOOP
            EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT 0',t,c);
        END LOOP;
    END LOOP;
END $defaults$;
ALTER TABLE journal_workspace_state ALTER COLUMN enabled SET DEFAULT false;
ALTER TABLE journal_workspace_state ALTER COLUMN opening_inventory SET DEFAULT '{}';
ALTER TABLE journal_workspace_state ALTER COLUMN import_state SET DEFAULT 'idle';
ALTER TABLE journal_projection_jobs ALTER COLUMN state SET DEFAULT 'pending';
ALTER TABLE journal_grouping_operations ALTER COLUMN state SET DEFAULT 'preview';
ALTER TABLE journal_grouping_suggestions ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE journal_trade_context ALTER COLUMN stop_state SET DEFAULT 'unknown';
ALTER TABLE journal_review_sessions ALTER COLUMN completed_json SET DEFAULT '[]';
ALTER TABLE journal_trade_reviews ALTER COLUMN choice_ids SET DEFAULT '[]';
ALTER TABLE journal_review_drafts ALTER COLUMN choice_ids SET DEFAULT '[]';
ALTER TABLE journal_review_drafts ALTER COLUMN takeaway SET DEFAULT '';

ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entry_lifecycle_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entry_lifecycle_check CHECK (lifecycle_state IN ('open','closed','incomplete'));
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entry_source_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entry_source_check CHECK (source_kind IN ('manual','broker'));
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entry_outcome_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entry_outcome_check CHECK (outcome IN ('profit','loss','breakeven','unknown'));
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_trade_type_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_trade_type_check CHECK (trade_type IN ('long','short') OR (trade_type='unknown' AND source_kind='broker' AND lifecycle_state='incomplete'));
ALTER TABLE journal_trade_context DROP CONSTRAINT IF EXISTS journal_context_stop_check;
ALTER TABLE journal_trade_context ADD CONSTRAINT journal_context_stop_check CHECK ((stop_state='price' AND stop_price IS NOT NULL AND stop_price>0) OR (stop_state IN ('unknown','none') AND stop_price IS NULL));
ALTER TABLE journal_trade_reviews DROP CONSTRAINT IF EXISTS journal_review_takeaway_check;
ALTER TABLE journal_trade_reviews ADD CONSTRAINT journal_review_takeaway_check CHECK (length(btrim(takeaway)) BETWEEN 1 AND 4000);
ALTER TABLE journal_trade_reviews DROP CONSTRAINT IF EXISTS journal_review_adherence_check;
ALTER TABLE journal_trade_reviews ADD CONSTRAINT journal_review_adherence_check CHECK (plan_adherence IS NULL OR plan_adherence IN ('yes','partly','no','no_plan'));
ALTER TABLE journal_review_drafts DROP CONSTRAINT IF EXISTS journal_draft_takeaway_check;
ALTER TABLE journal_review_drafts ADD CONSTRAINT journal_draft_takeaway_check CHECK (length(takeaway)<=4000);
ALTER TABLE notebook_notes DROP CONSTRAINT IF EXISTS notebook_note_purpose_check;
ALTER TABLE notebook_notes ADD CONSTRAINT notebook_note_purpose_check CHECK (purpose IN ('general','trade_context'));

DO $ownership$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['journal_trade_context','journal_trade_context_events','journal_trade_reviews','journal_review_drafts'] LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',t,t||'_entry_owner_fkey');
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(entry_id,user_id,workspace_id) REFERENCES journal_entries(id,user_id,workspace_id) ON DELETE CASCADE',t,t||'_entry_owner_fkey');
    END LOOP;
    FOREACH t IN ARRAY ARRAY['journal_workspace_state','journal_projection_jobs','brokerage_transaction_versions','journal_mutations','journal_grouping_operations','journal_grouping_suggestions','journal_grouping_feedback','journal_trade_context','journal_trade_context_events','journal_review_sessions','journal_trade_reviews','journal_review_drafts','journal_changes'] LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I',t,t||'_workspace_owner_fkey');
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(workspace_id,user_id) REFERENCES workspaces(id,user_id) ON DELETE CASCADE',t,t||'_workspace_owner_fkey');
    END LOOP;
END $ownership$;

CREATE INDEX IF NOT EXISTS idx_journal_jobs_pending ON journal_projection_jobs(state,available_at);
CREATE INDEX IF NOT EXISTS idx_journal_changes_pull ON journal_changes(user_id,workspace_id,sequence);
CREATE INDEX IF NOT EXISTS idx_journal_reviews_entry ON journal_trade_reviews(entry_id,review_version DESC);
CREATE INDEX IF NOT EXISTS idx_journal_source_versions ON brokerage_transaction_versions(user_id,workspace_id,source_revision);

CREATE OR REPLACE FUNCTION journal_lock_source_workspace() RETURNS trigger LANGUAGE plpgsql AS $lock_source$
DECLARE owner_id text; account_id text;
BEGIN
    IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.user_id<>OLD.user_id OR NEW.workspace_id<>OLD.workspace_id) THEN
        RAISE EXCEPTION 'Broker execution identity and ownership are immutable';
    END IF;
    IF TG_OP='DELETE' THEN owner_id=OLD.user_id; account_id=OLD.workspace_id;
    ELSE owner_id=NEW.user_id; account_id=NEW.workspace_id; END IF;
    IF EXISTS(SELECT 1 FROM workspaces WHERE id=account_id AND user_id=owner_id) THEN
        INSERT INTO journal_workspace_state(workspace_id,user_id) VALUES(account_id,owner_id) ON CONFLICT(workspace_id) DO NOTHING;
        PERFORM 1 FROM journal_workspace_state WHERE workspace_id=account_id AND user_id=owner_id FOR UPDATE;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $lock_source$;
DROP TRIGGER IF EXISTS journal_source_lock ON brokerage_transactions;
CREATE TRIGGER journal_source_lock BEFORE INSERT OR UPDATE OR DELETE ON brokerage_transactions
FOR EACH ROW EXECUTE FUNCTION journal_lock_source_workspace();

CREATE OR REPLACE FUNCTION journal_record_source_revision() RETURNS trigger LANGUAGE plpgsql AS $source$
DECLARE owner_id text; account_id text; execution_id text; version bigint; record jsonb;
BEGIN
    IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'updated_at'-'created_at')=(to_jsonb(OLD)-'updated_at'-'created_at') THEN RETURN NEW; END IF;
    IF TG_OP='DELETE' THEN record=to_jsonb(OLD); ELSE record=to_jsonb(NEW); END IF;
    owner_id=record->>'user_id'; account_id=record->>'workspace_id'; execution_id=record->>'id';
    IF NOT EXISTS(SELECT 1 FROM workspaces WHERE id=account_id AND user_id=owner_id) THEN
        IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END IF;
    INSERT INTO journal_workspace_state(workspace_id,user_id,source_revision) VALUES(account_id,owner_id,1)
    ON CONFLICT(workspace_id) DO UPDATE SET source_revision=journal_workspace_state.source_revision+1,updated_at=now()
    RETURNING source_revision INTO version;
    INSERT INTO brokerage_transaction_versions(id,transaction_id,user_id,workspace_id,source_revision,operation,record_json)
    VALUES(uuidv7()::text,execution_id,owner_id,account_id,version,lower(TG_OP),record);
    INSERT INTO journal_projection_jobs(workspace_id,user_id,requested_revision) VALUES(account_id,owner_id,version)
    ON CONFLICT(workspace_id) DO UPDATE SET requested_revision=EXCLUDED.requested_revision,
        state=CASE WHEN journal_projection_jobs.state='running' THEN 'running' ELSE 'pending' END,available_at=now(),updated_at=now();
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $source$;
DROP TRIGGER IF EXISTS journal_source_revision ON brokerage_transactions;
CREATE TRIGGER journal_source_revision AFTER INSERT OR UPDATE OR DELETE ON brokerage_transactions
FOR EACH ROW EXECUTE FUNCTION journal_record_source_revision();

CREATE OR REPLACE FUNCTION journal_lock_allocation_workspace() RETURNS trigger LANGUAGE plpgsql AS $lock_allocation$
DECLARE old_episode text; new_episode text;
BEGIN
    IF TG_OP<>'INSERT' THEN old_episode=OLD.episode_id; END IF;
    IF TG_OP<>'DELETE' THEN new_episode=NEW.episode_id; END IF;
    PERFORM 1 FROM journal_workspace_state s WHERE s.workspace_id IN
        (SELECT workspace_id FROM trade_episodes WHERE id IN (old_episode,new_episode))
        ORDER BY s.workspace_id FOR UPDATE;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $lock_allocation$;
DROP TRIGGER IF EXISTS journal_allocation_lock ON trade_episode_fills;
CREATE TRIGGER journal_allocation_lock BEFORE INSERT OR UPDATE OR DELETE ON trade_episode_fills
FOR EACH ROW EXECUTE FUNCTION journal_lock_allocation_workspace();

CREATE OR REPLACE FUNCTION journal_check_allocation_conservation() RETURNS trigger LANGUAGE plpgsql AS $allocation$
DECLARE execution_id text; broker_quantity numeric; allocated numeric; broker_fee numeric; allocated_fee numeric;
BEGIN
    IF TG_OP='DELETE' THEN execution_id=OLD.brokerage_transaction_id; ELSE execution_id=NEW.brokerage_transaction_id; END IF;
    SELECT abs(units::text::numeric),fee::text::numeric INTO broker_quantity,broker_fee FROM brokerage_transactions WHERE id=execution_id;
    IF broker_quantity IS NULL THEN RETURN NULL; END IF;
    IF EXISTS(SELECT 1 FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id JOIN brokerage_transactions b ON b.id=f.brokerage_transaction_id
              WHERE f.brokerage_transaction_id=execution_id AND (e.user_id<>b.user_id OR e.workspace_id<>b.workspace_id OR f.quantity<=0)) THEN
        RAISE EXCEPTION 'Invalid allocation ownership or quantity';
    END IF;
    SELECT coalesce(sum(f.quantity),0),coalesce(sum(f.fee),0) INTO allocated,allocated_fee FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id
    JOIN journal_workspace_state s ON s.workspace_id=e.workspace_id WHERE f.brokerage_transaction_id=execution_id AND e.retired_at IS NULL AND s.enabled;
    IF allocated>broker_quantity THEN RAISE EXCEPTION 'Broker execution quantity is over-allocated'; END IF;
    IF abs(allocated_fee)>abs(broker_fee) OR allocated_fee*broker_fee<0 OR (allocated=broker_quantity AND allocated_fee<>broker_fee) THEN
        RAISE EXCEPTION 'Broker execution fees are not conserved';
    END IF;
    RETURN NULL;
END $allocation$;
DROP TRIGGER IF EXISTS journal_allocation_conservation ON trade_episode_fills;
CREATE CONSTRAINT TRIGGER journal_allocation_conservation AFTER INSERT OR UPDATE OR DELETE ON trade_episode_fills
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_check_allocation_conservation();

CREATE OR REPLACE FUNCTION journal_protect_entry_revision() RETURNS trigger LANGUAGE plpgsql AS $entry_revision$
DECLARE material_changed boolean;
BEGIN
    IF TG_OP='UPDATE' THEN
        material_changed=ROW(NEW.open_date,NEW.close_date,NEW.entry_price,NEW.exit_price,NEW.position_size,NEW.symbol,NEW.trade_type,NEW.total_pl,NEW.contract_multiplier,NEW.lifecycle_state,NEW.remaining_quantity,NEW.realized_net,NEW.fees_paid,NEW.episode_id,NEW.retired_at)
            IS DISTINCT FROM ROW(OLD.open_date,OLD.close_date,OLD.entry_price,OLD.exit_price,OLD.position_size,OLD.symbol,OLD.trade_type,OLD.total_pl,OLD.contract_multiplier,OLD.lifecycle_state,OLD.remaining_quantity,OLD.realized_net,OLD.fees_paid,OLD.episode_id,OLD.retired_at);
        IF OLD.source_kind='broker' AND material_changed AND current_setting('tradstry.journal_writer',true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'JOURNAL_V2_REQUIRED: broker results must be changed through the journal owner';
        END IF;
        IF material_changed THEN NEW.materialized_revision=greatest(NEW.materialized_revision,OLD.materialized_revision+1); END IF;
        IF (to_jsonb(NEW)-'updated_at'-'record_version') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'record_version') THEN
            NEW.record_version=greatest(NEW.record_version,OLD.record_version+1);
        END IF;
    END IF;
    IF NEW.source_kind='manual' AND NEW.close_date IS NOT NULL AND NEW.total_pl IS NOT NULL THEN
        NEW.realized_net=NEW.position_size::text::numeric*NEW.entry_price::text::numeric*NEW.total_pl::text::numeric/100*NEW.contract_multiplier::text::numeric;
        NEW.remaining_quantity=0;
        NEW.outcome=CASE WHEN NEW.total_pl>0 THEN 'profit' WHEN NEW.total_pl<0 THEN 'loss' ELSE 'breakeven' END;
    END IF;
    RETURN NEW;
END $entry_revision$;
DROP TRIGGER IF EXISTS journal_entry_revision ON journal_entries;
CREATE TRIGGER journal_entry_revision BEFORE INSERT OR UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION journal_protect_entry_revision();

CREATE OR REPLACE FUNCTION journal_protect_compatibility_link() RETURNS trigger LANGUAGE plpgsql AS $link_owner$
DECLARE enabled boolean;
BEGIN
    SELECT s.enabled INTO enabled FROM journal_entries e JOIN journal_workspace_state s ON s.workspace_id=e.workspace_id AND s.user_id=e.user_id
        WHERE e.id=NEW.journal_entry_id AND e.user_id=NEW.user_id FOR UPDATE OF s;
    IF enabled AND current_setting('tradstry.journal_writer',true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'JOURNAL_V2_REQUIRED: broker links must be changed through a grouping preview';
    END IF;
    RETURN NEW;
END $link_owner$;
DROP TRIGGER IF EXISTS journal_link_owner ON journal_brokerage_links;
CREATE TRIGGER journal_link_owner BEFORE INSERT OR UPDATE ON journal_brokerage_links FOR EACH ROW EXECUTE FUNCTION journal_protect_compatibility_link();
