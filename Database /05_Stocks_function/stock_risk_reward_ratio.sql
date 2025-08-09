-- Function to calculate risk to reward ratio for stock trades with date range filtering
-- Risk/Reward Ratio = Average Loss / Average Gain
CREATE OR REPLACE FUNCTION public.stock_risk_reward_ratio(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    avg_gain numeric;
    avg_loss numeric;
    risk_reward_ratio numeric;
BEGIN
    -- Get average gain using the stock_average_gain function
    SELECT public.stock_average_gain(
        user_id, 
        period_type, 
        custom_start_date, 
        custom_end_date
    ) INTO avg_gain;
    
    -- Get average loss using the stock_average_loss function
    SELECT public.stock_average_loss(
        user_id, 
        period_type, 
        custom_start_date, 
        custom_end_date
    ) INTO avg_loss;
    
    -- Calculate risk/reward ratio (avoid division by zero)
    IF COALESCE(avg_gain, 0) > 0 THEN
        risk_reward_ratio := ABS(avg_loss) / avg_gain;
    ELSE
        risk_reward_ratio := 0;
    END IF;
    
    RETURN ROUND(COALESCE(risk_reward_ratio, 0), 2);
END;
$$ LANGUAGE plpgsql;

-- Testing on supabase SQL editor
-- Testing on supabase SQL Editor 
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.stock_risk_reward_ratio('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range 
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.stock_risk_reward_ratio(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid, 
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;


/* 
Old function 
CREATE OR REPLACE FUNCTION public.stock_risk_reward_ratio(
     user_id uuid
)
RETURNS numeric AS $$
DECLARE
    average_gain numeric;
    average_loss numeric;
    risk_reward_ratio numeric;
BEGIN
    -- Get average gain for winning trades
    SELECT public.stock_average_gain(user_id) INTO average_gain;
    
    -- Get average loss for losing trades
    SELECT public.stock_average_loss(user_id) INTO average_loss;
    
    -- Calculate risk/reward ratio
    IF average_gain > 0 THEN
        risk_reward_ratio := average_loss / average_gain;
    ELSE
        risk_reward_ratio := 0;
    END IF;
    
    RETURN risk_reward_ratio;
END;
$$ LANGUAGE plpgsql;
*/
-- Old testing 
-- SELECT public.stock_risk_reward_ratio('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as risk_reward_ratio;
