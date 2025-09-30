-- =====================================================
-- HOLDERS DATA SELECT FUNCTIONS
-- Comprehensive query functions for all holder types
-- Supports institutional, mutual fund, insider transactions, purchases, and roster
-- =====================================================

-- 1. GET INSTITUTIONAL HOLDERS FOR A SYMBOL
-- Get all institutional holders for a specific stock symbol
CREATE OR REPLACE FUNCTION get_institutional_holders(
    p_symbol VARCHAR(10),
    p_date_reported TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(10),
    holder_name VARCHAR(500),
    shares BIGINT,
    value BIGINT,
    date_reported TIMESTAMPTZ,
    data_source VARCHAR(50),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.id,
        h.symbol,
        h.holder_name,
        h.shares,
        h.value,
        h.date_reported,
        h.data_source,
        h.created_at,
        h.updated_at
    FROM public.holders h
    WHERE h.symbol = UPPER(p_symbol)
      AND h.holder_type = 'institutional'
      AND (p_date_reported IS NULL OR h.date_reported = p_date_reported)
    ORDER BY h.shares DESC NULLS LAST, h.value DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- 2. GET MUTUAL FUND HOLDERS FOR A SYMBOL
-- Get all mutual fund holders for a specific stock symbol
CREATE OR REPLACE FUNCTION get_mutualfund_holders(
    p_symbol VARCHAR(10),
    p_date_reported TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(10),
    holder_name VARCHAR(500),
    shares BIGINT,
    value BIGINT,
    date_reported TIMESTAMPTZ,
    data_source VARCHAR(50),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.id,
        h.symbol,
        h.holder_name,
        h.shares,
        h.value,
        h.date_reported,
        h.data_source,
        h.created_at,
        h.updated_at
    FROM public.holders h
    WHERE h.symbol = UPPER(p_symbol)
      AND h.holder_type = 'mutualfund'
      AND (p_date_reported IS NULL OR h.date_reported = p_date_reported)
    ORDER BY h.shares DESC NULLS LAST, h.value DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- 3. GET INSIDER TRANSACTIONS FOR A SYMBOL
-- Get all insider transactions for a specific stock symbol
CREATE OR REPLACE FUNCTION get_insider_transactions(
    p_symbol VARCHAR(10),
    p_transaction_type VARCHAR(50) DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(10),
    holder_name VARCHAR(500),
    insider_position VARCHAR(100),
    transaction_type VARCHAR(50),
    shares BIGINT,
    value BIGINT,
    date_reported TIMESTAMPTZ,
    ownership_type VARCHAR(10),
    data_source VARCHAR(50),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.id,
        h.symbol,
        h.holder_name,
        h.insider_position,
        h.transaction_type,
        h.shares,
        h.value,
        h.date_reported,
        h.ownership_type,
        h.data_source,
        h.created_at,
        h.updated_at
    FROM public.holders h
    WHERE h.symbol = UPPER(p_symbol)
      AND h.holder_type = 'insider_transactions'
      AND (p_transaction_type IS NULL OR h.transaction_type = p_transaction_type)
      AND (p_start_date IS NULL OR h.date_reported >= p_start_date)
      AND (p_end_date IS NULL OR h.date_reported <= p_end_date)
    ORDER BY h.date_reported DESC, h.shares DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- 4. GET INSIDER PURCHASES SUMMARY FOR A SYMBOL
-- Get insider purchases summary data for a specific stock symbol
CREATE OR REPLACE FUNCTION get_insider_purchases_summary(
    p_symbol VARCHAR(10),
    p_summary_period VARCHAR(10) DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(10),
    summary_period VARCHAR(10),
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
    data_source VARCHAR(50),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.id,
        h.symbol,
        h.summary_period,
        h.purchases_shares,
        h.purchases_transactions,
        h.sales_shares,
        h.sales_transactions,
        h.net_shares,
        h.net_transactions,
        h.total_insider_shares,
        h.net_percent_insider_shares,
        h.buy_percent_insider_shares,
        h.sell_percent_insider_shares,
        h.data_source,
        h.created_at,
        h.updated_at
    FROM public.holders h
    WHERE h.symbol = UPPER(p_symbol)
      AND h.holder_type = 'insider_purchases'
      AND (p_summary_period IS NULL OR h.summary_period = p_summary_period)
    ORDER BY h.summary_period DESC;
END;
$$;

-- 5. GET INSIDER ROSTER FOR A SYMBOL
-- Get insider roster (current insiders and their positions) for a specific stock symbol
CREATE OR REPLACE FUNCTION get_insider_roster(
    p_symbol VARCHAR(10),
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(10),
    holder_name VARCHAR(500),
    insider_position VARCHAR(100),
    most_recent_transaction VARCHAR(100),
    latest_transaction_date TIMESTAMPTZ,
    shares_owned_directly BIGINT,
    shares_owned_indirectly BIGINT,
    position_direct_date TIMESTAMPTZ,
    data_source VARCHAR(50),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.id,
        h.symbol,
        h.holder_name,
        h.insider_position,
        h.most_recent_transaction,
        h.latest_transaction_date,
        h.shares_owned_directly,
        h.shares_owned_indirectly,
        h.position_direct_date,
        h.data_source,
        h.created_at,
        h.updated_at
    FROM public.holders h
    WHERE h.symbol = UPPER(p_symbol)
      AND h.holder_type = 'insider_roster'
    ORDER BY h.shares_owned_directly DESC NULLS LAST, h.holder_name ASC
    LIMIT p_limit;
END;
$$;

-- 6. GET ALL HOLDERS FOR A SYMBOL (COMBINED VIEW)
-- Get all holder types for a specific stock symbol
CREATE OR REPLACE FUNCTION get_all_holders(
    p_symbol VARCHAR(10),
    p_holder_type VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(10),
    holder_type VARCHAR(20),
    holder_name VARCHAR(500),
    shares BIGINT,
    value BIGINT,
    date_reported TIMESTAMPTZ,
    data_source VARCHAR(50),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.id,
        h.symbol,
        h.holder_type,
        h.holder_name,
        h.shares,
        h.value,
        h.date_reported,
        h.data_source,
        h.created_at,
        h.updated_at
    FROM public.holders h
    WHERE h.symbol = UPPER(p_symbol)
      AND (p_holder_type IS NULL OR h.holder_type = p_holder_type)
    ORDER BY 
        CASE h.holder_type
            WHEN 'institutional' THEN 1
            WHEN 'mutualfund' THEN 2
            WHEN 'insider_roster' THEN 3
            WHEN 'insider_transactions' THEN 4
            WHEN 'insider_purchases' THEN 5
            ELSE 6
        END,
        h.shares DESC NULLS LAST,
        h.date_reported DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- 7. GET TOP INSTITUTIONAL HOLDERS (ACROSS ALL SYMBOLS)
-- Get top institutional holders by total shares or value
CREATE OR REPLACE FUNCTION get_top_institutional_holders(
    p_order_by VARCHAR(10) DEFAULT 'shares', -- 'shares' or 'value'
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(10),
    holder_name VARCHAR(500),
    shares BIGINT,
    value BIGINT,
    date_reported TIMESTAMPTZ,
    data_source VARCHAR(50)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    IF UPPER(p_order_by) = 'VALUE' THEN
        RETURN QUERY
        SELECT 
            h.id,
            h.symbol,
            h.holder_name,
            h.shares,
            h.value,
            h.date_reported,
            h.data_source
        FROM public.holders h
        WHERE h.holder_type = 'institutional'
          AND h.value IS NOT NULL
        ORDER BY h.value DESC
        LIMIT p_limit;
    ELSE
        RETURN QUERY
        SELECT 
            h.id,
            h.symbol,
            h.holder_name,
            h.shares,
            h.value,
            h.date_reported,
            h.data_source
        FROM public.holders h
        WHERE h.holder_type = 'institutional'
          AND h.shares IS NOT NULL
        ORDER BY h.shares DESC
        LIMIT p_limit;
    END IF;
END;
$$;

-- 8. GET RECENT INSIDER TRANSACTIONS (ACROSS ALL SYMBOLS)
-- Get most recent insider transactions across all symbols
CREATE OR REPLACE FUNCTION get_recent_insider_transactions(
    p_transaction_type VARCHAR(50) DEFAULT NULL,
    p_days_back INTEGER DEFAULT 30,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(10),
    holder_name VARCHAR(500),
    insider_position VARCHAR(100),
    transaction_type VARCHAR(50),
    shares BIGINT,
    value BIGINT,
    date_reported TIMESTAMPTZ,
    ownership_type VARCHAR(10)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.id,
        h.symbol,
        h.holder_name,
        h.insider_position,
        h.transaction_type,
        h.shares,
        h.value,
        h.date_reported,
        h.ownership_type
    FROM public.holders h
    WHERE h.holder_type = 'insider_transactions'
      AND h.date_reported >= (CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days_back)
      AND (p_transaction_type IS NULL OR h.transaction_type = p_transaction_type)
    ORDER BY h.date_reported DESC, h.value DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- 9. GET HOLDER STATISTICS FOR A SYMBOL
-- Get aggregated statistics about holders for a specific symbol
CREATE OR REPLACE FUNCTION get_holder_statistics(
    p_symbol VARCHAR(10)
)
RETURNS TABLE (
    holder_type VARCHAR(20),
    total_holders BIGINT,
    total_shares BIGINT,
    total_value BIGINT,
    avg_shares NUMERIC,
    avg_value NUMERIC,
    last_reported TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.holder_type,
        COUNT(DISTINCT h.id)::BIGINT as total_holders,
        COALESCE(SUM(h.shares), 0)::BIGINT as total_shares,
        COALESCE(SUM(h.value), 0)::BIGINT as total_value,
        AVG(h.shares) as avg_shares,
        AVG(h.value) as avg_value,
        MAX(h.date_reported) as last_reported
    FROM public.holders h
    WHERE h.symbol = UPPER(p_symbol)
      AND h.holder_type IN ('institutional', 'mutualfund', 'insider_transactions')
    GROUP BY h.holder_type
    ORDER BY h.holder_type;
END;
$$;

-- 10. SEARCH HOLDERS BY NAME
-- Search for holders by name pattern across all symbols
CREATE OR REPLACE FUNCTION search_holders_by_name(
    p_name_pattern VARCHAR(500),
    p_holder_type VARCHAR(20) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(10),
    holder_type VARCHAR(20),
    holder_name VARCHAR(500),
    shares BIGINT,
    value BIGINT,
    date_reported TIMESTAMPTZ,
    data_source VARCHAR(50)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.id,
        h.symbol,
        h.holder_type,
        h.holder_name,
        h.shares,
        h.value,
        h.date_reported,
        h.data_source
    FROM public.holders h
    WHERE h.holder_name ILIKE '%' || p_name_pattern || '%'
      AND (p_holder_type IS NULL OR h.holder_type = p_holder_type)
    ORDER BY h.shares DESC NULLS LAST, h.value DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

-- 11. GET PAGINATED HOLDERS
-- Get paginated holder results with flexible sorting
CREATE OR REPLACE FUNCTION get_holders_paginated(
    p_symbol VARCHAR(10) DEFAULT NULL,
    p_holder_type VARCHAR(20) DEFAULT NULL,
    p_offset INTEGER DEFAULT 0,
    p_limit INTEGER DEFAULT 50,
    p_sort_column VARCHAR(50) DEFAULT 'shares',
    p_sort_direction VARCHAR(4) DEFAULT 'DESC'
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(10),
    holder_type VARCHAR(20),
    holder_name VARCHAR(500),
    shares BIGINT,
    value BIGINT,
    date_reported TIMESTAMPTZ,
    data_source VARCHAR(50),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
AS $$
DECLARE
    query_text TEXT;
    where_clause TEXT := 'TRUE';
BEGIN
    -- Build WHERE clause
    IF p_symbol IS NOT NULL THEN
        where_clause := where_clause || ' AND h.symbol = UPPER($1)';
    END IF;
    
    IF p_holder_type IS NOT NULL THEN
        where_clause := where_clause || ' AND h.holder_type = $2';
    END IF;
    
    -- Build dynamic query with sorting
    query_text := format('
        SELECT 
            h.id,
            h.symbol,
            h.holder_type,
            h.holder_name,
            h.shares,
            h.value,
            h.date_reported,
            h.data_source,
            h.created_at,
            h.updated_at
        FROM public.holders h
        WHERE %s
        ORDER BY %I %s NULLS LAST
        LIMIT $3 OFFSET $4',
        where_clause,
        p_sort_column, 
        CASE WHEN UPPER(p_sort_direction) = 'ASC' THEN 'ASC' ELSE 'DESC' END
    );
    
    -- Execute with appropriate parameters
    IF p_symbol IS NOT NULL AND p_holder_type IS NOT NULL THEN
        RETURN QUERY EXECUTE query_text 
        USING p_symbol, p_holder_type, p_limit, p_offset;
    ELSIF p_symbol IS NOT NULL THEN
        RETURN QUERY EXECUTE query_text 
        USING p_symbol, p_limit, p_offset;
    ELSIF p_holder_type IS NOT NULL THEN
        RETURN QUERY EXECUTE query_text 
        USING p_holder_type, p_limit, p_offset;
    ELSE
        RETURN QUERY EXECUTE query_text 
        USING p_limit, p_offset;
    END IF;
END;
$$;

-- =====================================================
-- GRANT EXECUTE PERMISSIONS
-- =====================================================

GRANT EXECUTE ON FUNCTION get_institutional_holders TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_mutualfund_holders TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_insider_transactions TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_insider_purchases_summary TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_insider_roster TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_all_holders TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_top_institutional_holders TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_recent_insider_transactions TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_holder_statistics TO PUBLIC;
GRANT EXECUTE ON FUNCTION search_holders_by_name TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_holders_paginated TO PUBLIC;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get top institutional holders for AAPL
SELECT * FROM get_institutional_holders('AAPL');

-- Get mutual fund holders for AAPL
SELECT * FROM get_mutualfund_holders('AAPL', NULL, 25);

-- Get insider transactions for AAPL (buy transactions only)
SELECT * FROM get_insider_transactions('AAPL', 'Buy', NULL, NULL, 50);

-- Get insider transactions for AAPL in last 90 days
SELECT * FROM get_insider_transactions(
    'AAPL', 
    NULL, 
    CURRENT_TIMESTAMP - INTERVAL '90 days', 
    NULL, 
    100
);

-- Get insider purchases summary for AAPL
SELECT * FROM get_insider_purchases_summary('AAPL');

-- Get insider roster for AAPL
SELECT * FROM get_insider_roster('AAPL');

-- Get all holders for AAPL
SELECT * FROM get_all_holders('AAPL');

-- Get only institutional holders for AAPL
SELECT * FROM get_all_holders('AAPL', 'institutional');

-- Get top institutional holders across all symbols (by shares)
SELECT * FROM get_top_institutional_holders('shares', 100);

-- Get top institutional holders across all symbols (by value)
SELECT * FROM get_top_institutional_holders('value', 100);

-- Get recent insider transactions (last 30 days, all types)
SELECT * FROM get_recent_insider_transactions(NULL, 30, 100);

-- Get recent insider sale transactions (last 60 days)
SELECT * FROM get_recent_insider_transactions('Sale', 60, 50);

-- Get holder statistics for AAPL
SELECT * FROM get_holder_statistics('AAPL');

-- Search for Vanguard holdings
SELECT * FROM search_holders_by_name('Vanguard');

-- Search for Vanguard institutional holdings only
SELECT * FROM search_holders_by_name('Vanguard', 'institutional', 100);

-- Get paginated holders for AAPL (sorted by shares descending)
SELECT * FROM get_holders_paginated('AAPL', NULL, 0, 50, 'shares', 'DESC');

-- Get paginated institutional holders across all symbols
SELECT * FROM get_holders_paginated(NULL, 'institutional', 0, 100, 'value', 'DESC');

-- Get second page of mutual fund holders for AAPL
SELECT * FROM get_holders_paginated('AAPL', 'mutualfund', 50, 50, 'shares', 'DESC');
*/