-- Exact broker links identify a recorded trade more reliably than its display
-- symbol, which older option entries often store as just the underlying ticker.
DROP FUNCTION journal_manual_hold(text,text,text,timestamptz,timestamptz,text[],text,jsonb);

CREATE FUNCTION journal_manual_hold(
    p_entry text, p_user text, p_workspace text, p_symbol text, p_open timestamptz, p_close timestamptz,
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
    IF EXISTS (
        SELECT 1 FROM journal_brokerage_links l
        JOIN brokerage_transactions t ON t.id=l.brokerage_transaction_id AND t.user_id=p_user AND t.workspace_id=p_workspace
        WHERE l.journal_entry_id=p_entry AND l.user_id=p_user
    ) THEN
        SELECT coalesce(array_agg(b.id ORDER BY b.id), '{}') INTO duplicates
        FROM journal_entries b
        WHERE b.user_id=p_user AND b.workspace_id=p_workspace AND b.source_kind='broker'
          AND b.deleted_at IS NULL AND b.retired_at IS NULL AND b.id<>p_entry AND b.id<>ALL(p_separate)
          AND EXISTS (
              SELECT 1 FROM journal_brokerage_links own
              JOIN journal_brokerage_links other ON other.brokerage_transaction_id=own.brokerage_transaction_id AND other.user_id=own.user_id
              JOIN brokerage_transactions t ON t.id=own.brokerage_transaction_id AND t.user_id=p_user AND t.workspace_id=p_workspace
              WHERE own.journal_entry_id=p_entry AND own.user_id=p_user AND other.journal_entry_id=b.id
          );
    ELSE
        duplicates = journal_manual_duplicates(p_user, p_workspace, p_symbol, p_open, p_close, p_separate);
    END IF;
    IF cardinality(duplicates)>0 THEN
        lifecycle_state = 'incomplete';
        issue_json = jsonb_build_object(
            'code', 'possible_duplicate', 'possible_duplicates', to_jsonb(duplicates),
            'message', 'This trade overlaps a trade imported from your broker. Merge them if they are the same trade, or keep this one as a separate trade.'
        );
    ELSIF p_issue->>'code'='possible_duplicate' THEN
        lifecycle_state = 'closed';
        issue_json = NULL;
    END IF;
END $hold$;

CREATE OR REPLACE FUNCTION journal_hold_manual_duplicate() RETURNS trigger LANGUAGE plpgsql AS $trigger$
BEGIN
    IF NEW.source_kind<>'manual' OR NEW.deleted_at IS NOT NULL OR NEW.retired_at IS NOT NULL
       OR current_setting('tradstry.journal_writer',true)='on' THEN
        RETURN NEW;
    END IF;
    IF TG_OP='UPDATE' AND ROW(NEW.workspace_id,NEW.symbol,NEW.open_date,NEW.close_date,NEW.separate_from)
        IS NOT DISTINCT FROM ROW(OLD.workspace_id,OLD.symbol,OLD.open_date,OLD.close_date,OLD.separate_from) THEN
        RETURN NEW;
    END IF;
    SELECT h.lifecycle_state,h.issue_json INTO NEW.lifecycle_state,NEW.issue_json
    FROM journal_manual_hold(NEW.id,NEW.user_id,NEW.workspace_id,NEW.symbol,NEW.open_date,NEW.close_date,
                             NEW.separate_from,NEW.lifecycle_state,NEW.issue_json) h;
    RETURN NEW;
END $trigger$;

CREATE OR REPLACE FUNCTION journal_refresh_manual_holds(p_user text,p_workspace text) RETURNS integer LANGUAGE plpgsql AS $refresh$
DECLARE changed integer;
BEGIN
    WITH next AS (
        SELECT j.id,h.lifecycle_state,h.issue_json
        FROM journal_entries j,
             LATERAL journal_manual_hold(j.id,j.user_id,j.workspace_id,j.symbol,j.open_date,j.close_date,
                                         j.separate_from,j.lifecycle_state,j.issue_json) h
        WHERE j.user_id=p_user AND j.workspace_id=p_workspace AND j.source_kind='manual'
          AND j.deleted_at IS NULL AND j.retired_at IS NULL
          AND (j.lifecycle_state,j.issue_json) IS DISTINCT FROM (h.lifecycle_state,h.issue_json)
    )
    UPDATE journal_entries j SET lifecycle_state=next.lifecycle_state,issue_json=next.issue_json
    FROM next WHERE j.id=next.id AND j.user_id=p_user;
    GET DIAGNOSTICS changed = ROW_COUNT;
    RETURN changed;
END $refresh$;
