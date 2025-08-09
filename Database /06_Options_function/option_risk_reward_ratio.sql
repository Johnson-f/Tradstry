-- Function to calculate risk to reward ratio for option trades with date range filtering
-- Risk/Reward Ratio = Average Loss / Average Gain
CREATE OR REPLACE FUNCTION public.option_risk_reward_ratio(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    average_gain numeric;
    average_loss numeric;
    risk_reward_ratio numeric;
BEGIN
    -- Get average gain for winning trades with the same date range
    EXECUTE 'SELECT public.option_average_gain($1, $2, $3, $4)'
    INTO average_gain
    USING user_id, period_type, custom_start_date, custom_end_date;
    
    -- Get average loss for losing trades with the same date range
    EXECUTE 'SELECT public.option_average_loss($1, $2, $3, $4)'
    INTO average_loss
    USING user_id, period_type, custom_start_date, custom_end_date;
    
    -- Calculate risk/reward ratio (avoid division by zero)
    IF COALESCE(average_gain, 0) > 0 THEN
        risk_reward_ratio := average_loss / average_gain;
    ELSE
        risk_reward_ratio := 0;
    END IF;
    
    RETURN ROUND(COALESCE(risk_reward_ratio, 0), 2);
END;
$$ LANGUAGE plpgsql;

-- Testing with Supabase SQL Editor 
-- Testing on supabase SQL Editor 
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.option_risk_reward_ratio('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range 
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.option_risk_reward_ratio(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid, 
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;

/* 
Old function 
CREATE OR REPLACE FUNCTION public.option_risk_reward_ratio(
  user_id uuid
)
RETURNS numeric AS $$

*/

-- Old Testing on supabase SQL editor
-- SELECT public.option_risk_reward_ratio('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as risk_reward_ratio;
