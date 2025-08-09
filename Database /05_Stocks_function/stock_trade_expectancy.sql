-- Function to calculate trade expectancy for stock trades with date range filtering
-- Trade Expectancy = (Win% * Avg Win) - (Loss% * Avg Loss)
CREATE OR REPLACE FUNCTION public.stock_trade_expectancy(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    win_rate numeric;
    average_gain numeric;
    average_loss numeric;
    trade_expectancy numeric;
    win_rate_decimal numeric;
BEGIN
    -- Get win rate with the same date range (as a decimal between 0 and 1)
    EXECUTE 'SELECT public.stock_win_rate($1, $2, $3, $4) / 100.0'
    INTO win_rate_decimal
    USING user_id, period_type, custom_start_date, custom_end_date;
    
    -- Get average gain for winning trades with the same date range
    EXECUTE 'SELECT public.stock_average_gain($1, $2, $3, $4)'
    INTO average_gain
    USING user_id, period_type, custom_start_date, custom_end_date;
    
    -- Get average loss for losing trades with the same date range
    EXECUTE 'SELECT public.stock_average_loss($1, $2, $3, $4)'
    INTO average_loss
    USING user_id, period_type, custom_start_date, custom_end_date;
    
    -- Calculate trade expectancy
    IF win_rate_decimal IS NOT NULL AND average_gain IS NOT NULL AND average_loss IS NOT NULL THEN
        trade_expectancy := (win_rate_decimal * average_gain) - ((1 - win_rate_decimal) * average_loss);
    ELSE
        trade_expectancy := 0;
    END IF;
    
    RETURN ROUND(COALESCE(trade_expectancy, 0), 2);
END;
$$ LANGUAGE plpgsql;

-- Testing on supabase SQL editor
-- Testing on supabase SQL Editor 
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.stock_trade_expectancy('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range 
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.stock_trade_expectancy(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid, 
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;

/* 
Old function 
CREATE OR REPLACE FUNCTION public.stock_trade_expectancy(
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
    SELECT (public.stock_win_rate(user_id) / 100) INTO win_rate;
    
    -- Calculate loss rate (1 - win_rate)
    loss_rate := 1 - win_rate;
    
    -- Get average gain (already calculated in the average_gain function)
    SELECT public.stock_average_gain(user_id) INTO avg_gain;
    
    -- Get average loss (already calculated in the average_loss function)
    SELECT public.stock_average_loss(user_id) INTO avg_loss;
    
    -- Calculate total trades count
    SELECT COUNT(*) INTO total_trades
    FROM public.stocks
    WHERE stocks.user_id = stock_trade_expectancy.user_id  -- Fixed: now correctly references the parameter
    AND stocks.status = 'closed';
    
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

-- Old testing 
-- SELECT public.stock_trade_expectancy('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as trade_expectancy;
