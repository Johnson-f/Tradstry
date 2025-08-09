-- Function to calculate trade expectancy for option trades with date range filtering
-- Trade Expectancy = (Win Rate * Average Gain) - (Loss Rate * Average Loss)
CREATE OR REPLACE FUNCTION public.option_trade_expectancy(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    win_rate numeric;
    avg_gain numeric;
    avg_loss numeric;
    trade_expectancy numeric;
    win_rate_decimal numeric;
    start_date TIMESTAMP WITH TIME ZONE;
    end_date TIMESTAMP WITH TIME ZONE := NOW();
BEGIN
    -- Set date range based on period_type
    CASE period_type
        WHEN '7d' THEN start_date := NOW() - INTERVAL '7 days';
        WHEN '30d' THEN start_date := NOW() - INTERVAL '30 days';
        WHEN '90d' THEN start_date := NOW() - INTERVAL '90 days';
        WHEN '1y' THEN start_date := NOW() - INTERVAL '1 year';
        WHEN 'custom' THEN 
            start_date := custom_start_date;
            end_date := COALESCE(custom_end_date, NOW());
        ELSE start_date := '1970-01-01'::TIMESTAMP; -- All time
    END CASE;

    -- Get win rate with the same date range (as a decimal between 0 and 1)
    EXECUTE 'SELECT public.option_win_rate($1, $2, $3, $4) / 100.0'
    INTO win_rate_decimal
    USING user_id, period_type, custom_start_date, custom_end_date;
    
    -- Get average gain for winning trades with the same date range
    EXECUTE 'SELECT public.option_average_gain($1, $2, $3, $4)'
    INTO avg_gain
    USING user_id, period_type, custom_start_date, custom_end_date;
    
    -- Get average loss for losing trades with the same date range
    EXECUTE 'SELECT public.option_average_loss($1, $2, $3, $4)'
    INTO avg_loss
    USING user_id, period_type, custom_start_date, custom_end_date;
    
    -- Calculate trade expectancy
    IF win_rate_decimal IS NOT NULL AND avg_gain IS NOT NULL AND avg_loss IS NOT NULL THEN
        trade_expectancy := (win_rate_decimal * avg_gain) - ((1 - win_rate_decimal) * avg_loss);
    ELSE
        trade_expectancy := 0;
    END IF;
    
    RETURN ROUND(COALESCE(trade_expectancy, 0), 2);
END;
$$ LANGUAGE plpgsql;

-- Testing with Supabase SQL Editor 
-- Testing on supabase SQL Editor 
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.option_trade_expectancy('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range 
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.option_trade_expectancy(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid, 
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;

/* 
Old function 
CREATE OR REPLACE FUNCTION public.option_trade_expectancy(
  user_id uuid
)
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
*/

-- Old Testing on supabase SQL editor
-- SELECT public.option_trade_expectancy('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as trade_expectancy;
