-- Combined function to calculate risk-reward ratio (stocks and options)
-- Uses get_combined_average_gain and get_combined_average_loss functions
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
