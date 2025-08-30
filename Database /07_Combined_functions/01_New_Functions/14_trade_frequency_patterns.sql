-- Function to get trading frequency patterns by day of the week and hour of the day
CREATE OR REPLACE FUNCTION public.get_trade_frequency_patterns(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    pattern_type TEXT,
    pattern_value TEXT,
    trade_count BIGINT,
    win_rate NUMERIC,
    net_pnl NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_trades AS (
        -- Combine stocks and options with their PnL and entry timestamp
        SELECT
            entry_date,
            CASE
                WHEN trade_type = 'BUY' THEN (exit_price - entry_price) * number_shares - commissions
                ELSE (entry_price - exit_price) * number_shares - commissions
            END AS pnl
        FROM public.stocks
        WHERE user_id = auth.uid() AND exit_date IS NOT NULL AND exit_price IS NOT NULL
          AND (
            (p_time_range = '7d' AND exit_date >= (CURRENT_DATE - INTERVAL '7 days')) OR
            (p_time_range = '30d' AND exit_date >= (CURRENT_DATE - INTERVAL '30 days')) OR
            (p_time_range = '90d' AND exit_date >= (CURRENT_DATE - INTERVAL '90 days')) OR
            (p_time_range = '1y' AND exit_date >= (CURRENT_DATE - INTERVAL '1 year')) OR
            (p_time_range = 'ytd' AND exit_date >= DATE_TRUNC('year', CURRENT_DATE)) OR
            (p_time_range = 'custom' AND exit_date >= p_custom_start_date AND exit_date <= p_custom_end_date) OR
            (p_time_range = 'all_time')
          )

        UNION ALL

        SELECT
            entry_date,
            CASE
                WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN (exit_price - entry_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN -((exit_price - entry_price) * 100 * number_of_contracts) - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN (entry_price - exit_price) * 100 * number_of_contracts - commissions
                WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN -((entry_price - exit_price) * 100 * number_of_contracts) - commissions
                ELSE 0
            END AS pnl
        FROM public.options
        WHERE user_id = auth.uid() AND status = 'closed' AND exit_price IS NOT NULL
          AND (
            (p_time_range = '7d' AND exit_date >= (CURRENT_DATE - INTERVAL '7 days')) OR
            (p_time_range = '30d' AND exit_date >= (CURRENT_DATE - INTERVAL '30 days')) OR
            (p_time_range = '90d' AND exit_date >= (CURRENT_DATE - INTERVAL '90 days')) OR
            (p_time_range = '1y' AND exit_date >= (CURRENT_DATE - INTERVAL '1 year')) OR
            (p_time_range = 'ytd' AND exit_date >= DATE_TRUNC('year', CURRENT_DATE)) OR
            (p_time_range = 'custom' AND exit_date >= p_custom_start_date AND exit_date <= p_custom_end_date) OR
            (p_time_range = 'all_time')
          )
    ),
    by_day AS (
        SELECT
            'Day of Week' AS pattern_type,
            TRIM(TO_CHAR(entry_date, 'Day')) AS pattern_value,
            COUNT(*) AS trade_count,
            COALESCE(ROUND(100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2), 0) AS win_rate,
            COALESCE(SUM(pnl), 0) AS net_pnl
        FROM all_trades
        GROUP BY pattern_value
    ),
    by_hour AS (
        SELECT
            'Hour of Day' AS pattern_type,
            TO_CHAR(entry_date, 'HH24:00') AS pattern_value,
            COUNT(*) AS trade_count,
            COALESCE(ROUND(100.0 * SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 2), 0) AS win_rate,
            COALESCE(SUM(pnl), 0) AS net_pnl
        FROM all_trades
        GROUP BY pattern_value
    )
    SELECT * FROM by_day
    UNION ALL
    SELECT * FROM by_hour
    ORDER BY pattern_type, pattern_value;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_trade_frequency_patterns(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_trade_frequency_patterns IS 'Returns trading frequency and performance patterns by day of the week and hour of the day.

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- pattern_type: The type of pattern (e.g., ''Day of Week'', ''Hour of Day'').
- pattern_value: The specific value for the pattern (e.g., ''Monday'', ''14:00'').
- trade_count: The total number of trades for that pattern.
- win_rate: The win rate for that pattern.
- net_pnl: The net PnL for that pattern.

Example usage:
-- Get frequency patterns for the last 90 days
SELECT * FROM get_trade_frequency_patterns(''90d'');

-- Get frequency patterns for all time
SELECT * FROM get_trade_frequency_patterns();
';
