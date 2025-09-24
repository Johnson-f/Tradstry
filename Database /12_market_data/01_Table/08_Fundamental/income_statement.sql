-- Income Statement Table - GLOBAL SHARED DATA
-- This table stores income statement data for companies, accessible to ALL users.
-- Data is sourced from market data providers and is shared across the platform.

CREATE TABLE IF NOT EXISTS income_statement (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    frequency VARCHAR(10) NOT NULL, -- 'annual' or 'quarterly'
    fiscal_date DATE NOT NULL,
    breakdown VARCHAR(255) NOT NULL,
    value NUMERIC(20, 4), -- Using NUMERIC for precision. Can be NULL for '*' or missing values.
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per metric per period per provider
    UNIQUE(symbol, frequency, fiscal_date, breakdown, data_provider)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_income_statement_symbol_freq_date ON income_statement (symbol, frequency, fiscal_date);
CREATE INDEX IF NOT EXISTS idx_income_statement_breakdown ON income_statement (breakdown);
CREATE INDEX IF NOT EXISTS idx_income_statement_provider ON income_statement (data_provider);

-- Add table and column comments
COMMENT ON TABLE income_statement IS 'Stores detailed income statement financial data (both annual and quarterly) for companies from various data providers.';

COMMENT ON COLUMN income_statement.id IS 'Unique identifier for each record.';
COMMENT ON COLUMN income_statement.symbol IS 'Stock ticker symbol, references company_info(symbol).';
COMMENT ON COLUMN income_statement.frequency IS 'Frequency of the report: ''annual'' or ''quarterly''.';
COMMENT ON COLUMN income_statement.fiscal_date IS 'The end date of the fiscal period for the report.';
COMMENT ON COLUMN income_statement.breakdown IS 'The financial metric name (e.g., ''Total Revenue'', ''Net Income'').';
COMMENT ON COLUMN income_statement.value IS 'The numerical value of the financial metric. Can be NULL if not reported.';
COMMENT ON COLUMN income_statement.data_provider IS 'The source of the market data (e.g., ''fmp'', ''alpha_vantage'').';
COMMENT ON COLUMN income_statement.created_at IS 'Timestamp of when the record was first created.';
COMMENT ON COLUMN income_statement.updated_at IS 'Timestamp of when the record was last updated.';

-- =====================================================
-- INCOME STATEMENT TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed.
-- =====================================================

-- Enable Row Level Security on the table
ALTER TABLE income_statement ENABLE ROW LEVEL SECURITY;

-- Grant SELECT permission to all authenticated users
GRANT SELECT ON income_statement TO PUBLIC;

-- Revoke modification permissions
REVOKE INSERT, UPDATE, DELETE ON income_statement FROM PUBLIC;

-- Create policies to enforce read-only access for users
CREATE POLICY "income_statement_select_policy" ON income_statement
    FOR SELECT
    USING (true); -- Allow all users to read all rows

CREATE POLICY "income_statement_insert_policy" ON income_statement
    FOR INSERT
    WITH CHECK (false); -- Deny all insert operations

CREATE POLICY "income_statement_update_policy" ON income_statement
    FOR UPDATE
    USING (false)
    WITH CHECK (false); -- Deny all update operations

CREATE POLICY "income_statement_delete_policy" ON income_statement
    FOR DELETE
    USING (false); -- Deny all delete operations
