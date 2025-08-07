-- Function to calculate win rate percentage for option trades
-- Win rate = (number of winning trades / total number of closed trades) * 100
CREATE OR REPLACE FUNCTION public.option_win_rate(user_id uuid)
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
