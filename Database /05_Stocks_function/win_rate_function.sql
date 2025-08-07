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