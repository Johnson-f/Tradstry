CREATE OR REPLACE FUNCTION public.stock_win_rate(
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

    -- Debug: Print the user_id and date range being used
    RAISE NOTICE 'Calculating win rate for user_id: %', user_id;
    RAISE NOTICE 'Date range: % to %', start_date, end_date;
    
    -- Count total closed trades for the user within the date range
    SELECT COUNT(*) INTO total_closed_trades
    FROM public.stocks
    WHERE stocks.user_id = $1
    AND stocks.status = 'closed'
    AND stocks.exit_date BETWEEN start_date AND end_date
    AND stocks.entry_price IS NOT NULL
    AND stocks.exit_price IS NOT NULL;
    
    -- Debug: Print total closed trades
    RAISE NOTICE 'Total closed trades: %', total_closed_trades;
    
    -- Count winning trades for the user within the date range
    SELECT COUNT(*) INTO winning_trades
    FROM public.stocks
    WHERE stocks.user_id = $1
    AND stocks.status = 'closed'
    AND stocks.exit_date BETWEEN start_date AND end_date
    AND stocks.entry_price IS NOT NULL
    AND stocks.exit_price IS NOT NULL
    AND (
        (stocks.trade_type = 'BUY' AND stocks.exit_price > stocks.entry_price) OR
        (stocks.trade_type = 'SELL' AND stocks.exit_price < stocks.entry_price)
    );
    
    -- Debug: Print winning trades
    RAISE NOTICE 'Winning trades: %', winning_trades;
    
    -- Calculate win rate percentage with 2 decimal places
    IF total_closed_trades > 0 THEN
        win_rate := ROUND((winning_trades::numeric / total_closed_trades::numeric) * 100, 2);
        -- Debug: Print calculated win rate
        RAISE NOTICE 'Calculated win rate: %', win_rate;
    ELSE
        win_rate := 0;
        RAISE NOTICE 'No closed trades found for win rate calculation in the specified date range';
    END IF;
    
    RETURN win_rate;
END;
$$ LANGUAGE plpgsql;

-- Testing with Supabase SQL Editor 
-- Testing on supabase SQL Editor 
-- Test 2: 7-day period
-- SELECT 'Test 2: 7-day period' as test_name,
--        public.stock_win_rate('99369696-8c65-43bb-96bc-5999275e8be1'::uuid, '7d') as result;

-- Custom date range 
-- SELECT 'Test 6: Custom date range' as test_name,
--        public.stock_win_rate(
--            '99369696-8c65-43bb-96bc-5999275e8be1'::uuid, 
--            'custom',
--            '2024-01-01'::TIMESTAMP WITH TIME ZONE,
--            '2024-12-31'::TIMESTAMP WITH TIME ZONE
--        ) as result;

/* 
Old function 
CREATE OR REPLACE FUNCTION public.stock_win_rate(
     user_id uuid
)
RETURNS numeric AS $$
DECLARE
    total_closed_trades integer;
    winning_trades integer;
    win_rate numeric;
BEGIN
    -- Debug: Print the user_id being used
    RAISE NOTICE 'Calculating win rate for user_id: %', user_id;
    
    -- Count total closed trades for the user
    SELECT COUNT(*) INTO total_closed_trades
    FROM public.stocks
    WHERE stocks.user_id = $1  -- Use the function parameter directly
    AND stocks.status = 'closed'
    AND stocks.entry_price IS NOT NULL
    AND stocks.exit_price IS NOT NULL;
    
    -- Debug: Print total closed trades
    RAISE NOTICE 'Total closed trades: %', total_closed_trades;
    
    -- Count winning trades for the user
    SELECT COUNT(*) INTO winning_trades
    FROM public.stocks
    WHERE stocks.user_id = $1  -- Use the function parameter directly
    AND stocks.status = 'closed'
    AND stocks.entry_price IS NOT NULL
    AND stocks.exit_price IS NOT NULL
    AND (
        (stocks.trade_type = 'BUY' AND stocks.exit_price > stocks.entry_price) OR
        (stocks.trade_type = 'SELL' AND stocks.exit_price < stocks.entry_price)
    );
    
    -- Debug: Print winning trades
    RAISE NOTICE 'Winning trades: %', winning_trades;
    
    -- Calculate win rate percentage with 2 decimal places
    IF total_closed_trades > 0 THEN
        win_rate := ROUND((winning_trades::numeric / total_closed_trades::numeric) * 100, 2);
        -- Debug: Print calculated win rate
        RAISE NOTICE 'Calculated win rate: %', win_rate;
    ELSE
        win_rate := 0;
        RAISE NOTICE 'No closed trades found for win rate calculation';
    END IF;
    
    RETURN win_rate;
END;
$$ LANGUAGE plpgsql;

*/