-- Function to get combined risk per trade from both stocks and options
CREATE OR REPLACE FUNCTION public.get_combined_risk_per_trade(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
    asset_type TEXT,
    average_risk_per_trade NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
    -- Stocks average risk per trade
    SELECT 
        'Stocks' as asset_type,
        COALESCE(ROUND(AVG(
            CASE 
                WHEN trade_type = 'BUY' THEN (entry_price - stop_loss) * number_shares
                WHEN trade_type = 'SELL' THEN (stop_loss - entry_price) * number_shares
            END
        ), 2), 0) as average_risk_per_trade
    FROM public.stocks
    WHERE 
        user_id = auth.uid()
        AND status = 'closed'
        AND stop_loss IS NOT NULL
        AND (
            (p_time_range = '7d' AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
            OR (p_time_range = '30d' AND entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
            OR (p_time_range = '90d' AND entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
            OR (p_time_range = '1y' AND entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
            OR (p_time_range = 'ytd' AND entry_date >= DATE_TRUNC('year', CURRENT_DATE))
            OR (p_time_range = 'custom' AND
                (p_custom_start_date IS NULL OR entry_date >= p_custom_start_date) AND
                (p_custom_end_date IS NULL OR entry_date <= p_custom_end_date))
            OR (p_time_range = 'all_time')
        )
    
    UNION ALL
    
    -- Options average risk per trade
    SELECT 
        'Options' as asset_type,
        COALESCE(ROUND(AVG(
            CASE 
                WHEN option_type = 'CALL' AND trade_direction = 'BUY' THEN (total_premium * number_of_contracts * 100)
                WHEN option_type = 'PUT' AND trade_direction = 'BUY' THEN (total_premium * number_of_contracts * 100)
                WHEN option_type = 'CALL' AND trade_direction = 'SELL' THEN 
                    CASE 
                        WHEN strike_price IS NOT NULL THEN ((strike_price - entry_price + total_premium) * number_of_contracts * 100)
                        ELSE (total_premium * number_of_contracts * 100)
                    END
                WHEN option_type = 'PUT' AND trade_direction = 'SELL' THEN 
                    CASE 
                        WHEN strike_price IS NOT NULL THEN ((entry_price - strike_price + total_premium) * number_of_contracts * 100)
                        ELSE (total_premium * number_of_contracts * 100)
                    END
                ELSE 0
            END
        ), 2), 0) as average_risk_per_trade
    FROM public.options
    WHERE 
        user_id = auth.uid()
        AND status = 'closed'
        AND (
            (p_time_range = '7d' AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
            OR (p_time_range = '30d' AND entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
            OR (p_time_range = '90d' AND entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
            OR (p_time_range = '1y' AND entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
            OR (p_time_range = 'ytd' AND entry_date >= DATE_TRUNC('year', CURRENT_DATE))
            OR (p_time_range = 'custom' AND
                (p_custom_start_date IS NULL OR entry_date >= p_custom_start_date) AND
                (p_custom_end_date IS NULL OR entry_date <= p_custom_end_date))
            OR (p_time_range = 'all_time')
        )
    
    UNION ALL
    
    -- Combined average risk per trade
    SELECT 
        'Combined' as asset_type,
        COALESCE(
            (SELECT COALESCE(ROUND(AVG(
                CASE 
                    WHEN trade_type = 'BUY' THEN (entry_price - stop_loss) * number_shares
                    WHEN trade_type = 'SELL' THEN (stop_loss - entry_price) * number_shares
                END
            ), 2), 0)
             FROM public.stocks
             WHERE user_id = auth.uid()
             AND status = 'closed'
             AND stop_loss IS NOT NULL
             AND (
                 (p_time_range = '7d' AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
                 OR (p_time_range = '30d' AND entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
                 OR (p_time_range = '90d' AND entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
                 OR (p_time_range = '1y' AND entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
                 OR (p_time_range = 'ytd' AND entry_date >= DATE_TRUNC('year', CURRENT_DATE))
                 OR (p_time_range = 'custom' AND
                     (p_custom_start_date IS NULL OR entry_date >= p_custom_start_date) AND
                     (p_custom_end_date IS NULL OR entry_date <= p_custom_end_date))
                 OR (p_time_range = 'all_time')
             ))
            +
            (SELECT COALESCE(ROUND(AVG(
                CASE 
                    WHEN option_type = 'CALL' AND trade_direction = 'BUY' THEN (total_premium * number_of_contracts * 100)
                    WHEN option_type = 'PUT' AND trade_direction = 'BUY' THEN (total_premium * number_of_contracts * 100)
                    WHEN option_type = 'CALL' AND trade_direction = 'SELL' THEN 
                        CASE 
                            WHEN strike_price IS NOT NULL THEN ((strike_price - entry_price + total_premium) * number_of_contracts * 100)
                            ELSE (total_premium * number_of_contracts * 100)
                        END
                    WHEN option_type = 'PUT' AND trade_direction = 'SELL' THEN 
                        CASE 
                            WHEN strike_price IS NOT NULL THEN ((entry_price - strike_price + total_premium) * number_of_contracts * 100)
                            ELSE (total_premium * number_of_contracts * 100)
                        END
                    ELSE 0
                END
            ), 2), 0)
             FROM public.options
             WHERE user_id = auth.uid()
             AND status = 'closed'
             AND (
                 (p_time_range = '7d' AND entry_date >= (CURRENT_DATE - INTERVAL '7 days'))
                 OR (p_time_range = '30d' AND entry_date >= (CURRENT_DATE - INTERVAL '30 days'))
                 OR (p_time_range = '90d' AND entry_date >= (CURRENT_DATE - INTERVAL '90 days'))
                 OR (p_time_range = '1y' AND entry_date >= (CURRENT_DATE - INTERVAL '1 year'))
                 OR (p_time_range = 'ytd' AND entry_date >= DATE_TRUNC('year', CURRENT_DATE))
                 OR (p_time_range = 'custom' AND
                     (p_custom_start_date IS NULL OR entry_date >= p_custom_start_date) AND
                     (p_custom_end_date IS NULL OR entry_date <= p_custom_end_date))
                 OR (p_time_range = 'all_time')
             )),
            0
        ) as average_risk_per_trade;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_risk_per_trade(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_risk_per_trade IS 'Returns the average risk per trade for both stocks and options.

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
- average_risk_per_trade: Average risk per trade in USD

Example usage:
- Last 30 days: SELECT * FROM get_combined_risk_per_trade(''30d'');
- Custom range: SELECT * FROM get_combined_risk_per_trade(''custom'', ''2024-01-01'', ''2024-12-31'');
- All time: SELECT * FROM get_combined_risk_per_trade();';

-- Testing on Supabase SQL Editor
-- SELECT * FROM get_combined_risk_per_trade('30d');  -- Last 30 days
-- SELECT * FROM get_combined_risk_per_trade('ytd');  -- Year to date
-- SELECT * FROM get_combined_risk_per_trade();       -- All time (default)
