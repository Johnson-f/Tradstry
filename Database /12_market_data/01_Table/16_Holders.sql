-- =============================================
-- Table: holders
-- Description: Stores comprehensive holder information for stocks including institutional, mutual fund, and insider data
-- =============================================

CREATE TABLE IF NOT EXISTS public.holders (
    -- Primary identification
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    holder_type VARCHAR(20) NOT NULL CHECK (holder_type IN ('institutional', 'mutualfund', 'insider_transactions', 'insider_purchases', 'insider_roster')),
    
    -- Common holder information (used by institutional, mutualfund, insider_transactions, insider_roster)
    holder_name VARCHAR(500),
    shares BIGINT,
    value BIGINT, -- Value in cents to avoid floating point precision issues
    date_reported TIMESTAMPTZ,
    
    -- Insider-specific fields (insider_transactions, insider_roster)
    insider_position VARCHAR(100),
    transaction_type VARCHAR(50),
    ownership_type VARCHAR(10), -- 'D' for Direct, 'I' for Indirect
    
    -- Insider roster specific fields
    most_recent_transaction VARCHAR(100),
    latest_transaction_date TIMESTAMPTZ,
    shares_owned_directly BIGINT,
    shares_owned_indirectly BIGINT,
    position_direct_date TIMESTAMPTZ,
    
    -- Insider purchases summary fields (for insider_purchases type)
    summary_period VARCHAR(10), -- e.g., '6m'
    purchases_shares BIGINT,
    purchases_transactions INTEGER,
    sales_shares BIGINT,
    sales_transactions INTEGER,
    net_shares BIGINT,
    net_transactions INTEGER,
    total_insider_shares BIGINT,
    net_percent_insider_shares DECIMAL(10,6),
    buy_percent_insider_shares DECIMAL(10,6),
    sell_percent_insider_shares DECIMAL(10,6),
    
    -- Metadata
    data_source VARCHAR(50) DEFAULT 'finance_api',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_institutional_holder UNIQUE (symbol, holder_type, holder_name, date_reported) 
        WHERE holder_type IN ('institutional', 'mutualfund'),
    CONSTRAINT unique_insider_transaction UNIQUE (symbol, holder_type, holder_name, date_reported, transaction_type, shares, value)
        WHERE holder_type = 'insider_transactions',
    CONSTRAINT unique_insider_roster UNIQUE (symbol, holder_type, holder_name)
        WHERE holder_type = 'insider_roster',
    CONSTRAINT unique_insider_purchases UNIQUE (symbol, holder_type, summary_period)
        WHERE holder_type = 'insider_purchases'
);

-- =============================================
-- Indexes for performance optimization
-- =============================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_holders_symbol_type ON public.holders(symbol, holder_type);
CREATE INDEX IF NOT EXISTS idx_holders_symbol_date ON public.holders(symbol, date_reported DESC) WHERE date_reported IS NOT NULL;

-- Holder-specific indexes
CREATE INDEX IF NOT EXISTS idx_holders_institutional ON public.holders(symbol, holder_name, date_reported) 
    WHERE holder_type IN ('institutional', 'mutualfund');

CREATE INDEX IF NOT EXISTS idx_holders_insider_name ON public.holders(symbol, holder_name, insider_position) 
    WHERE holder_type IN ('insider_transactions', 'insider_roster');

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_holders_shares ON public.holders(symbol, shares DESC) WHERE shares IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_holders_value ON public.holders(symbol, value DESC) WHERE value IS NOT NULL;

-- Time-based indexes
CREATE INDEX IF NOT EXISTS idx_holders_created_at ON public.holders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_holders_updated_at ON public.holders(updated_at DESC);

-- =============================================
-- SECURITY POLICY - GLOBAL SHARED DATA (READ-ONLY FOR USERS)
-- =============================================

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON public.holders TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON public.holders FROM PUBLIC;
REVOKE UPDATE ON public.holders FROM PUBLIC;
REVOKE DELETE ON public.holders FROM PUBLIC;

