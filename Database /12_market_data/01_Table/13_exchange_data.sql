CREATE TABLE IF NOT EXISTS exchanges (
    id SERIAL PRIMARY KEY,
    exchange_code VARCHAR(10) NOT NULL UNIQUE,
    exchange_name VARCHAR(100) NOT NULL,
    country VARCHAR(50),
    timezone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- EXCHANGES TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from exchanges table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from exchanges table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON exchanges TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON exchanges FROM PUBLIC;
REVOKE UPDATE ON exchanges FROM PUBLIC;
REVOKE DELETE ON exchanges FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE exchanges ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "exchanges_select_policy" ON exchanges
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "exchanges_insert_policy" ON exchanges
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "exchanges_update_policy" ON exchanges
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "exchanges_delete_policy" ON exchanges
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR EXCHANGES TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT exchange data for lookups and display
   - Users cannot modify exchange reference data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic exchange data updates

3. DATA INTEGRITY:
   - Exchange data should be treated as immutable reference data by users
   - Only trusted sources can update exchange information
   - Supports regulatory compliance requirements

4. REFERENCE DATA CONSISTENCY:
   - Exchange codes and names must remain consistent across the system
   - Prevents users from creating invalid foreign key references
   - Ensures data quality for all related tables

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
- Exchange data changes infrequently, making read-only access appropriate
*/

-- =====================================================
-- ADDITIONAL INDEXES FOR EXCHANGES TABLE (RECOMMENDED)
-- =====================================================

-- These indexes are recommended for better query performance
-- since exchanges table is frequently used for lookups

-- Index on exchange_code (already unique, but explicit index helps)
CREATE INDEX IF NOT EXISTS idx_exchanges_exchange_code ON exchanges (exchange_code);

-- Index on country for filtering by country
CREATE INDEX IF NOT EXISTS idx_exchanges_country ON exchanges (country);

-- Index on timezone for timezone-based queries
CREATE INDEX IF NOT EXISTS idx_exchanges_timezone ON exchanges (timezone);

-- Composite index for country and timezone lookups
CREATE INDEX IF NOT EXISTS idx_exchanges_country_timezone ON exchanges (country, timezone);

-- Add table and column comments for documentation
COMMENT ON TABLE exchanges IS 'Stock exchange reference data - read-only for users, system-managed';
COMMENT ON COLUMN exchanges.id IS 'Primary key for exchange records';
COMMENT ON COLUMN exchanges.exchange_code IS 'Unique exchange identifier (NYSE, NASDAQ, LSE, etc.)';
COMMENT ON COLUMN exchanges.exchange_name IS 'Full name of the exchange';
COMMENT ON COLUMN exchanges.country IS 'Country where the exchange is located';
COMMENT ON COLUMN exchanges.timezone IS 'Timezone of the exchange (for trading hours)';
COMMENT ON COLUMN exchanges.created_at IS 'Timestamp when exchange record was created';

-- =====================================================
-- TEST QUERIES TO VERIFY POLICY
-- =====================================================

/*
-- These queries should work for all users (SELECT operations):

-- 1. Get all exchanges
SELECT * FROM exchanges ORDER BY exchange_code;

-- 2. Find specific exchange
SELECT * FROM exchanges WHERE exchange_code = 'NYSE';

-- 3. Get exchanges by country
SELECT * FROM exchanges WHERE country = 'USA' ORDER BY exchange_name;

-- 4. Get exchanges with timezone
SELECT exchange_code, exchange_name, timezone 
FROM exchanges 
WHERE timezone LIKE '%America%';

-- These operations should FAIL for regular users:

-- 1. Try to insert (should fail)
INSERT INTO exchanges (exchange_code, exchange_name, country, timezone) 
VALUES ('TEST', 'Test Exchange', 'USA', 'America/New_York');

-- 2. Try to update (should fail)
UPDATE exchanges SET exchange_name = 'Updated Name' WHERE exchange_code = 'NYSE';

-- 3. Try to delete (should fail)
DELETE FROM exchanges WHERE exchange_code = 'TEST';
*/
