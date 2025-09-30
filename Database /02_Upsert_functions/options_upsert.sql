-- Create unique constraint for natural upsert logic
-- This ensures one record per user per unique option position
ALTER TABLE public.options 
ADD CONSTRAINT unique_option_position 
UNIQUE (user_id, symbol, expiration_date, strike_price, option_type, strategy_type);

-- True upsert function for options table
-- This function inserts a new option record or updates an existing one based on natural key
CREATE OR REPLACE FUNCTION upsert_option(
    p_symbol character varying,
    p_strategy_type text,
    p_trade_direction character varying,
    p_number_of_contracts integer,
    p_option_type character varying,
    p_strike_price numeric,
    p_expiration_date timestamp without time zone,
    p_entry_price numeric,
    p_total_premium numeric,
    p_commissions numeric,
    p_implied_volatility numeric,
    p_entry_date timestamp without time zone,
    p_exit_price numeric DEFAULT NULL,
    p_exit_date timestamp without time zone DEFAULT NULL,
    p_status trade_status DEFAULT 'open'::trade_status,
    p_user_id uuid DEFAULT NULL  -- Optional parameter for manual testing
)
RETURNS TABLE(
    id integer,
    user_id uuid,
    symbol character varying,
    strategy_type text,
    trade_direction character varying,
    number_of_contracts integer,
    option_type character varying,
    strike_price numeric,
    expiration_date timestamp without time zone,
    entry_price numeric,
    exit_price numeric,
    total_premium numeric,
    commissions numeric,
    implied_volatility numeric,
    entry_date timestamp without time zone,
    exit_date timestamp without time zone,
    status trade_status,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id uuid;
    mapped_option_type character varying;
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

    -- Map option type to expected constraint values
    mapped_option_type := CASE 
        WHEN UPPER(p_option_type) = 'CALL' THEN 'C'  -- or whatever your constraint expects
        WHEN UPPER(p_option_type) = 'PUT' THEN 'P'
        ELSE LOWER(p_option_type)  -- fallback to lowercase
    END;

    RETURN QUERY
    INSERT INTO public.options (
        user_id,
        symbol,
        strategy_type,
        trade_direction,
        number_of_contracts,
        option_type,
        strike_price,
        expiration_date,
        entry_price,
        exit_price,
        total_premium,
        commissions,
        implied_volatility,
        entry_date,
        exit_date,
        status
    ) VALUES (
        current_user_id,
        p_symbol,
        p_strategy_type,
        p_trade_direction,
        p_number_of_contracts,
        mapped_option_type,
        p_strike_price,
        p_expiration_date,
        p_entry_price,
        p_exit_price,
        p_total_premium,
        p_commissions,
        p_implied_volatility,
        p_entry_date,
        p_exit_date,
        p_status
    )
    ON CONFLICT ON CONSTRAINT unique_option_position
    DO UPDATE SET
        trade_direction = EXCLUDED.trade_direction,
        number_of_contracts = EXCLUDED.number_of_contracts,
        entry_price = EXCLUDED.entry_price,
        exit_price = EXCLUDED.exit_price,
        total_premium = EXCLUDED.total_premium,
        commissions = EXCLUDED.commissions,
        implied_volatility = EXCLUDED.implied_volatility,
        entry_date = EXCLUDED.entry_date,
        exit_date = EXCLUDED.exit_date,
        status = EXCLUDED.status,
        updated_at = CURRENT_TIMESTAMP
    RETURNING 
        options.id,
        options.user_id,
        options.symbol,
        options.strategy_type,
        options.trade_direction,
        options.number_of_contracts,
        options.option_type,
        options.strike_price,
        options.expiration_date,
        options.entry_price,
        options.exit_price,
        options.total_premium,
        options.commissions,
        options.implied_volatility,
        options.entry_date,
        options.exit_date,
        options.status,
        options.created_at,
        options.updated_at;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION upsert_option TO authenticated;

-- Example usage for testing in SQL editor:
-- First call - creates new record:
-- SELECT * FROM upsert_option(
--     '550e8400-e29b-41d4-a716-446655440000'::uuid,  -- p_user_id (provide any valid UUID for testing)
--     'AAPL',                                         -- symbol
--     'Covered Call',                                 -- strategy_type
--     'Bullish',                                      -- trade_direction
--     5,                                              -- number_of_contracts
--     'Call',                                         -- option_type
--     155.00,                                         -- strike_price
--     '2024-02-16 16:00:00'::timestamp,              -- expiration_date
--     2.50,                                           -- entry_price
--     1250.00,                                        -- total_premium
--     10.00,                                          -- commissions
--     0.25,                                           -- implied_volatility
--     '2024-01-15 09:30:00'::timestamp               -- entry_date
-- );

-- -- Second call with same natural key - updates existing record:
-- SELECT * FROM upsert_option(
--     '550e8400-e29b-41d4-a716-446655440000'::uuid,  -- same p_user_id
--     'AAPL',                                         -- same symbol
--     'Covered Call',                                 -- same strategy_type
--     'Bullish',                                      -- trade_direction
--     3,                                              -- CHANGED: number_of_contracts
--     'Call',                                         -- same option_type
--     155.00,                                         -- same strike_price
--     '2024-02-16 16:00:00'::timestamp,              -- same expiration_date
--     2.30,                                           -- CHANGED: entry_price
--     690.00,                                         -- CHANGED: total_premium
--     8.00,                                           -- CHANGED: commissions
--     0.28,                                           -- CHANGED: implied_volatility
--     '2024-01-15 09:30:00'::timestamp,              -- entry_date
--     1.80,                                           -- NEW: exit_price
--     '2024-01-20 14:30:00'::timestamp,              -- NEW: exit_date
--     'closed'::trade_status                          -- CHANGED: status
-- );