-- Function to calculate average gain for option trades with date range filtering
CREATE OR REPLACE FUNCTION public.option_average_gain(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    average_gain numeric;
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

    -- Calculate average gain for winning trades within the date range
    SELECT COALESCE(AVG(
        CASE 
            WHEN options.strategy_type ILIKE '%long%' THEN (options.exit_price - options.entry_price) * options.number_of_contracts - options.commissions
            WHEN options.strategy_type ILIKE '%short%' THEN (options.entry_price - options.exit_price) * options.number_of_contracts - options.commissions
            WHEN options.trade_direction = 'Bullish' THEN (options.exit_price - options.entry_price) * options.number_of_contracts - options.commissions
            WHEN options.trade_direction = 'Bearish' THEN (options.entry_price - options.exit_price) * options.number_of_contracts - options.commissions
            ELSE 0
        END
    ), 0) INTO average_gain
    FROM public.options
    WHERE options.user_id = $1
    AND options.status = 'closed'
    AND options.exit_date BETWEEN start_date AND end_date
    AND (
        -- For long positions (BUY), winning trades have higher exit prices
        (options.strategy_type ILIKE '%long%' AND options.exit_price > options.entry_price) OR
        -- For short positions (SELL), winning trades have lower exit prices
        (options.strategy_type ILIKE '%short%' AND options.exit_price < options.entry_price) OR
        -- For bullish trades, winning when exit_price > entry_price
        (options.trade_direction = 'Bullish' AND options.exit_price > options.entry_price) OR
        -- For bearish trades, winning when exit_price < entry_price
        (options.trade_direction = 'Bearish' AND options.exit_price < options.entry_price)
    );
    
    RETURN average_gain;
END;
$$ LANGUAGE plpgsql;

-- Testing with Supabase SQL Editor 
-- Testing on supabase SQL Editor 
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.option_average_gain('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range 
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.option_average_gain(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid, 
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;

/* 
Old Function 
CREATE OR REPLACE FUNCTION public.option_average_gain(
     user_id uuid
)
RETURNS numeric AS $$
DECLARE
    average_gain numeric;
BEGIN
    -- Calculate average gain for winning trades
    SELECT COALESCE(AVG(
        CASE 
            WHEN options.strategy_type ILIKE '%long%' THEN (options.exit_price - options.entry_price) * options.number_of_contracts - options.commissions
            WHEN options.strategy_type ILIKE '%short%' THEN (options.entry_price - options.exit_price) * options.number_of_contracts - options.commissions
            WHEN options.trade_direction = 'Bullish' THEN (options.exit_price - options.entry_price) * options.number_of_contracts - options.commissions
            WHEN options.trade_direction = 'Bearish' THEN (options.entry_price - options.exit_price) * options.number_of_contracts - options.commissions
            ELSE 0
        END
    ), 0) INTO average_gain
    FROM public.options
    WHERE options.user_id = option_average_gain.user_id
    AND options.status = 'closed'
    AND (
        -- For long positions (BUY), winning trades have higher exit prices
        (options.strategy_type ILIKE '%long%' AND options.exit_price > options.entry_price) OR
        -- For short positions (SELL), winning trades have lower exit prices
        (options.strategy_type ILIKE '%short%' AND options.exit_price < options.entry_price) OR
        -- For bullish trades, winning when exit_price > entry_price
        (options.trade_direction = 'Bullish' AND options.exit_price > options.entry_price) OR
        -- For bearish trades, winning when exit_price < entry_price
        (options.trade_direction = 'Bearish' AND options.exit_price < options.entry_price)
    );
    
    RETURN average_gain;
END;
$$ LANGUAGE plpgsql;

*/
-- Old Testing on supabase SQL editor
-- SELECT public.option_average_gain('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as average_gain;
