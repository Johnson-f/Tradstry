-- =================================================================
-- UPSERT FUNCTION FOR income_statement TABLE
-- =================================================================
-- This function handles the insertion or update of financial metrics
-- in the income_statement table. It ensures that for a given symbol,
-- frequency, fiscal_date, breakdown, and data_provider, there is
-- only one record, which is updated if it already exists.
--
-- The logic uses the ON CONFLICT clause, which is an atomic and
-- efficient way to perform "upsert" operations in PostgreSQL.
-- =================================================================

CREATE OR REPLACE FUNCTION upsert_income_statement_metric(
    p_symbol VARCHAR(20),
    p_frequency VARCHAR(10),
    p_fiscal_date DATE,
    p_breakdown VARCHAR(255),
    p_value NUMERIC(20, 4),
    p_data_provider VARCHAR(50)
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO income_statement (
        symbol,
        frequency,
        fiscal_date,
        breakdown,
        value,
        data_provider,
        updated_at
    )
    VALUES (
        p_symbol,
        p_frequency,
        p_fiscal_date,
        p_breakdown,
        p_value,
        p_data_provider,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, frequency, fiscal_date, breakdown, data_provider)
    DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- FUNCTION COMMENTS
-- =================================================================

COMMENT ON FUNCTION upsert_income_statement_metric(VARCHAR, VARCHAR, DATE, VARCHAR, NUMERIC, VARCHAR) IS
'Inserts a new income statement metric or updates an existing one based on the unique constraint (symbol, frequency, fiscal_date, breakdown, data_provider).';

-- =================================================================
-- USAGE EXAMPLE
-- =================================================================
/*

-- Example of how to call the function:
-- This will insert a new record for AAPL's total revenue or update it if it already exists.

SELECT upsert_income_statement_metric(
    p_symbol => 'AAPL',
    p_frequency => 'annual',
    p_fiscal_date => '2023-09-30',
    p_breakdown => 'Total Revenue',
    p_value => 383285000000.0,
    p_data_provider => 'fmp'
);

*/
-- =================================================================
