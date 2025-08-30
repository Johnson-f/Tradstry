-- Function to get trading frequency by symbol
CREATE OR REPLACE FUNCTION public.get_trading_frequency_by_symbol(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR,
    trade_count BIGINT,
    frequency_category TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_trades AS (
        -- Stock trades
        SELECT
            symbol
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND (
                (p_time_range = '7d' AND exit_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND exit_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND exit_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND exit_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND exit_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND
                    (p_custom_start_date IS NULL OR exit_date >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR exit_date <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )

        UNION ALL

        -- Option trades
        SELECT
            symbol
        FROM
            public.options
        WHERE
            user_id = auth.uid()
            AND status = 'closed'
            AND (
                (p_time_range = '7d' AND exit_date >= (CURRENT_DATE - INTERVAL '7 days'))
                OR (p_time_range = '30d' AND exit_date >= (CURRENT_DATE - INTERVAL '30 days'))
                OR (p_time_range = '90d' AND exit_date >= (CURRENT_DATE - INTERVAL '90 days'))
                OR (p_time_range = '1y' AND exit_date >= (CURRENT_DATE - INTERVAL '1 year'))
                OR (p_time_range = 'ytd' AND exit_date >= DATE_TRUNC('year', CURRENT_DATE))
                OR (p_time_range = 'custom' AND
                    (p_custom_start_date IS NULL OR exit_date >= p_custom_start_date) AND
                    (p_custom_end_date IS NULL OR exit_date <= p_custom_end_date))
                OR (p_time_range = 'all_time')
            )
    ),
    symbol_counts AS (
        SELECT
            at.symbol,
            COUNT(*) AS trade_count
        FROM
            all_trades at
        GROUP BY
            at.symbol
    )
    SELECT
        sc.symbol,
        sc.trade_count,
        CASE
            WHEN sc.trade_count >= 20 THEN 'Very High'
            WHEN sc.trade_count >= 10 THEN 'High'
            WHEN sc.trade_count >= 5 THEN 'Medium'
            ELSE 'Low'
        END AS frequency_category
    FROM
        symbol_counts sc
    ORDER BY
        sc.trade_count DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_trading_frequency_by_symbol(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_trading_frequency_by_symbol IS 'Returns the trading frequency for each symbol, categorized as High, Medium, or Low.

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- symbol: The ticker symbol.
- trade_count: The total number of trades for that symbol.
- frequency_category: A text category for the trade frequency.

Example usage:
-- Get trade frequency for the last 90 days
SELECT * FROM get_trading_frequency_by_symbol(''90d'');

-- Get trade frequency for all time
SELECT * FROM get_trading_frequency_by_symbol();
';
