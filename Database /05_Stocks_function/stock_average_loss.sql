-- Function to calculate average loss for stock trades
CREATE OR REPLACE FUNCTION public.stock_average_loss(user_id uuid)
RETURNS numeric AS $$
DECLARE
    average_loss numeric;
BEGIN
    -- Calculate average loss for losing trades (as a positive number)
    SELECT COALESCE(AVG(
        ABS(CASE 
            WHEN stocks.trade_type = 'BUY' THEN (stocks.exit_price - stocks.entry_price) * stocks.number_shares - stocks.commissions
            WHEN stocks.trade_type = 'SELL' THEN (stocks.entry_price - stocks.exit_price) * stocks.number_shares - stocks.commissions
        END)
    ), 0) INTO average_loss
    FROM public.stocks
    WHERE stocks.user_id = stock_average_loss.user_id
    AND stocks.status = 'closed'
    AND (
        (stocks.trade_type = 'BUY' AND stocks.exit_price < stocks.entry_price) OR
        (stocks.trade_type = 'SELL' AND stocks.exit_price > stocks.entry_price)
    );
    
    RETURN average_loss;
END;
$$ LANGUAGE plpgsql;

-- Testing on supabase SQL editor
-- SELECT public.stock_average_loss('99369696-8c65-43bb-96bc-5999275e8be1'::uuid) as average_loss;