-- 3. ENABLE ROW LEVEL SECURITY WITH READ-ONLY POLICIES
ALTER TABLE public.holders ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "holders_select_policy" ON public.holders
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "holders_insert_policy" ON public.holders
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "holders_update_policy" ON public.holders
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "holders_delete_policy" ON public.holders
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =============================================
-- Comments for documentation
-- =============================================

COMMENT ON TABLE public.holders IS 'Comprehensive holder information for stocks including institutional investors, mutual funds, and insider data';

COMMENT ON COLUMN public.holders.symbol IS 'Stock symbol (e.g., AAPL, TSLA)';
COMMENT ON COLUMN public.holders.holder_type IS 'Type of holder: institutional, mutualfund, insider_transactions, insider_purchases, insider_roster';
COMMENT ON COLUMN public.holders.holder_name IS 'Name of the holder/institution/insider';
COMMENT ON COLUMN public.holders.shares IS 'Number of shares held';
COMMENT ON COLUMN public.holders.value IS 'Value of holdings in cents';
COMMENT ON COLUMN public.holders.date_reported IS 'Date when the holding was reported';
COMMENT ON COLUMN public.holders.insider_position IS 'Position of insider (CEO, CFO, Director, etc.)';
COMMENT ON COLUMN public.holders.transaction_type IS 'Type of insider transaction';
COMMENT ON COLUMN public.holders.ownership_type IS 'D for Direct ownership, I for Indirect ownership';
COMMENT ON COLUMN public.holders.summary_period IS 'Time period for insider purchase summaries (e.g., 6m)';
COMMENT ON COLUMN public.holders.net_percent_insider_shares IS 'Net percentage of insider shares as decimal (0.001 = 0.1%)';

-- =============================================
-- Trigger for updated_at timestamp
-- =============================================

CREATE OR REPLACE FUNCTION update_holders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_holders_updated_at
    BEFORE UPDATE ON public.holders
    FOR EACH ROW
    EXECUTE FUNCTION update_holders_updated_at();

-- =============================================
-- SECURITY PRINCIPLES FOR HOLDERS DATA
-- =============================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for holder analysis and display
   - Users cannot modify holders data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and API ingestion processes can INSERT/UPDATE
   - Maintains data accuracy and consistency from finance-query API
   - Supports automatic holder data updates from external sources

3. DATA INTEGRITY:
   - Holders data should be treated as immutable by users
   - Only trusted API sources can update holder information
   - Supports regulatory compliance requirements for financial data

SCHEMA DESIGN NOTES:

- Designed to match finance-query.onrender.com API response structure
- Single table handles all holder types: institutional, mutualfund, insider_transactions, insider_purchases, insider_roster
- Flexible schema accommodates different data structures per holder type
- Unique constraints prevent duplicate data per holder type
- Values stored in cents to avoid floating-point precision issues

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system  
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for API data ingestion processes

QUERY EXAMPLES:

-- Get top institutional holders for AAPL
SELECT holder_name, shares, value/100 as value_dollars 
FROM public.holders 
WHERE symbol = 'AAPL' AND holder_type = 'institutional' 
ORDER BY shares DESC LIMIT 10;

-- Get recent insider transactions
SELECT holder_name, insider_position, shares, transaction_type, date_reported
FROM public.holders 
WHERE symbol = 'AAPL' AND holder_type = 'insider_transactions'
ORDER BY date_reported DESC;

-- Get insider purchase summary
SELECT * FROM public.holders 
WHERE symbol = 'AAPL' AND holder_type = 'insider_purchases';

-- Get current insider roster
SELECT holder_name, insider_position, shares_owned_directly, 
       most_recent_transaction, latest_transaction_date
FROM public.holders 
WHERE symbol = 'AAPL' AND holder_type = 'insider_roster'
ORDER BY shares_owned_directly DESC;

-- Get mutual fund holders
SELECT holder_name, shares, value/100 as value_dollars, date_reported
FROM public.holders 
WHERE symbol = 'AAPL' AND holder_type = 'mutualfund'
ORDER BY shares DESC;
*/