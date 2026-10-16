-- A client-generated ID cannot distinguish a repeated submission of the same
-- completed manual trade. Deleted entries remain available for recovery.
CREATE UNIQUE INDEX journal_manual_trade_identity ON journal_entries (
    user_id, workspace_id, upper(btrim(symbol)), open_date, close_date,
    entry_price, exit_price, position_size, lower(btrim(trade_type)), contract_multiplier
)
WHERE source_kind='manual' AND deleted_at IS NULL AND retired_at IS NULL
  AND open_date IS NOT NULL AND close_date IS NOT NULL
  AND entry_price IS NOT NULL AND exit_price IS NOT NULL AND position_size IS NOT NULL
  AND btrim(symbol)<>'';
