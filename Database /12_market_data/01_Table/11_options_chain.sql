-- Options Chain Table - GLOBAL SHARED DATA
-- This table stores options chain data accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores options quotes with Greeks and market data from providers

CREATE TABLE IF NOT EXISTS options_chain (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(50) NOT NULL,  -- Full option symbol (e.g., AAPL240315C00150000)
    underlying_symbol VARCHAR(20) NOT NULL,  -- Underlying stock symbol
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Option specifics
    strike DECIMAL(15,4) NOT NULL,
    expiration DATE NOT NULL,
    option_type VARCHAR(10) NOT NULL CHECK (option_type IN ('call', 'put')),

    -- Market data (shared globally)
    bid DECIMAL(15,4),
    ask DECIMAL(15,4),
    last_price DECIMAL(15,4),
    volume INTEGER,
    open_interest INTEGER,
    implied_volatility DECIMAL(7,4),  -- As decimal (0.234 = 23.4%)

    -- Options Greeks
    delta DECIMAL(7,4),
    gamma DECIMAL(7,4),
    theta DECIMAL(7,4),
    vega DECIMAL(7,4),
    rho DECIMAL(7,4),

    -- Market data
    intrinsic_value DECIMAL(15,4),
    extrinsic_value DECIMAL(15,4),
    time_value DECIMAL(15,4),

    -- Metadata
    quote_timestamp TIMESTAMP NOT NULL,
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per option symbol per timestamp per provider
    UNIQUE(symbol, quote_timestamp, data_provider),

    -- Indexes for options analysis queries
    INDEX idx_options_chain_underlying_strike (underlying_symbol, strike),
    INDEX idx_options_chain_expiration (expiration),
    INDEX idx_options_chain_type_expiration (option_type, expiration),
    INDEX idx_options_chain_timestamp (quote_timestamp DESC),
    INDEX idx_options_chain_provider (data_provider),
    INDEX idx_options_chain_underlying_expiration (underlying_symbol, expiration)
);

-- Add table comment
COMMENT ON TABLE options_chain IS 'Options chain data with Greeks and market data from multiple providers';

-- Add column comments
COMMENT ON COLUMN options_chain.symbol IS 'Full option symbol (e.g., AAPL240315C00150000)';
COMMENT ON COLUMN options_chain.underlying_symbol IS 'Underlying stock ticker symbol';
COMMENT ON COLUMN options_chain.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN options_chain.strike IS 'Strike price of the option';
COMMENT ON COLUMN options_chain.expiration IS 'Expiration date of the option';
COMMENT ON COLUMN options_chain.option_type IS 'Type of option (call or put)';
COMMENT ON COLUMN options_chain.bid IS 'Current bid price';
COMMENT ON COLUMN options_chain.ask IS 'Current ask price';
COMMENT ON COLUMN options_chain.last_price IS 'Last traded price';
COMMENT ON COLUMN options_chain.volume IS 'Trading volume for the option';
COMMENT ON COLUMN options_chain.open_interest IS 'Number of outstanding contracts';
COMMENT ON COLUMN options_chain.implied_volatility IS 'Implied volatility as decimal (0.234 = 23.4%)';
COMMENT ON COLUMN options_chain.delta IS 'Delta Greek (sensitivity to underlying price)';
COMMENT ON COLUMN options_chain.gamma IS 'Gamma Greek (delta sensitivity)';
COMMENT ON COLUMN options_chain.theta IS 'Theta Greek (time decay)';
COMMENT ON COLUMN options_chain.vega IS 'Vega Greek (volatility sensitivity)';
COMMENT ON COLUMN options_chain.rho IS 'Rho Greek (interest rate sensitivity)';
COMMENT ON COLUMN options_chain.intrinsic_value IS 'Intrinsic value of the option';
COMMENT ON COLUMN options_chain.extrinsic_value IS 'Extrinsic/time value of the option';
COMMENT ON COLUMN options_chain.time_value IS 'Time value remaining in the option';
COMMENT ON COLUMN options_chain.quote_timestamp IS 'Timestamp when this option data was captured';
COMMENT ON COLUMN options_chain.data_provider IS 'Market data provider (polygon, finnhub, etc.)';

-- =====================================================
-- OPTIONS CHAIN TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from options_chain table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from options_chain table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON options_chain TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON options_chain FROM PUBLIC;
REVOKE UPDATE ON options_chain FROM PUBLIC;
REVOKE DELETE ON options_chain FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE options_chain ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "options_chain_select_policy" ON options_chain
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "options_chain_insert_policy" ON options_chain
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "options_chain_update_policy" ON options_chain
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "options_chain_delete_policy" ON options_chain
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR OPTIONS_CHAIN TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for options analysis and display
   - Users cannot modify options data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic options data updates

3. DATA INTEGRITY:
   - Options data should be treated as immutable by users
   - Only trusted sources can update options information
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/
