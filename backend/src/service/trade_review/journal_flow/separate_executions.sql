WITH next AS (
    SELECT m.id, ARRAY(
        SELECT DISTINCT x FROM unnest(m.separate_from || ARRAY(
            SELECT b.id FROM journal_entries b
            WHERE b.user_id=m.user_id AND b.workspace_id=m.workspace_id AND b.source_kind='broker'
              AND b.deleted_at IS NULL AND b.retired_at IS NULL
              AND EXISTS (SELECT 1 FROM journal_brokerage_links l WHERE l.journal_entry_id=b.id AND l.user_id=m.user_id)
              AND NOT EXISTS (
                  SELECT 1 FROM journal_brokerage_links l
                  WHERE l.journal_entry_id=b.id AND l.user_id=m.user_id
                    AND l.brokerage_transaction_id <> ALL(m.separate_from_executions)
              )
        )) x ORDER BY x
    ) AS ids
    FROM journal_entries m
    WHERE m.user_id=$1 AND m.workspace_id=$2 AND m.source_kind='manual'
      AND cardinality(m.separate_from_executions)>0 AND m.deleted_at IS NULL AND m.retired_at IS NULL
)
UPDATE journal_entries j SET separate_from=next.ids
FROM next WHERE j.id=next.id AND j.user_id=$1 AND j.separate_from IS DISTINCT FROM next.ids
