-- Function to get the longest winning and losing streaks from both stocks and options
CREATE OR REPLACE FUNCTION public.get_streaks(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    streak_type TEXT,
    streak_length BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_trades_with_outcome AS (
        -- Combine stocks and options and determine the outcome (win, loss, or break-even)
        SELECT
            exit_date,
            CASE
                WHEN (trade_type = 'BUY' AND exit_price > entry_price) OR (trade_type = 'SELL' AND exit_price < entry_price) THEN 'WIN'
                WHEN (trade_type = 'BUY' AND exit_price < entry_price) OR (trade_type = 'SELL' AND exit_price > entry_price) THEN 'LOSS'
                ELSE 'BREAK_EVEN'
            END AS outcome
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
            exit_date,
            CASE
                WHEN (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
                     (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price) THEN 'WIN'
                WHEN (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price < entry_price) OR
                     (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price > entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price < entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price > entry_price) THEN 'LOSS'
                ELSE 'BREAK_EVEN'
            END AS outcome
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
    streaks AS (
        -- Identify streaks of consecutive wins or losses
        SELECT
            outcome,
            COUNT(*) AS length
        FROM (
            SELECT
                outcome,
                SUM(CASE WHEN outcome = prev_outcome THEN 0 ELSE 1 END) OVER (ORDER BY exit_date) as streak_group
            FROM (
                SELECT
                    exit_date,
                    outcome,
                    LAG(outcome, 1, ''::text) OVER (ORDER BY exit_date) AS prev_outcome
                FROM all_trades_with_outcome
                WHERE outcome != 'BREAK_EVEN'
            ) AS sub
        ) AS sub2
        GROUP BY streak_group, outcome
    )
    -- Final result: max winning and losing streaks
    SELECT 'Winning' as streak_type, COALESCE(MAX(length), 0)::BIGINT as streak_length FROM streaks WHERE outcome = 'WIN'
    UNION ALL
    SELECT 'Losing' as streak_type, COALESCE(MAX(length), 0)::BIGINT as streak_length FROM streaks WHERE outcome = 'LOSS';
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_streaks(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_streaks IS 'Calculates the longest consecutive winning and losing trade streaks.

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- streak_type: ''Winning'' or ''Losing''.
- streak_length: The length of the longest streak.

Example usage:
-- Get streaks for the last 90 days
SELECT * FROM get_streaks(''90d'');

-- Get streaks for all time
SELECT * FROM get_streaks();
';
