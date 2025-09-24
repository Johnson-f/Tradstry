-- Cash Flow Statement Table - GLOBAL SHARED DATA
-- This table stores cash flow statement data for companies, accessible to ALL users.
-- Data is sourced from market data providers and is shared across the platform.

CREATE TABLE IF NOT EXISTS cash_flow (
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
CREATE INDEX IF NOT EXISTS idx_cash_flow_symbol_freq_date ON cash_flow (symbol, frequency, fiscal_date);
CREATE INDEX IF NOT EXISTS idx_cash_flow_breakdown ON cash_flow (breakdown);
CREATE INDEX IF NOT EXISTS idx_cash_flow_provider ON cash_flow (data_provider);

-- Add table and column comments
COMMENT ON TABLE cash_flow IS 'Stores detailed cash flow statement financial data (both annual and quarterly) for companies from various data providers.';

COMMENT ON COLUMN cash_flow.id IS 'Unique identifier for each record.';
COMMENT ON COLUMN cash_flow.symbol IS 'Stock ticker symbol, references company_info(symbol).';
COMMENT ON COLUMN cash_flow.frequency IS 'Frequency of the report: ''annual'' or ''quarterly''.';
COMMENT ON COLUMN cash_flow.fiscal_date IS 'The end date of the fiscal period for the report.';
COMMENT ON COLUMN cash_flow.breakdown IS 'The financial metric name (e.g., ''Operating Cash Flow'', ''Free Cash Flow'').';
COMMENT ON COLUMN cash_flow.value IS 'The numerical value of the financial metric. Can be NULL if not reported.';
COMMENT ON COLUMN cash_flow.data_provider IS 'The source of the market data (e.g., ''fmp'', ''alpha_vantage'').';
COMMENT ON COLUMN cash_flow.created_at IS 'Timestamp of when the record was first created.';
COMMENT ON COLUMN cash_flow.updated_at IS 'Timestamp of when the record was last updated.';

-- =====================================================
-- CASH FLOW TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed.
-- =====================================================

-- Enable Row Level Security on the table
ALTER TABLE cash_flow ENABLE ROW LEVEL SECURITY;

-- Grant SELECT permission to all authenticated users
GRANT SELECT ON cash_flow TO PUBLIC;

-- Revoke modification permissions
REVOKE INSERT, UPDATE, DELETE ON cash_flow FROM PUBLIC;

-- Create policies to enforce read-only access for users
CREATE POLICY "cash_flow_select_policy" ON cash_flow
    FOR SELECT
    USING (true); -- Allow all users to read all rows

CREATE POLICY "cash_flow_insert_policy" ON cash_flow
    FOR INSERT
    WITH CHECK (false); -- Deny all insert operations

CREATE POLICY "cash_flow_update_policy" ON cash_flow
    FOR UPDATE
    USING (false)
    WITH CHECK (false); -- Deny all update operations

CREATE POLICY "cash_flow_delete_policy" ON cash_flow
    FOR DELETE
    USING (false); -- Deny all delete operations
