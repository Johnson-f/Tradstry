-- Create unique constraint for natural upsert logic
-- This ensures one record per user per unique stock position
ALTER TABLE public.stocks 
ADD CONSTRAINT unique_stock_position 
UNIQUE (user_id, symbol, trade_type, entry_price, entry_date);

-- True upsert function for stocks table
-- This function inserts a new stock record or updates an existing one based on natural key
CREATE OR REPLACE FUNCTION upsert_stock(
    p_symbol character varying,
    p_trade_type trade_type_enum,
    p_order_type order_type_enum,
    p_entry_price numeric,
    p_stop_loss numeric,
    p_number_shares numeric,
    p_entry_date timestamp without time zone,
    p_exit_price numeric DEFAULT NULL,
    p_commissions numeric DEFAULT 0.00,
    p_take_profit numeric DEFAULT NULL,
    p_exit_date timestamp without time zone DEFAULT NULL,
    p_user_id uuid DEFAULT NULL  -- Optional parameter for manual testing
)
RETURNS TABLE(
    id integer,
    user_id uuid,
    symbol character varying,
    trade_type trade_type_enum,
    order_type order_type_enum,
    entry_price numeric,
    exit_price numeric,
    stop_loss numeric,
    commissions numeric,
    number_shares numeric,
    take_profit numeric,
    entry_date timestamp without time zone,
    exit_date timestamp without time zone,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
BEGIN
    -- Use provided user_id if given, otherwise get from auth context
    IF p_user_id IS NOT NULL THEN
        current_user_id := p_user_id;
    ELSE
        current_user_id := auth.uid();
        
        -- Raise an error if no authenticated user and no manual user_id provided
        IF current_user_id IS NULL THEN
            RAISE EXCEPTION 'No authenticated user found and no user_id provided. Please ensure you are logged in or provide a user_id parameter for testing.';
        END IF;
    END IF;

    RETURN QUERY
    INSERT INTO public.stocks (
        user_id,
        symbol,
        trade_type,
        order_type,
        entry_price,
        exit_price,
        stop_loss,
        commissions,
        number_shares,
        take_profit,
        entry_date,
        exit_date
    ) VALUES (
        current_user_id,
        p_symbol,
        p_trade_type,
        p_order_type,
        p_entry_price,
        p_exit_price,
        p_stop_loss,
        p_commissions,
        p_number_shares,
        p_take_profit,
        p_entry_date,
        p_exit_date
    )
    ON CONFLICT ON CONSTRAINT unique_stock_position
    DO UPDATE SET
        order_type = EXCLUDED.order_type,
        exit_price = EXCLUDED.exit_price,
        stop_loss = EXCLUDED.stop_loss,
        commissions = EXCLUDED.commissions,
        number_shares = EXCLUDED.number_shares,
        take_profit = EXCLUDED.take_profit,
        exit_date = EXCLUDED.exit_date,
        updated_at = CURRENT_TIMESTAMP
    RETURNING 
        stocks.id,
        stocks.user_id,
        stocks.symbol,
        stocks.trade_type,
        stocks.order_type,
        stocks.entry_price,
        stocks.exit_price,
        stocks.stop_loss,
        stocks.commissions,
        stocks.number_shares,
        stocks.take_profit,
        stocks.entry_date,
        stocks.exit_date,
        stocks.created_at,
        stocks.updated_at;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION upsert_stock TO authenticated;

-- Example usage for testing in Supabase SQL Editor:

-- Method 1: With manual user_id (for testing)
-- SELECT * FROM upsert_stock(
--     'AAPL',                                   -- symbol
--     'BUY'::trade_type_enum,                   -- trade_type
--     'MARKET'::order_type_enum,                -- order_type
--     150.00,                                   -- entry_price
--     140.00,                                   -- stop_loss
--     100,                                      -- number_shares
--     '2024-01-15 09:30:00'::timestamp,        -- entry_date
--     NULL,                                     -- exit_price
--     0.00,                                     -- commissions
--     NULL,                                     -- take_profit
--     NULL,                                     -- exit_date
--     'your-uuid-here'::uuid                   -- manual user_id for testing
-- );

-- Method 2: With authenticated user (production usage)
-- SELECT * FROM upsert_stock(
--     'AAPL',                                   -- symbol
--     'BUY'::trade_type_enum,                   -- trade_type
--     'MARKET'::order_type_enum,                -- order_type
--     150.00,                                   -- entry_price
--     140.00,                                   -- stop_loss
--     100,                                      -- number_shares
--     '2024-01-15 09:30:00'::timestamp         -- entry_date
--     -- user_id will be automatically retrieved from auth.uid()
-- );

-- To generate a test UUID, you can run:
-- SELECT gen_random_uuid();

-- Example with the generated UUID:
-- SELECT * FROM upsert_stock(
--     'TEST',
--     'BUY'::trade_type_enum,
--     'MARKET'::order_type_enum,
--     100.00,
--     90.00,
--     50,
--     '2024-01-15 09:30:00'::timestamp,
--     NULL,
--     0.00,
--     NULL,
--     NULL,
--     gen_random_uuid()  -- This generates a random UUID for testing
-- );