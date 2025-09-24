-- Balance Sheet Table - GLOBAL SHARED DATA
-- This table stores balance sheet data for companies, accessible to ALL users.
-- Data is sourced from market data providers and is shared across the platform.

CREATE TABLE IF NOT EXISTS balance_sheet (
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
CREATE INDEX IF NOT EXISTS idx_balance_sheet_symbol_freq_date ON balance_sheet (symbol, frequency, fiscal_date);
CREATE INDEX IF NOT EXISTS idx_balance_sheet_breakdown ON balance_sheet (breakdown);
CREATE INDEX IF NOT EXISTS idx_balance_sheet_provider ON balance_sheet (data_provider);

-- Add table and column comments
COMMENT ON TABLE balance_sheet IS 'Stores detailed balance sheet financial data (both annual and quarterly) for companies from various data providers.';

COMMENT ON COLUMN balance_sheet.id IS 'Unique identifier for each record.';
COMMENT ON COLUMN balance_sheet.symbol IS 'Stock ticker symbol, references company_info(symbol).';
COMMENT ON COLUMN balance_sheet.frequency IS 'Frequency of the report: ''annual'' or ''quarterly''.';
COMMENT ON COLUMN balance_sheet.fiscal_date IS 'The end date of the fiscal period for the report.';
COMMENT ON COLUMN balance_sheet.breakdown IS 'The financial metric name (e.g., ''Total Assets'', ''Total Liabilities'').';
COMMENT ON COLUMN balance_sheet.value IS 'The numerical value of the financial metric. Can be NULL if not reported.';
COMMENT ON COLUMN balance_sheet.data_provider IS 'The source of the market data (e.g., ''fmp'', ''alpha_vantage'').';
COMMENT ON COLUMN balance_sheet.created_at IS 'Timestamp of when the record was first created.';
COMMENT ON COLUMN balance_sheet.updated_at IS 'Timestamp of when the record was last updated.';

-- =====================================================
-- BALANCE SHEET TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed.
-- =====================================================

-- Enable Row Level Security on the table
ALTER TABLE balance_sheet ENABLE ROW LEVEL SECURITY;

-- Grant SELECT permission to all authenticated users
GRANT SELECT ON balance_sheet TO PUBLIC;

-- Revoke modification permissions
REVOKE INSERT, UPDATE, DELETE ON balance_sheet FROM PUBLIC;

-- Create policies to enforce read-only access for users
CREATE POLICY "balance_sheet_select_policy" ON balance_sheet
    FOR SELECT
    USING (true); -- Allow all users to read all rows

CREATE POLICY "balance_sheet_insert_policy" ON balance_sheet
    FOR INSERT
    WITH CHECK (false); -- Deny all insert operations

CREATE POLICY "balance_sheet_update_policy" ON balance_sheet
    FOR UPDATE
    USING (false)
    WITH CHECK (false); -- Deny all update operations

CREATE POLICY "balance_sheet_delete_policy" ON balance_sheet
    FOR DELETE
    USING (false); -- Deny all delete operations
