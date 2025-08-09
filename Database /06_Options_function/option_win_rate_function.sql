-- Function to calculate win rate percentage for option trades with date range filtering
-- Win rate = (number of winning trades / total number of closed trades) * 100
CREATE OR REPLACE FUNCTION public.option_win_rate(
    user_id uuid,
    period_type TEXT DEFAULT 'all_time',
    custom_start_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    custom_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS numeric AS $$
DECLARE
    total_closed_trades integer;
    winning_trades integer;
    win_rate numeric;
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

    -- Count total closed trades for the user within the date range
    SELECT COUNT(*) INTO total_closed_trades
    FROM public.options
    WHERE options.user_id = $1
    AND options.status = 'closed'
    AND options.exit_date BETWEEN start_date AND end_date;
    
    -- Count winning trades for the user within the date range
    -- A winning trade has a positive profit/loss (exit_price > entry_price for long positions, exit_price < entry_price for short positions)
    SELECT COUNT(*) INTO winning_trades
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
        -- Note: Neutral trades are not specifically handled here as their win condition depends on the specific strategy
    );
    
    -- Calculate win rate percentage with 2 decimal places
    IF total_closed_trades > 0 THEN
        win_rate := ROUND((winning_trades::numeric / total_closed_trades::numeric) * 100, 2);
    ELSE
        win_rate := 0;
    END IF;
    
    RETURN win_rate;
END;
$$ LANGUAGE plpgsql;


-- Testing with Supabase SQL Editor 
-- Testing on supabase SQL Editor 
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.option_win_rate('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range 
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.option_win_rate(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid, 
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;

/* 
Old function 
CREATE OR REPLACE FUNCTION public.option_win_rate(
    user_id uuid
)
RETURNS numeric AS $$
DECLARE
    total_closed_trades integer;
    winning_trades integer;
    win_rate numeric;
BEGIN
    -- Count total closed trades for the user
    SELECT COUNT(*) INTO total_closed_trades
    FROM public.options
    WHERE options.user_id = option_win_rate.user_id
    AND options.status = 'closed';
    
    -- Count winning trades for the user
    -- A winning trade has a positive profit/loss (exit_price > entry_price for long positions, exit_price < entry_price for short positions)
    SELECT COUNT(*) INTO winning_trades
    FROM public.options
    WHERE options.user_id = option_win_rate.user_id
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
        -- Note: Neutral trades are not specifically handled here as their win condition depends on the specific strategy
    );
    
    -- Calculate win rate percentage
    IF total_closed_trades > 0 THEN
        win_rate := (winning_trades::numeric / total_closed_trades::numeric) * 100;
    ELSE
        win_rate := 0;
    END IF;
    
    RETURN win_rate;
END;
$$ LANGUAGE plpgsql;
*/

