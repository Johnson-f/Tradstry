-- Function to calculate trade expectancy for option trades
-- Trade Expectancy = (Win Rate * Average Gain) - (Loss Rate * Average Loss)
CREATE OR REPLACE FUNCTION public.option_trade_expectancy(user_id uuid)
RETURNS numeric AS $$
DECLARE
    win_rate numeric;
    loss_rate numeric;
    avg_gain numeric;
    avg_loss numeric;
    expectancy numeric;
    total_trades integer;
BEGIN
    -- Calculate win rate (as a decimal)
    SELECT (public.option_win_rate(user_id) / 100) INTO win_rate;
    
    -- Calculate loss rate (1 - win_rate)
    loss_rate := 1 - win_rate;
    
    -- Get average gain (already calculated in the average_gain function)
    SELECT public.option_average_gain(user_id) INTO avg_gain;
    
    -- Get average loss (already calculated in the average_loss function)
    SELECT public.option_average_loss(user_id) INTO avg_loss;
    
    -- Calculate total trades count
    SELECT COUNT(*) INTO total_trades
    FROM public.options
    WHERE options.user_id = option_trade_expectancy.user_id
    AND options.status = 'closed';
    
    -- Calculate expectancy
    IF total_trades > 0 THEN
        expectancy := (win_rate * avg_gain) - (loss_rate * avg_loss);
    ELSE
        expectancy := 0;
    END IF;
    
    RETURN ROUND(expectancy, 2);
END;
$$ LANGUAGE plpgsql;

-- Testing on supabase SQL editor
-- SELECT public.option_trade_expectancy('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as trade_expectancy;
