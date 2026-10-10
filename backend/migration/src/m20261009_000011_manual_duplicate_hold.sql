-- A manual trade that overlaps a broker trade waits for the user, mirroring how
-- broker history that overlaps a manual trade already waits (projection.rs).
-- Until the user merges it or keeps it separate it is 'incomplete', so no
-- report counts the same trade twice.

ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS separate_from text[] NOT NULL DEFAULT '{}';

-- The one overlap rule: a shared symbol and overlapping open-to-close days (UTC).
-- A trade with no close is still open, so it overlaps everything after it opened.
CREATE OR REPLACE FUNCTION journal_trades_overlap(
    a_symbols text[], a_open timestamptz, a_close timestamptz,
    b_symbols text[], b_open timestamptz, b_close timestamptz
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $overlap$
    SELECT a_open IS NOT NULL AND b_open IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM unnest(a_symbols) a JOIN unnest(b_symbols) b ON upper(btrim(a))=upper(btrim(b))
           WHERE btrim(a)<>''
       )
       AND (a_open AT TIME ZONE 'UTC')::date <= (coalesce(b_close,'infinity'::timestamptz) AT TIME ZONE 'UTC')::date
       AND (coalesce(a_close,'infinity'::timestamptz) AT TIME ZONE 'UTC')::date >= (b_open AT TIME ZONE 'UTC')::date
$overlap$;

-- The live broker trades a manual trade may duplicate, skipping those the user
-- already said are separate. Options also match on their underlying. An open
-- broker trade is compared by its opening day, as projection.rs does.
CREATE OR REPLACE FUNCTION journal_manual_duplicates(
    p_user text, p_workspace text, p_symbol text, p_open timestamptz, p_close timestamptz, p_separate text[]
) RETURNS text[] LANGUAGE sql STABLE AS $duplicates$
    SELECT coalesce(array_agg(b.id ORDER BY b.id), '{}')
    FROM journal_entries b
    LEFT JOIN trade_episodes e ON e.id=b.episode_id AND e.user_id=b.user_id AND e.workspace_id=b.workspace_id
    WHERE b.user_id=p_user AND b.workspace_id=p_workspace AND b.source_kind='broker'
      AND b.deleted_at IS NULL AND b.retired_at IS NULL AND b.id <> ALL(p_separate)
      AND journal_trades_overlap(
          ARRAY[p_symbol], p_open, p_close,
          ARRAY[b.symbol, e.instrument_json->>'underlying'], coalesce(b.open_date,e.opened_at),
          coalesce(b.close_date,e.closed_at,b.open_date,e.opened_at)
      )
$duplicates$;

-- The lifecycle state and issue a manual trade should have now. Only a
-- possible-duplicate hold is ever set or cleared here.
CREATE OR REPLACE FUNCTION journal_manual_hold(
    p_user text, p_workspace text, p_symbol text, p_open timestamptz, p_close timestamptz,
    p_separate text[], p_lifecycle text, p_issue jsonb,
    OUT lifecycle_state text, OUT issue_json jsonb
) LANGUAGE plpgsql STABLE AS $hold$
DECLARE duplicates text[];
BEGIN
    lifecycle_state = p_lifecycle;
    issue_json = p_issue;
    IF NOT EXISTS (SELECT 1 FROM journal_workspace_state s WHERE s.workspace_id=p_workspace AND s.user_id=p_user AND s.enabled) THEN
        RETURN;
    END IF;
    duplicates = journal_manual_duplicates(p_user, p_workspace, p_symbol, p_open, p_close, p_separate);
    IF cardinality(duplicates) > 0 THEN
        lifecycle_state = 'incomplete';
        issue_json = jsonb_build_object(
            'code', 'possible_duplicate',
            'possible_duplicates', to_jsonb(duplicates),
            'message', 'This trade overlaps a trade imported from your broker. Merge them if they are the same trade, or keep this one as a separate trade.'
        );
    ELSIF p_issue->>'code' = 'possible_duplicate' THEN
        lifecycle_state = 'closed';
        issue_json = NULL;
    END IF;
END $hold$;

-- Every user write to a manual trade is checked. Journal-owner writes (sync,
-- merges, undo) set tradstry.journal_writer and refresh holds themselves.
CREATE OR REPLACE FUNCTION journal_hold_manual_duplicate() RETURNS trigger LANGUAGE plpgsql AS $trigger$
BEGIN
    IF NEW.source_kind <> 'manual' OR NEW.deleted_at IS NOT NULL OR NEW.retired_at IS NOT NULL
       OR current_setting('tradstry.journal_writer', true) = 'on' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND ROW(NEW.workspace_id, NEW.symbol, NEW.open_date, NEW.close_date, NEW.separate_from)
        IS NOT DISTINCT FROM ROW(OLD.workspace_id, OLD.symbol, OLD.open_date, OLD.close_date, OLD.separate_from) THEN
        RETURN NEW;
    END IF;
    SELECT h.lifecycle_state, h.issue_json INTO NEW.lifecycle_state, NEW.issue_json
    FROM journal_manual_hold(NEW.user_id, NEW.workspace_id, NEW.symbol, NEW.open_date, NEW.close_date,
                             NEW.separate_from, NEW.lifecycle_state, NEW.issue_json) h;
    RETURN NEW;
END $trigger$;

-- Named to run before journal_entry_revision, so a hold counts as a material change.
DROP TRIGGER IF EXISTS journal_entry_duplicate_hold ON journal_entries;
CREATE TRIGGER journal_entry_duplicate_hold BEFORE INSERT OR UPDATE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION journal_hold_manual_duplicate();

-- Re-checks a workspace's manual trades: after a sync changes broker trades, and
-- once here for duplicates that already exist. Money is never changed.
CREATE OR REPLACE FUNCTION journal_refresh_manual_holds(p_user text, p_workspace text) RETURNS integer LANGUAGE plpgsql AS $refresh$
DECLARE changed integer;
BEGIN
    WITH next AS (
        SELECT j.id, h.lifecycle_state, h.issue_json
        FROM journal_entries j,
             LATERAL journal_manual_hold(j.user_id, j.workspace_id, j.symbol, j.open_date, j.close_date,
                                         j.separate_from, j.lifecycle_state, j.issue_json) h
        WHERE j.user_id=p_user AND j.workspace_id=p_workspace AND j.source_kind='manual'
          AND j.deleted_at IS NULL AND j.retired_at IS NULL
          AND (j.lifecycle_state, j.issue_json) IS DISTINCT FROM (h.lifecycle_state, h.issue_json)
    )
    UPDATE journal_entries j SET lifecycle_state=next.lifecycle_state, issue_json=next.issue_json
    FROM next WHERE j.id=next.id AND j.user_id=p_user;
    GET DIAGNOSTICS changed = ROW_COUNT;
    RETURN changed;
END $refresh$;

SELECT journal_refresh_manual_holds(s.user_id, s.workspace_id) FROM journal_workspace_state s WHERE s.enabled;
