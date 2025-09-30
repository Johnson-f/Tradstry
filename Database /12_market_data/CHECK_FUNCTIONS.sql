-- ================================================================
-- VERIFY MARKET MOVERS FUNCTIONS EXIST
-- ================================================================
-- Run this script in Supabase SQL Editor to check if functions are deployed

-- 1. List all mover-related functions
SELECT 
    routine_name as function_name,
    routine_type,
    data_type as return_type,
    routine_definition as definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name LIKE '%mover%'
ORDER BY routine_name;

-- 2. Check function parameters
SELECT 
    r.routine_name as function_name,
    p.parameter_name,
    p.data_type,
    p.parameter_mode
FROM information_schema.routines r
LEFT JOIN information_schema.parameters p 
    ON r.specific_name = p.specific_name
WHERE r.routine_schema = 'public'
  AND r.routine_name IN (
    'get_top_gainers',
    'get_top_losers', 
    'get_most_active',
    'get_top_gainers_latest',
    'get_top_losers_latest',
    'get_most_active_latest'
  )
ORDER BY r.routine_name, p.ordinal_position;

-- 3. Test if functions work (requires data in market_movers table)
-- Uncomment to test:
/*
SELECT 'Testing get_top_gainers_latest...' as test;
SELECT * FROM get_top_gainers_latest(5);

SELECT 'Testing get_top_losers_latest...' as test;
SELECT * FROM get_top_losers_latest(5);

SELECT 'Testing get_most_active_latest...' as test;
SELECT * FROM get_most_active_latest(5);
*/

-- 4. Check if market_movers table has data
SELECT 
    mover_type,
    data_date,
    COUNT(*) as count
FROM market_movers
GROUP BY mover_type, data_date
ORDER BY data_date DESC, mover_type
LIMIT 10;
