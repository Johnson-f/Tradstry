-- A starting position the user entered for history that predates the imported
-- broker records. It belongs to the instrument, and the projection treats it as
-- the first fill, so trades built from it use it up like any other entry.
CREATE TABLE IF NOT EXISTS journal_opening_positions (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    instrument_key text NOT NULL,
    direction text NOT NULL,
    quantity numeric NOT NULL,
    average_price numeric NOT NULL,
    as_of timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    retired_at timestamptz
);
ALTER TABLE journal_opening_positions ALTER COLUMN created_at SET DEFAULT now();
DO $opening$ BEGIN
    -- The composite ownership key depends on an index the adoption migration
    -- rebuilds, so a fresh database gets it here rather than from the entity.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_opening_positions'::regclass AND contype='f'
                   AND pg_get_constraintdef(oid)='FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces(id, user_id) ON DELETE CASCADE') THEN
        ALTER TABLE journal_opening_positions ADD CONSTRAINT journal_opening_positions_workspace_owner_fkey
            FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces(id, user_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_opening_positions'::regclass AND conname='journal_opening_positions_direction_check') THEN
        ALTER TABLE journal_opening_positions ADD CONSTRAINT journal_opening_positions_direction_check CHECK (direction IN ('long','short'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_opening_positions'::regclass AND conname='journal_opening_positions_quantity_check') THEN
        ALTER TABLE journal_opening_positions ADD CONSTRAINT journal_opening_positions_quantity_check CHECK (quantity > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_opening_positions'::regclass AND conname='journal_opening_positions_average_price_check') THEN
        ALTER TABLE journal_opening_positions ADD CONSTRAINT journal_opening_positions_average_price_check CHECK (average_price > 0);
    END IF;
END $opening$;
CREATE UNIQUE INDEX IF NOT EXISTS journal_opening_positions_active
    ON journal_opening_positions (user_id, workspace_id, instrument_key) WHERE retired_at IS NULL;

ALTER TABLE trade_episode_fills ALTER COLUMN brokerage_transaction_id DROP NOT NULL;
ALTER TABLE trade_episode_fills ADD COLUMN IF NOT EXISTS opening_position_id text
    REFERENCES journal_opening_positions(id) ON DELETE CASCADE;
DO $opening_fill$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='trade_episode_fills'::regclass AND conname='trade_episode_fills_source_check') THEN
        ALTER TABLE trade_episode_fills ADD CONSTRAINT trade_episode_fills_source_check
            CHECK (num_nonnulls(brokerage_transaction_id, opening_position_id) = 1);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='trade_episode_fills'::regclass AND conname='trade_episode_fills_opening_entry_check') THEN
        ALTER TABLE trade_episode_fills ADD CONSTRAINT trade_episode_fills_opening_entry_check
            CHECK (opening_position_id IS NULL OR (role = 'entry' AND fee = 0));
    END IF;
END $opening_fill$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_episode_fills_opening
    ON trade_episode_fills (episode_id, opening_position_id) WHERE opening_position_id IS NOT NULL;

CREATE OR REPLACE FUNCTION journal_check_opening_conservation() RETURNS trigger LANGUAGE plpgsql AS $opening_conservation$
DECLARE position_id text; position_quantity numeric; allocated numeric;
BEGIN
    IF TG_OP='DELETE' THEN position_id=OLD.opening_position_id; ELSE position_id=NEW.opening_position_id; END IF;
    IF position_id IS NULL THEN RETURN NULL; END IF;
    SELECT quantity INTO position_quantity FROM journal_opening_positions WHERE id=position_id;
    IF position_quantity IS NULL THEN RETURN NULL; END IF;
    IF EXISTS (SELECT 1 FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id JOIN journal_opening_positions p ON p.id=f.opening_position_id
               WHERE f.opening_position_id=position_id AND (e.user_id<>p.user_id OR e.workspace_id<>p.workspace_id)) THEN
        RAISE EXCEPTION 'Invalid starting position ownership';
    END IF;
    SELECT coalesce(sum(f.quantity),0) INTO allocated FROM trade_episode_fills f JOIN trade_episodes e ON e.id=f.episode_id
        WHERE f.opening_position_id=position_id AND e.retired_at IS NULL;
    IF allocated>position_quantity THEN RAISE EXCEPTION 'Starting position quantity is over-allocated'; END IF;
    RETURN NULL;
END $opening_conservation$;
DROP TRIGGER IF EXISTS journal_opening_conservation ON trade_episode_fills;
CREATE CONSTRAINT TRIGGER journal_opening_conservation AFTER INSERT OR UPDATE OR DELETE ON trade_episode_fills
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_check_opening_conservation();
