WITH coverage AS (
    SELECT j.id, s.source_id,
           abs(b.units::text::numeric) AS broker_quantity,
           sum(f.quantity) AS assigned_quantity,
           bool_and(e.status = 'ready' AND owner.id IS NOT NULL
               AND owner.lifecycle_state = 'closed') AS completed,
           min(owner.id) AS first_owner,
           max(owner.id) AS last_owner
    FROM journal_entries j
    CROSS JOIN LATERAL jsonb_array_elements_text(j.issue_json->'source_ids') s(source_id)
    LEFT JOIN brokerage_transactions b ON b.id = s.source_id
        AND b.user_id = j.user_id AND b.workspace_id = j.workspace_id
    LEFT JOIN trade_episode_fills f ON f.brokerage_transaction_id = b.id
        AND EXISTS (SELECT 1 FROM trade_episodes active WHERE active.id = f.episode_id
            AND active.user_id = j.user_id AND active.workspace_id = j.workspace_id
            AND active.retired_at IS NULL)
    LEFT JOIN trade_episodes e ON e.id = f.episode_id
    LEFT JOIN journal_entries owner ON owner.episode_id = e.id
        AND owner.user_id = j.user_id AND owner.workspace_id = j.workspace_id
        AND owner.deleted_at IS NULL AND owner.retired_at IS NULL
    WHERE j.user_id = $1 AND j.workspace_id = $2
        AND j.source_kind = 'broker' AND j.lifecycle_state = 'incomplete'
        AND j.episode_id IS NULL AND j.deleted_at IS NULL AND j.retired_at IS NULL
    GROUP BY j.id, s.source_id, b.units
), covered AS (
    SELECT id,
        CASE WHEN min(first_owner) = max(last_owner) THEN min(first_owner) END AS successor_id
    FROM coverage
    GROUP BY id
    HAVING bool_and(coalesce(completed AND assigned_quantity = broker_quantity, false))
)
UPDATE journal_entries j
SET retired_at = now(), successor_id = c.successor_id,
    record_version = j.record_version + 1, updated_at = now()
FROM covered c
WHERE j.id = c.id;
