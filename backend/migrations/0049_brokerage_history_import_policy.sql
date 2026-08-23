ALTER TABLE brokerage_connections
    ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;

ALTER TABLE brokerage_sync_state
    ADD COLUMN IF NOT EXISTS transaction_import_mode TEXT,
    ADD COLUMN IF NOT EXISTS transaction_import_start_date DATE,
    ADD COLUMN IF NOT EXISTS transaction_import_configured_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS transaction_initial_import_completed_at TIMESTAMPTZ;

ALTER TABLE brokerage_reconciliation_state
    ADD COLUMN IF NOT EXISTS transaction_import_start_date DATE;

ALTER TABLE brokerage_sync_state
    DROP CONSTRAINT IF EXISTS brokerage_sync_state_import_policy_check;

ALTER TABLE brokerage_sync_state
    ADD CONSTRAINT brokerage_sync_state_import_policy_check CHECK (
        (
            transaction_import_mode IS NULL
            AND transaction_import_start_date IS NULL
            AND transaction_import_configured_at IS NULL
        )
        OR (
            transaction_import_mode = 'all'
            AND transaction_import_start_date IS NULL
            AND transaction_import_configured_at IS NOT NULL
        )
        OR (
            transaction_import_mode IN ('one_year', 'two_years', 'custom')
            AND transaction_import_start_date IS NOT NULL
            AND transaction_import_configured_at IS NOT NULL
        )
    );

UPDATE brokerage_connections
SET setup_completed_at = COALESCE(setup_completed_at, updated_at, now())
WHERE snaptrade_connection_id IS NOT NULL
  AND snaptrade_account_id IS NOT NULL;

INSERT INTO brokerage_sync_state (
    user_id,
    workspace_id,
    snaptrade_account_id,
    transaction_import_mode,
    transaction_import_configured_at
)
SELECT
    user_id,
    workspace_id,
    snaptrade_account_id,
    'all',
    COALESCE(setup_completed_at, updated_at, now())
FROM brokerage_connections
WHERE snaptrade_connection_id IS NOT NULL
  AND snaptrade_account_id IS NOT NULL
ON CONFLICT (user_id, workspace_id, snaptrade_account_id) DO UPDATE SET
    transaction_import_mode = COALESCE(
        brokerage_sync_state.transaction_import_mode,
        EXCLUDED.transaction_import_mode
    ),
    transaction_import_configured_at = COALESCE(
        brokerage_sync_state.transaction_import_configured_at,
        EXCLUDED.transaction_import_configured_at
    ),
    updated_at = now();
