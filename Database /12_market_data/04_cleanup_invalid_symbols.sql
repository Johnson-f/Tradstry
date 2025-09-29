-- =====================================================
-- CLEANUP INVALID SYMBOLS FROM MARKET MOVERS TABLE
-- =====================================================
-- Remove entries where symbol is numeric (e.g., '0', '1', '2', etc.)
-- These entries are invalid and prevent the market movers system from working correctly

-- 1. Show current invalid entries
-- SELECT symbol, name, mover_type, data_date, rank_position 
-- FROM market_movers 
-- WHERE symbol ~ '^[0-9]+$'
-- ORDER BY data_date DESC, mover_type, rank_position;

-- 2. Delete invalid numeric symbols
DELETE FROM market_movers 
WHERE symbol ~ '^[0-9]+$'  -- Regex to match purely numeric symbols
   OR symbol = ''          -- Also remove empty symbols
   OR symbol IS NULL;      -- And NULL symbols

-- 3. Verify cleanup
-- SELECT symbol, name, mover_type, data_date, rank_position 
-- FROM market_movers 
-- ORDER BY data_date DESC, mover_type, rank_position
-- LIMIT 20;

-- 4. Add constraint to prevent future invalid symbols (optional)
-- ALTER TABLE market_movers 
-- ADD CONSTRAINT check_symbol_format 
-- CHECK (symbol ~ '^[A-Z0-9._-]{1,20}$' AND NOT symbol ~ '^[0-9]+$');

-- Script to run after edge function fix:
-- This cleanup should be run after the edge function has been fixed
-- to ensure no new invalid symbols are inserted
