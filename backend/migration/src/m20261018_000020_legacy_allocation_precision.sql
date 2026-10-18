-- The retired importer converted binary floats directly to decimals. Only repair
-- complete allocations that round back to the exact original broker float and
-- belong exclusively to unpublished, blocked automatic episodes.
WITH rounding AS (
    SELECT b.id, abs(b.units::text::numeric) - sum(f.quantity) AS adjustment,
           (array_agg(f.id ORDER BY f.quantity DESC, f.id))[1] AS fill_id
    FROM brokerage_transactions b
    JOIN trade_episode_fills f ON f.brokerage_transaction_id = b.id
    JOIN trade_episodes e ON e.id = f.episode_id AND e.retired_at IS NULL
    WHERE b.units IS NOT NULL
    GROUP BY b.id
    HAVING sum(f.quantity) <> abs(b.units::text::numeric)
       AND sum(f.quantity)::double precision = abs(b.units)
       AND bool_and(e.user_id = b.user_id AND e.workspace_id = b.workspace_id
           AND e.status = 'blocked' AND e.grouping_source = 'automatic'
           AND NOT EXISTS (SELECT 1 FROM journal_entries j WHERE j.episode_id = e.id)
           AND NOT EXISTS (SELECT 1 FROM brokerage_episode_publications p WHERE p.episode_id = e.id))
)
UPDATE trade_episode_fills f
SET quantity = f.quantity + r.adjustment
FROM rounding r
WHERE f.id = r.fill_id AND f.quantity + r.adjustment > 0;
