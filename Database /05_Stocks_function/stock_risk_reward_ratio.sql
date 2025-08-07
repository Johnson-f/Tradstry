-- Function to calculate risk to reward ratio for stock trades
-- Risk/Reward Ratio = Average Loss / Average Gain
CREATE OR REPLACE FUNCTION public.stock_risk_reward_ratio(user_id uuid)
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

-- Testing on supabase SQL editor
-- SELECT public.stock_risk_reward_ratio('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as risk_reward_ratio;
