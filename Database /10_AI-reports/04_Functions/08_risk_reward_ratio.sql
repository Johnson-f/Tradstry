-- Combined function to calculate risk-reward ratio (stocks and options)
-- Uses get_combined_average_gain and get_combined_average_loss functions
CREATE OR REPLACE FUNCTION public.get_combined_risk_reward_ratio(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_avg_gain NUMERIC;
    v_avg_loss NUMERIC;
    v_risk_reward_ratio NUMERIC;
BEGIN
    -- Get average gain from winning trades
    SELECT public.get_combined_average_gain(p_time_range, p_custom_start_date, p_custom_end_date) INTO v_avg_gain;

    -- Get average loss from losing trades (absolute value)
    SELECT ABS(public.get_combined_average_loss(p_time_range, p_custom_start_date, p_custom_end_date)) INTO v_avg_loss;

    -- Calculate risk-reward ratio (average gain / average loss)
    -- If there are no losing trades, return the average gain as the ratio
    IF v_avg_loss = 0 THEN
        v_risk_reward_ratio := v_avg_gain;
    ELSE
        v_risk_reward_ratio := v_avg_gain / v_avg_loss;
    END IF;

    -- Return 0 if the result is NULL
    RETURN COALESCE(v_risk_reward_ratio, 0);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_risk_reward_ratio(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_risk_reward_ratio IS 'Calculates the average risk-reward ratio for trades (stocks and options).

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
- Average risk-reward ratio (returns 0 if no trades found or calculation not possible)';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_risk_reward_ratio('30d');  -- Last 30 days
-- SELECT get_combined_risk_reward_ratio('ytd');  -- Year to date
-- SELECT get_combined_risk_reward_ratio();       -- All time (default)


/*
Old function
-- Combined function to calculate risk-reward ratio (stocks and options)
CREATE OR REPLACE FUNCTION public.get_combined_risk_reward_ratio(
    p_time_range TEXT DEFAULT 'all_time',
    p_custom_start_date DATE DEFAULT NULL,
    p_custom_end_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    WITH trade_metrics AS (
        -- Stock trades
        SELECT
            CASE
                WHEN trade_type = 'BUY' AND exit_price > entry_price THEN (exit_price - entry_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' AND exit_price < entry_price THEN (entry_price - exit_price) * number_shares - COALESCE(commissions, 0)
                WHEN trade_type = 'BUY' AND exit_price < entry_price THEN (entry_price - exit_price) * number_shares + COALESCE(commissions, 0)
                WHEN trade_type = 'SELL' AND exit_price > entry_price THEN (exit_price - entry_price) * number_shares + COALESCE(commissions, 0)
                ELSE 0
            END / NULLIF(
                CASE
                    WHEN trade_type = 'BUY' THEN (entry_price - stop_loss) * number_shares + COALESCE(commissions, 0)
                    WHEN trade_type = 'SELL' THEN (stop_loss - entry_price) * number_shares + COALESCE(commissions, 0)
                    ELSE 1
                END, 0
            ) AS risk_reward_ratio
        FROM
            public.stocks
        WHERE
            user_id = auth.uid()
            AND exit_date IS NOT NULL
            AND exit_price IS NOT NULL
            AND stop_loss IS NOT NULL
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

        -- Options trades (simplified risk-reward as options don't have stop_loss)
        SELECT
            CASE
                WHEN (trade_direction = 'Bullish' AND option_type = 'Call' AND exit_price > entry_price) OR
                     (trade_direction = 'Bullish' AND option_type = 'Put' AND exit_price < entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Put' AND exit_price > entry_price) OR
                     (trade_direction = 'Bearish' AND option_type = 'Call' AND exit_price < entry_price)
                THEN
                    CASE
                        WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN
                            (exit_price - entry_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN
                            -((exit_price - entry_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN
                            (entry_price - exit_price) * 100 * number_of_contracts - COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN
                            -((entry_price - exit_price) * 100 * number_of_contracts) - COALESCE(commissions, 0)
                    END
                ELSE
                    CASE
                        WHEN trade_direction = 'Bullish' AND option_type = 'Call' THEN
                            (entry_price - exit_price) * 100 * number_of_contracts + COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bullish' AND option_type = 'Put' THEN
                            -((entry_price - exit_price) * 100 * number_of_contracts) + COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bearish' AND option_type = 'Put' THEN
                            (exit_price - entry_price) * 100 * number_of_contracts + COALESCE(commissions, 0)
                        WHEN trade_direction = 'Bearish' AND option_type = 'Call' THEN
                            -((exit_price - entry_price) * 100 * number_of_contracts) + COALESCE(commissions, 0)
                    END
            END / NULLIF(
                entry_price * 100 * number_of_contracts + COALESCE(commissions, 0),
                0
            ) AS risk_reward_ratio
        FROM
            public.options
        WHERE
            user_id = auth.uid()
            AND status = 'closed'
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
    )
    SELECT
        COALESCE(AVG(risk_reward_ratio), 0) AS avg_risk_reward_ratio
    FROM
        trade_metrics
    WHERE
        risk_reward_ratio IS NOT NULL;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_combined_risk_reward_ratio(TEXT, DATE, DATE) TO authenticated;

-- Add a comment to the function
COMMENT ON FUNCTION public.get_combined_risk_reward_ratio IS 'Calculates the average risk-reward ratio for trades (stocks and options).

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
- Average risk-reward ratio (returns 0 if no trades found or calculation not possible)';

-- Testing on Supabase SQL Editor
-- SELECT get_combined_risk_reward_ratio('30d');  -- Last 30 days
-- SELECT get_combined_risk_reward_ratio('ytd');  -- Year to date
-- SELECT get_combined_risk_reward_ratio();       -- All time (default)

*/
