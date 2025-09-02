-- Dividend Data Table - GLOBAL SHARED DATA
-- This table stores dividend data accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores dividend payments, schedules, and history from market data providers

CREATE TABLE IF NOT EXISTS dividend_data (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Dividend schedule dates (shared globally)
    declaration_date DATE,
    ex_dividend_date DATE NOT NULL,
    record_date DATE,
    payment_date DATE,

    -- Dividend amount and type
    dividend_amount DECIMAL(10,4) NOT NULL,
    dividend_type VARCHAR(20) DEFAULT 'regular',  -- 'regular', 'special', 'stock', etc.
    currency VARCHAR(3) DEFAULT 'USD',

    -- Dividend frequency and status
    frequency VARCHAR(20),  -- 'annual', 'semi-annual', 'quarterly', 'monthly'
    dividend_status VARCHAR(20) DEFAULT 'active',  -- 'active', 'suspended', 'terminated'

    -- Additional dividend metrics
    dividend_yield DECIMAL(7,4),  -- Current dividend yield
    payout_ratio DECIMAL(7,4),    -- Dividend payout ratio
    consecutive_years INTEGER,     -- Years of consecutive dividend payments

    -- Tax information
    qualified_dividend BOOLEAN DEFAULT TRUE,
    tax_rate DECIMAL(7,4),

    -- Period information
    fiscal_year INTEGER,
    fiscal_quarter INTEGER CHECK (fiscal_quarter BETWEEN 1 AND 4),

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per symbol per ex-dividend date per provider
    UNIQUE(symbol, ex_dividend_date, data_provider)
);

-- Create indexes for dividend analysis queries (after table creation)
CREATE INDEX IF NOT EXISTS idx_dividend_data_symbol ON dividend_data (symbol);
CREATE INDEX IF NOT EXISTS idx_dividend_data_ex_dividend_date ON dividend_data (ex_dividend_date DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_data_payment_date ON dividend_data (payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_data_amount ON dividend_data (dividend_amount DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_data_yield ON dividend_data (dividend_yield DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_data_provider ON dividend_data (data_provider);
CREATE INDEX IF NOT EXISTS idx_dividend_data_symbol_date ON dividend_data (symbol, ex_dividend_date DESC);
CREATE INDEX IF NOT EXISTS idx_dividend_data_frequency ON dividend_data (frequency);

-- Add table comment
COMMENT ON TABLE dividend_data IS 'Dividend payments, schedules, and history from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN dividend_data.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN dividend_data.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN dividend_data.declaration_date IS 'Date when dividend was declared by company';
COMMENT ON COLUMN dividend_data.ex_dividend_date IS 'Date when stock trades without dividend (must own before this date)';
COMMENT ON COLUMN dividend_data.record_date IS 'Date when shareholders of record are determined';
COMMENT ON COLUMN dividend_data.payment_date IS 'Date when dividend will be paid to shareholders';
COMMENT ON COLUMN dividend_data.dividend_amount IS 'Dividend amount per share';
COMMENT ON COLUMN dividend_data.dividend_type IS 'Type of dividend (regular, special, stock, etc.)';
COMMENT ON COLUMN dividend_data.currency IS 'Currency of the dividend payment';
COMMENT ON COLUMN dividend_data.frequency IS 'Dividend payment frequency';
COMMENT ON COLUMN dividend_data.dividend_status IS 'Current status of the dividend program';
COMMENT ON COLUMN dividend_data.dividend_yield IS 'Current dividend yield as decimal (0.025 = 2.5%)';
COMMENT ON COLUMN dividend_data.payout_ratio IS 'Dividend payout ratio as decimal (0.35 = 35%)';
COMMENT ON COLUMN dividend_data.consecutive_years IS 'Number of consecutive years dividend has been paid';
COMMENT ON COLUMN dividend_data.qualified_dividend IS 'Whether dividend qualifies for lower tax rate';
COMMENT ON COLUMN dividend_data.tax_rate IS 'Applicable tax rate for the dividend';
COMMENT ON COLUMN dividend_data.fiscal_year IS 'Fiscal year associated with the dividend';
COMMENT ON COLUMN dividend_data.fiscal_quarter IS 'Fiscal quarter associated with the dividend';
COMMENT ON COLUMN dividend_data.data_provider IS 'Market data provider (alpha_vantage, finnhub, fmp, etc.)';

-- =====================================================
-- DIVIDEND DATA TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from dividend_data table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from dividend_data table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON dividend_data TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON dividend_data FROM PUBLIC;
REVOKE UPDATE ON dividend_data FROM PUBLIC;
REVOKE DELETE ON dividend_data FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE dividend_data ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "dividend_data_select_policy" ON dividend_data
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "dividend_data_insert_policy" ON dividend_data
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "dividend_data_update_policy" ON dividend_data
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "dividend_data_delete_policy" ON dividend_data
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR DIVIDEND_DATA TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for dividend analysis and display
   - Users cannot modify dividend data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic dividend data updates

3. DATA INTEGRITY:
   - Dividend data should be treated as immutable by users
   - Only trusted sources can update dividend information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/