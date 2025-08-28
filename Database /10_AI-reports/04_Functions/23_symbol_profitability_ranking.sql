-- Function to get the most and least profitable symbols
CREATE OR REPLACE FUNCTION public.get_symbol_profitability_ranking(
    p_limit INTEGER DEFAULT 5,
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR,
    total_pnl NUMERIC,
    ranking_type TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH symbol_pnl AS (
        -- Calculate PnL for each symbol from both stocks and options
        SELECT
            s.symbol,
            CASE
                WHEN s.trade_type = 'BUY' THEN (s.exit_price - s.entry_price) * s.number_shares - s.commissions
                ELSE (s.entry_price - s.exit_price) * s.number_shares - s.commissions
            END AS pnl
        FROM public.stocks s
        WHERE s.user_id = auth.uid() AND s.exit_date IS NOT NULL AND s.exit_price IS NOT NULL
          AND (
            (p_time_range = '7d' AND s.exit_date >= (CURRENT_DATE - INTERVAL '7 days')) OR
            (p_time_range = '30d' AND s.exit_date >= (CURRENT_DATE - INTERVAL '30 days')) OR
            (p_time_range = '90d' AND s.exit_date >= (CURRENT_DATE - INTERVAL '90 days')) OR
            (p_time_range = '1y' AND s.exit_date >= (CURRENT_DATE - INTERVAL '1 year')) OR
            (p_time_range = 'ytd' AND s.exit_date >= DATE_TRUNC('year', CURRENT_DATE)) OR
            (p_time_range = 'custom' AND s.exit_date >= p_custom_start_date AND s.exit_date <= p_custom_end_date) OR
            (p_time_range = 'all_time')
          )

        UNION ALL

        SELECT
            o.symbol,
            CASE
                WHEN o.trade_direction = 'Bullish' AND o.option_type = 'Call' THEN (o.exit_price - o.entry_price) * 100 * o.number_of_contracts - o.commissions
                WHEN o.trade_direction = 'Bullish' AND o.option_type = 'Put' THEN -((o.exit_price - o.entry_price) * 100 * o.number_of_contracts) - o.commissions
                WHEN o.trade_direction = 'Bearish' AND o.option_type = 'Put' THEN (o.entry_price - o.exit_price) * 100 * o.number_of_contracts - o.commissions
                WHEN o.trade_direction = 'Bearish' AND o.option_type = 'Call' THEN -((o.entry_price - o.exit_price) * 100 * o.number_of_contracts) - o.commissions
                ELSE 0
            END AS pnl
        FROM public.options o
        WHERE o.user_id = auth.uid() AND o.status = 'closed' AND o.exit_price IS NOT NULL
          AND (
            (p_time_range = '7d' AND o.exit_date >= (CURRENT_DATE - INTERVAL '7 days')) OR
            (p_time_range = '30d' AND o.exit_date >= (CURRENT_DATE - INTERVAL '30 days')) OR
            (p_time_range = '90d' AND o.exit_date >= (CURRENT_DATE - INTERVAL '90 days')) OR
            (p_time_range = '1y' AND o.exit_date >= (CURRENT_DATE - INTERVAL '1 year')) OR
            (p_time_range = 'ytd' AND o.exit_date >= DATE_TRUNC('year', CURRENT_DATE)) OR
            (p_time_range = 'custom' AND o.exit_date >= p_custom_start_date AND o.exit_date <= p_custom_end_date) OR
            (p_time_range = 'all_time')
          )
    ),
    aggregated_pnl AS (
        -- Sum up the PnL for each symbol
        SELECT
            symbol,
            SUM(pnl) as total_pnl
        FROM symbol_pnl
        GROUP BY symbol
    ),
    most_profitable AS (
        -- Rank most profitable
        SELECT
            symbol,
            total_pnl,
            'Most Profitable'::TEXT as ranking_type
        FROM aggregated_pnl
        WHERE total_pnl > 0
        ORDER BY total_pnl DESC
        LIMIT p_limit
    ),
    least_profitable AS (
        -- Rank least profitable
        SELECT
            symbol,
            total_pnl,
            'Least Profitable'::TEXT as ranking_type
        FROM aggregated_pnl
        WHERE total_pnl < 0
        ORDER BY total_pnl ASC
        LIMIT p_limit
    )
    -- Combine the two lists
    SELECT * FROM most_profitable
    UNION ALL
    SELECT * FROM least_profitable;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_symbol_profitability_ranking(INTEGER, TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_symbol_profitability_ranking IS 'Returns the most and least profitable symbols based on net PnL.

Parameters:
- p_limit: The number of symbols to return for each category (most/least profitable).
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- symbol: The ticker symbol.
- total_pnl: The total net profit or loss for the symbol.
- ranking_type: ''Most Profitable'' or ''Least Profitable''.

Example usage:
-- Get the top 3 most and least profitable symbols for all time
SELECT * FROM get_symbol_profitability_ranking(3);

-- Get the top 5 for the last 90 days
SELECT * FROM get_symbol_profitability_ranking(5, ''90d'');
';
