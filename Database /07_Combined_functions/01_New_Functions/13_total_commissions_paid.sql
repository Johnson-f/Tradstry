-- Function to get the total commissions paid from both stocks and options
CREATE OR REPLACE FUNCTION public.get_total_commissions(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(SUM(total_commissions), 0)
    FROM (
        -- Stock commissions
        SELECT
            commissions AS total_commissions
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

        -- Option commissions
        SELECT
            commissions AS total_commissions
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
    ) AS all_commissions;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_total_commissions(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_total_commissions IS 'Calculates the total commissions paid for all trades (stocks and options).

Parameters:
- p_time_range: Time range filter (e.g., ''7d'', ''30d'', ''all_time'').
- p_custom_start_date: Start date for custom range.
- p_custom_end_date: End date for custom range.

Returns:
- The total sum of commissions paid.

Example usage:
-- Get total commissions for the last 90 days
SELECT * FROM get_total_commissions(''90d'');

-- Get total commissions for all time
SELECT * FROM get_total_commissions();
';
