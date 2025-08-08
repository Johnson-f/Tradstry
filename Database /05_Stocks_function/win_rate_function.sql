CREATE OR REPLACE FUNCTION public.stock_win_rate(user_id uuid)
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




-- first version 
/*
CREATE OR REPLACE FUNCTION public.stock_win_rate(user_id uuid)
RETURNS numeric AS $$
DECLARE
    total_closed_trades integer;
    winning_trades integer;
    win_rate numeric;
BEGIN
    -- Count total closed trades for the user
    SELECT COUNT(*) INTO total_closed_trades
    FROM public.stocks
    WHERE stocks.user_id = stock_win_rate.user_id  -- Fixed this line
    AND stocks.status = 'closed';
    
    -- Count winning trades for the user
    SELECT COUNT(*) INTO winning_trades
    FROM public.stocks
    WHERE stocks.user_id = stock_win_rate.user_id  -- Fixed this line
    AND stocks.status = 'closed'
    AND (
        (stocks.trade_type = 'BUY' AND stocks.exit_price > stocks.entry_price) OR
        (stocks.trade_type = 'SELL' AND stocks.exit_price < stocks.entry_price)
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