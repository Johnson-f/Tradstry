-- Function to calculate average loss for option trades
CREATE OR REPLACE FUNCTION public.option_average_loss(user_id uuid)
RETURNS numeric AS $$
DECLARE
    average_loss numeric;
BEGIN
    -- Calculate average loss for losing trades (as a positive number)
    SELECT COALESCE(AVG(
        ABS(CASE 
            WHEN options.strategy_type ILIKE '%long%' THEN (options.exit_price - options.entry_price) * options.number_of_contracts - options.commissions
            WHEN options.strategy_type ILIKE '%short%' THEN (options.entry_price - options.exit_price) * options.number_of_contracts - options.commissions
            WHEN options.trade_direction = 'Bullish' THEN (options.exit_price - options.entry_price) * options.number_of_contracts - options.commissions
            WHEN options.trade_direction = 'Bearish' THEN (options.entry_price - options.exit_price) * options.number_of_contracts - options.commissions
            ELSE 0
        END)
    ), 0) INTO average_loss
    FROM public.options
    WHERE options.user_id = option_average_loss.user_id
    AND options.status = 'closed'
    AND (
        -- For long positions (BUY), losing trades have lower exit prices
        (options.strategy_type ILIKE '%long%' AND options.exit_price < options.entry_price) OR
        -- For short positions (SELL), losing trades have higher exit prices
        (options.strategy_type ILIKE '%short%' AND options.exit_price > options.entry_price) OR
        -- For bullish trades, losing when exit_price < entry_price
        (options.trade_direction = 'Bullish' AND options.exit_price < options.entry_price) OR
        -- For bearish trades, losing when exit_price > entry_price
        (options.trade_direction = 'Bearish' AND options.exit_price > options.entry_price)
    );
    
    RETURN average_loss;
END;
$$ LANGUAGE plpgsql;

-- Testing on supabase SQL editor
-- SELECT public.option_average_loss('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as average_loss;
