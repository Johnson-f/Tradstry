-- Function to get combined average position size from both stocks and options
CREATE OR REPLACE FUNCTION public.get_combined_average_position_size(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    asset_type TEXT,
    average_position_size NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    -- Stocks average position size
    SELECT 
        'Stocks' as asset_type,
        COALESCE(ROUND(AVG(entry_price * number_shares), 2), 0) as average_position_size
    FROM public.stocks
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
    
    UNION ALL
    
    -- Options average position size (premium * contracts * 100)
    SELECT 
        'Options' as asset_type,
        COALESCE(ROUND(AVG(
            CASE 
                WHEN number_of_contracts > 0 THEN (total_premium * number_of_contracts * 100)
                ELSE 0
            END
        ), 2), 0) as average_position_size
    FROM public.options
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
    
    UNION ALL
    
    -- Combined total
    SELECT 
        'Combined' as asset_type,
        COALESCE(
            (SELECT COALESCE(ROUND(AVG(entry_price * number_shares), 2), 0)
             FROM public.stocks
             WHERE user_id = auth.uid()
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
             ))
            +
            (SELECT COALESCE(ROUND(AVG(
                CASE 
                    WHEN number_of_contracts > 0 THEN (total_premium * number_of_contracts * 100)
                    ELSE 0
                END
            ), 2), 0)
             FROM public.options
             WHERE user_id = auth.uid()
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
             )),
            0
        ) as average_position_size;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_average_position_size(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_average_position_size IS 'Returns the average position size for both stocks and options.

Parameters:
- p_time_range: Time range filter. Valid values:
  - ''7d'': Last 7 days
  - ''30d'': Last 30 days
  - ''90d'': Last 90 days
  - ''1y'': Last year
  - ''ytd'': Year to date
  - ''custom'': Use custom date range (requires p_custom_start_date and/or p_custom_end_date)
  - ''all_time'': All available data (default)
- p_custom_start_date: Start date for custom range (only used when p_time_range = ''custom'')
- p_custom_end_date: End date for custom range (only used when p_time_range = ''custom'')

Returns:
- asset_type: Type of asset (''Stocks'', ''Options'', or ''Combined'')
- average_position_size: Average position size in USD

Example usage:
- Last 30 days: SELECT * FROM get_combined_average_position_size(''30d'');
- Custom range: SELECT * FROM get_combined_average_position_size(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT * FROM get_combined_average_position_size();';

-- Testing on Supabase SQL Editor
-- SELECT * FROM get_combined_average_position_size('30d');  -- Last 30 days
-- SELECT * FROM get_combined_average_position_size('ytd');  -- Year to date
-- SELECT * FROM get_combined_average_position_size();       -- All time (default)
