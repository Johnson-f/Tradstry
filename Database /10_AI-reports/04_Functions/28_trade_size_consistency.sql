-- Function to calculate trade size consistency using the coefficient of variation
CREATE OR REPLACE FUNCTION public.get_trade_size_consistency(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    consistency_score NUMERIC,
    consistency_label TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH all_trade_sizes AS (
        -- Stock trade sizes (position value at entry)
        SELECT
            entry_price * number_shares AS trade_size
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

        -- Option trade sizes (total premium paid/received)
        SELECT
            total_premium AS trade_size
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
    stats AS (
        SELECT
            STDDEV(trade_size) as std_dev_size,
            AVG(trade_size) as avg_size
        FROM all_trade_sizes
    )
    SELECT
        -- Calculate Coefficient of Variation (CV)
        COALESCE(ROUND((stats.std_dev_size / NULLIF(stats.avg_size, 0))::numeric, 2), 0) AS consistency_score,
        -- Assign a label based on the CV score
        CASE
            WHEN (stats.std_dev_size / NULLIF(stats.avg_size, 0)) <= 0.3 THEN 'Consistent'
            WHEN (stats.std_dev_size / NULLIF(stats.avg_size, 0)) <= 0.7 THEN 'Moderately Consistent'
            WHEN (stats.std_dev_size / NULLIF(stats.avg_size, 0)) > 0.7 THEN 'Inconsistent'
            ELSE 'N/A'
        END AS consistency_label
    FROM stats;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_trade_size_consistency(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_trade_size_consistency IS 'Calculates trade size consistency using the coefficient of variation (StdDev / Avg).

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- consistency_score: The coefficient of variation (lower is more consistent).
- consistency_label: A text label describing the consistency.

Example usage:
-- Get trade size consistency for the last 90 days
SELECT * FROM get_trade_size_consistency(''90d'');

-- Get trade size consistency for all time
SELECT * FROM get_trade_size_consistency();
';
