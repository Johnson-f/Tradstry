-- EARNINGS CALENDAR LOGO RETRIEVAL FUNCTION

-- Function to retrieve logos for multiple symbols from earnings_calendar table only
-- Returns: table with symbol and logo columns
-- Fetches logos exclusively from the earnings_calendar table

CREATE OR REPLACE FUNCTION get_earnings_calendar_logos_batch(
    p_symbols VARCHAR(20)[]
)
RETURNS TABLE(
    symbol VARCHAR(20),
    logo VARCHAR(500)
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Validate input
    IF p_symbols IS NULL OR array_length(p_symbols, 1) IS NULL THEN
        RETURN;
    END IF;

    -- Return logos for all requested symbols from earnings_calendar table only
    RETURN QUERY
    SELECT DISTINCT
        ec.symbol,
        ec.logo
    FROM earnings_calendar ec
    WHERE UPPER(ec.symbol) = ANY(
        SELECT UPPER(TRIM(unnest(p_symbols)))
    )
    AND ec.logo IS NOT NULL
    ORDER BY ec.symbol;

EXCEPTION
    WHEN OTHERS THEN
        -- Log error and return empty result
        RAISE WARNING 'Error in get_earnings_calendar_logos_batch: %', SQLERRM;
        RETURN;
END;
$$;

-- Grant execute permission to public
GRANT EXECUTE ON FUNCTION get_earnings_calendar_logos_batch(VARCHAR(20)[]) TO PUBLIC;

-- Add function comment
COMMENT ON FUNCTION get_earnings_calendar_logos_batch(VARCHAR(20)[]) IS 
'Batch retrieval of company logos from earnings_calendar table only. Returns symbol and logo URL for requested symbols.';