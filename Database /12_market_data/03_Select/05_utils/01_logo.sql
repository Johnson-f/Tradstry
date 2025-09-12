-- BATCH LOGO RETRIEVAL FUNCTION

-- Function to retrieve logos for multiple symbols at once
-- Returns: table with symbol and logo columns

CREATE OR REPLACE FUNCTION get_company_logos_batch(
    p_symbols VARCHAR(20)[]
)
RETURNS TABLE(
    symbol VARCHAR(20),
    logo VARCHAR(500)
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    -- Validate input parameter
    IF p_symbols IS NULL OR array_length(p_symbols, 1) IS NULL THEN
        RETURN;
    END IF;

    -- Return logos for all requested symbols
    RETURN QUERY
    SELECT 
        ci.symbol,
        ci.logo
    FROM company_info ci
    WHERE UPPER(ci.symbol) = ANY(
        SELECT UPPER(TRIM(unnest(p_symbols)))
    )
    ORDER BY ci.symbol;

EXCEPTION
    WHEN OTHERS THEN
        -- Log error and return empty result on any exception
        RAISE WARNING 'Error retrieving logos for symbols: %', SQLERRM;
        RETURN;
END;
$$;


-- BATCH USAGE EXAMPLES
-- SELECT * FROM get_company_logos_batch(ARRAY['AAPL', 'MSFT', 'TSLA']);
-- SELECT * FROM get_company_logos_batch(ARRAY['SPY', 'QQQ', 'DIA']);