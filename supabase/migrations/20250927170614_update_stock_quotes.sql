-- STOCK QUOTES SYSTEM REDESIGN - REMOVE PRICE DATA
-- Update stock_quotes table structure and functions

-- =====================================================
-- UPDATE STOCK_QUOTES TABLE - REMOVE PRICE COLUMNS
-- =====================================================

-- Remove all price-related columns from stock_quotes table
ALTER TABLE stock_quotes DROP COLUMN IF EXISTS price;
ALTER TABLE stock_quotes DROP COLUMN IF EXISTS change_amount;
ALTER TABLE stock_quotes DROP COLUMN IF EXISTS change_percent;
ALTER TABLE stock_quotes DROP COLUMN IF EXISTS volume;
ALTER TABLE stock_quotes DROP COLUMN IF EXISTS open_price;
ALTER TABLE stock_quotes DROP COLUMN IF EXISTS high_price;
ALTER TABLE stock_quotes DROP COLUMN IF EXISTS low_price;
ALTER TABLE stock_quotes DROP COLUMN IF EXISTS previous_close;

-- Add comments to clarify the redesigned structure
COMMENT ON TABLE stock_quotes IS 'Stock symbol metadata and tracking information - REDESIGNED: no price data, ticker symbols as text';
COMMENT ON COLUMN stock_quotes.symbol IS 'Stock ticker symbol stored as TEXT (not number) - e.g., AAPL, GOOGL';
COMMENT ON COLUMN stock_quotes.quote_timestamp IS 'Timestamp when this symbol was tracked/updated';
COMMENT ON COLUMN stock_quotes.data_provider IS 'Data provider source for symbol validation';
COMMENT ON COLUMN stock_quotes.exchange_id IS 'Reference to exchange where symbol is traded';

-- =====================================================
-- REDESIGNED STOCK QUOTES SELECT FUNCTIONS - NO PRICE DATA
-- Functions return symbols and metadata only - use external APIs for real-time prices
-- =====================================================

-- Drop existing functions to recreate with new signatures
DROP FUNCTION IF EXISTS get_stock_quotes(VARCHAR(20), DATE, VARCHAR(50));

-- 1. Get stock symbol metadata (no price data)
CREATE OR REPLACE FUNCTION get_stock_quotes(
    p_symbol VARCHAR(20),
    p_quote_date DATE DEFAULT CURRENT_DATE,
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR(20),
    quote_date DATE,
    quote_timestamp TIMESTAMP,
    data_provider VARCHAR(50),
    exchange_id INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        UPPER(p_symbol)::VARCHAR(20) as symbol,
        p_quote_date as quote_date,
        sq.quote_timestamp,
        sq.data_provider,
        sq.exchange_id
    FROM stock_quotes sq
    WHERE sq.symbol = UPPER(p_symbol)
    AND DATE(sq.quote_timestamp) = p_quote_date
    AND (p_data_provider IS NULL OR sq.data_provider = p_data_provider)
    ORDER BY sq.quote_timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STOCK QUOTES TABLE SECURITY POLICY (UPDATED)
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Enable Row Level Security on the table (if not already enabled)
ALTER TABLE stock_quotes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies and recreate
DROP POLICY IF EXISTS "stock_quotes_select_policy" ON stock_quotes;
DROP POLICY IF EXISTS "stock_quotes_insert_policy" ON stock_quotes;
DROP POLICY IF EXISTS "stock_quotes_update_policy" ON stock_quotes;
DROP POLICY IF EXISTS "stock_quotes_delete_policy" ON stock_quotes;

-- Create policy for SELECT operations (allow all users)
CREATE POLICY "stock_quotes_select_policy" ON stock_quotes
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "stock_quotes_insert_policy" ON stock_quotes
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "stock_quotes_update_policy" ON stock_quotes
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "stock_quotes_delete_policy" ON stock_quotes
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- Grant SELECT permission to PUBLIC/ALL USERS
GRANT SELECT ON stock_quotes TO PUBLIC;

-- Revoke all modification permissions from PUBLIC
REVOKE INSERT ON stock_quotes FROM PUBLIC;
REVOKE UPDATE ON stock_quotes FROM PUBLIC;
REVOKE DELETE ON stock_quotes FROM PUBLIC;

-- =====================================================
-- USAGE EXAMPLES - REDESIGNED WITHOUT PRICE DATA
-- =====================================================

/*
-- Get stock symbol metadata for Apple on a specific date (NO PRICE DATA)
SELECT * FROM get_stock_quotes('AAPL', '2024-01-15');

-- Get current day stock tracking info
SELECT * FROM get_stock_quotes('MSFT');

-- Get tracking info from a specific provider
SELECT * FROM get_stock_quotes('GOOGL', CURRENT_DATE, 'platform');

-- Example batch price lookup flow:
WITH symbols AS (
    SELECT symbol FROM get_tracked_symbols() LIMIT 100
)
-- Frontend would use these symbols to call external price APIs
SELECT 
    s.symbol,
    'Use external API for price' as note
FROM symbols s;
*/


