CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create policy so users can manage their own data
CREATE POLICY "Users can manage own profile" ON public.users
    FOR ALL USING (auth.uid() = id);


-- Create a function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at)
  VALUES (new.id, new.email, new.created_at);
  RETURN new;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users table
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();



-- More functions that i ran 
CREATE OR REPLACE FUNCTION auth_uid() 
RETURNS uuid 
LANGUAGE sql 
STABLE 
AS $$
  SELECT auth.uid();
$$;

-- Create custom enum types first
CREATE TYPE trade_type_enum AS ENUM ('BUY', 'SELL');
CREATE TYPE order_type_enum AS ENUM ('MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT');

-- stocks table for stocks
CREATE TABLE public.stocks (
  id SERIAL NOT NULL,
  user_id uuid NOT NULL,
  symbol character varying NOT NULL,
  trade_type trade_type_enum NOT NULL,
  order_type order_type_enum NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric,
  stop_loss numeric NOT NULL,
  commissions numeric NOT NULL DEFAULT 0.00,
  number_shares numeric NOT NULL,
  take_profit numeric,
  entry_date timestamp without time zone NOT NULL,
  exit_date timestamp without time zone,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT entry_table_pkey PRIMARY KEY (id),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Policies
-- Enable Row Level Security on stocks table
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view only their own stock records
CREATE POLICY "Users can view own stocks" ON public.stocks
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for authenticated users to insert their own stock records
CREATE POLICY "Users can insert own stocks" ON public.stocks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for authenticated users to update only their own stock records
CREATE POLICY "Users can update own stocks" ON public.stocks
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy for authenticated users to delete only their own stock records
CREATE POLICY "Users can delete own stocks" ON public.stocks
    FOR DELETE USING (auth.uid() = user_id);


-- New columns added
ALTER TABLE public.stocks ADD COLUMN status character varying DEFAULT 'open';

-- First, create the trade_status enum type if it doesn't exist
CREATE TYPE trade_status AS ENUM ('open', 'closed');

-- options table for options
CREATE TABLE public.options (
  id SERIAL PRIMARY KEY,
  user_id uuid NOT NULL,
  symbol character varying NOT NULL,
  strategy_type text NOT NULL,
  trade_direction character varying NOT NULL CHECK (trade_direction::text = ANY (ARRAY['Bullish'::character varying, 'Bearish'::character varying, 'Neutral'::character varying]::text[])),
  number_of_contracts integer NOT NULL CHECK (number_of_contracts > 0),
  option_type character varying NOT NULL CHECK (option_type::text = ANY (ARRAY['Call'::character varying, 'Put'::character varying]::text[])),
  strike_price numeric NOT NULL,
  expiration_date timestamp without time zone NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric,
  total_premium numeric NOT NULL,
  commissions numeric NOT NULL,
  implied_volatility numeric NOT NULL,
  entry_date timestamp without time zone NOT NULL,
  exit_date timestamp without time zone,
  status trade_status NOT NULL DEFAULT 'open'::trade_status,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id)
);

-- Policies 
-- Enable Row Level Security on options table
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view only their own option records
CREATE POLICY "Users can view own options" ON public.options
    FOR SELECT USING (auth.uid() = user_id);

-- Policy for authenticated users to insert their own option records
CREATE POLICY "Users can insert own options" ON public.options
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy for authenticated users to update only their own option records
CREATE POLICY "Users can update own options" ON public.options
    FOR UPDATE USING (auth.uid() = user_id);

-- Policy for authenticated users to delete only their own option records
CREATE POLICY "Users can delete own options" ON public.options
    FOR DELETE USING (auth.uid() = user_id);


-- Create custom enum types if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'setup_category_enum') THEN
        CREATE TYPE setup_category_enum AS ENUM ('Breakout', 'Pullback', 'Reversal', 'Continuation', 'Range', 'Other');
    END IF;
END $$;

-- Create setups table
CREATE TABLE IF NOT EXISTS public.setups (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category setup_category_enum NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    tags TEXT[] DEFAULT '{}'::TEXT[],
    setup_conditions JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, name)
);

-- Create trade_setups junction table with separate foreign keys for stocks and options
CREATE TABLE IF NOT EXISTS public.trade_setups (
    id SERIAL PRIMARY KEY,
    stock_id INTEGER REFERENCES public.stocks(id) ON DELETE CASCADE,
    option_id INTEGER REFERENCES public.options(id) ON DELETE CASCADE,
    setup_id INTEGER NOT NULL REFERENCES public.setups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    confidence_rating SMALLINT CHECK (confidence_rating BETWEEN 1 AND 5),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Ensure only one of stock_id or option_id is set
    CONSTRAINT chk_trade_type CHECK (
        (stock_id IS NOT NULL AND option_id IS NULL) OR 
        (stock_id IS NULL AND option_id IS NOT NULL)
    )
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trade_setups_stock ON public.trade_setups(stock_id) WHERE stock_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_setups_option ON public.trade_setups(option_id) WHERE option_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trade_setups_setup ON public.trade_setups(setup_id);
CREATE INDEX IF NOT EXISTS idx_trade_setups_user ON public.trade_setups(user_id);

-- Ensure a trade can only be associated once per setup (supports ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_setups_stock_setup 
  ON public.trade_setups(stock_id, setup_id) 
  WHERE stock_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trade_setups_option_setup 
  ON public.trade_setups(option_id, setup_id) 
  WHERE option_id IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_setups ENABLE ROW LEVEL SECURITY;

-- Create policies for setups table
CREATE POLICY "Users can view own setups" ON public.setups
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own setups" ON public.setups
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own setups" ON public.setups
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own setups" ON public.setups
    FOR DELETE USING (auth.uid() = user_id);

-- Create policies for trade_setups table
CREATE POLICY "Users can view own trade_setups" ON public.trade_setups
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trade_setups" ON public.trade_setups
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trade_setups" ON public.trade_setups
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own trade_setups" ON public.trade_setups
    FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at on setups
CREATE TRIGGER update_setups_modtime
BEFORE UPDATE ON public.setups
FOR EACH ROW EXECUTE FUNCTION update_modified_column();


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

-- Optimized delete function for options table
-- This function safely deletes an option record for the authenticated user

CREATE OR REPLACE FUNCTION delete_option(p_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    deleted_record RECORD;
BEGIN
    -- Get the current user ID once and validate
    v_user_id := auth.uid();
    
    -- Early return if user is not authenticated
    IF v_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User not authenticated',
            'deleted_record', null
        );
    END IF;
    
    -- Single query: delete and return data atomically
    DELETE FROM options 
    WHERE id = p_id 
      AND user_id = v_user_id
    RETURNING 
        id,
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
        status,
        created_at,
        updated_at
    INTO deleted_record;
    
    -- Return structured response based on deletion result
    IF FOUND THEN
        RETURN json_build_object(
            'success', true,
            'deleted_record', json_build_object(
                'id', deleted_record.id,
                'user_id', deleted_record.user_id,
                'symbol', deleted_record.symbol,
                'strategy_type', deleted_record.strategy_type,
                'trade_direction', deleted_record.trade_direction,
                'number_of_contracts', deleted_record.number_of_contracts,
                'option_type', deleted_record.option_type,
                'strike_price', deleted_record.strike_price,
                'expiration_date', deleted_record.expiration_date,
                'entry_price', deleted_record.entry_price,
                'exit_price', deleted_record.exit_price,
                'total_premium', deleted_record.total_premium,
                'commissions', deleted_record.commissions,
                'implied_volatility', deleted_record.implied_volatility,
                'entry_date', deleted_record.entry_date,
                'exit_date', deleted_record.exit_date,
                'status', deleted_record.status,
                'created_at', deleted_record.created_at,
                'updated_at', deleted_record.updated_at
            )
        );
    ELSE
        RETURN json_build_object(
            'success', false,
            'error', 'Record not found or access denied',
            'deleted_record', null
        );
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Handle any unexpected errors
        RETURN json_build_object(
            'success', false,
            'error', 'Database error: ' || SQLERRM,
            'deleted_record', null
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_option TO authenticated;

-- Optional: Create an index to optimize the delete operation if not already present
-- This is especially important for tables with many records per user
CREATE INDEX IF NOT EXISTS idx_options_user_id_id ON options(user_id, id);

-- Example usage and expected responses:

-- Successful deletion:
-- SELECT delete_option(123);
-- Returns: {"success": true, "deleted_record": {"id": 123, "user_id": "uuid-here", "symbol": "AAPL", "strategy_type": "Covered Call", "trade_direction": "Bullish", "number_of_contracts": 5, "option_type": "Call", "strike_price": 155.00, "expiration_date": "2024-02-16T16:00:00", "entry_price": 2.50, "exit_price": null, "total_premium": 1250.00, "commissions": 10.00, "implied_volatility": 0.25, "entry_date": "2024-01-15T10:30:00", "exit_date": null, "status": "open", "created_at": "2024-01-15T10:30:00", "updated_at": "2024-01-15T10:30:00"}}

-- Record not found or access denied:
-- SELECT delete_option(999);
-- Returns: {"success": false, "error": "Record not found or access denied", "deleted_record": null}

-- User not authenticated:
-- Returns: {"success": false, "error": "User not authenticated", "deleted_record": null}

-- Testing on Supabase SQL Editor 
-- DELETE FROM options
-- WHERE user_id = '99369696-8c65-43bb-96bc-5999275e8be1'
-- RETURNING *;

-- Optimized delete function for stocks table
-- This function safely deletes a stock record for the authenticated user

CREATE OR REPLACE FUNCTION delete_stock(p_id integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    deleted_record RECORD;
BEGIN
    -- Get the current user ID once and validate
    v_user_id := auth.uid();
    
    -- Early return if user is not authenticated
    IF v_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User not authenticated',
            'deleted_record', null
        );
    END IF;
    
    -- Single query: delete and return data atomically
    DELETE FROM stocks 
    WHERE id = p_id 
      AND user_id = v_user_id
    RETURNING 
        id,
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
        exit_date,
        created_at,
        updated_at
    INTO deleted_record;
    
    -- Return structured response based on deletion result
    IF FOUND THEN
        RETURN json_build_object(
            'success', true,
            'deleted_record', json_build_object(
                'id', deleted_record.id,
                'user_id', deleted_record.user_id,
                'symbol', deleted_record.symbol,
                'trade_type', deleted_record.trade_type,
                'order_type', deleted_record.order_type,
                'entry_price', deleted_record.entry_price,
                'exit_price', deleted_record.exit_price,
                'stop_loss', deleted_record.stop_loss,
                'commissions', deleted_record.commissions,
                'number_shares', deleted_record.number_shares,
                'take_profit', deleted_record.take_profit,
                'entry_date', deleted_record.entry_date,
                'exit_date', deleted_record.exit_date,
                'created_at', deleted_record.created_at,
                'updated_at', deleted_record.updated_at
            )
        );
    ELSE
        RETURN json_build_object(
            'success', false,
            'error', 'Record not found or access denied',
            'deleted_record', null
        );
    END IF;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Handle any unexpected errors
        RETURN json_build_object(
            'success', false,
            'error', 'Database error: ' || SQLERRM,
            'deleted_record', null
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_stock TO authenticated;

-- Optional: Create an index to optimize the delete operation if not already present
-- This is especially important for tables with many records per user
CREATE INDEX IF NOT EXISTS idx_stocks_user_id_id ON stocks(user_id, id);

-- Example usage and expected responses:

-- Successful deletion:
-- SELECT delete_stock(123);
-- Returns: {"success": true, "deleted_record": {"id": 123, "user_id": "uuid-here", "symbol": "AAPL", "trade_type": "BUY", "order_type": "MARKET", "entry_price": 150.50, "exit_price": null, "stop_loss": 140.00, "commissions": 0.99, "number_shares": 100, "take_profit": 160.00, "entry_date": "2024-01-15T10:30:00", "exit_date": null, "created_at": "2024-01-15T10:30:00", "updated_at": "2024-01-15T10:30:00"}}

-- Record not found or access denied:
-- SELECT delete_stock(999);
-- Returns: {"success": false, "error": "Record not found or access denied", "deleted_record": null}

-- User not authenticated:
-- Returns: {"success": false, "error": "User not authenticated", "deleted_record": null}


-- Testing on suoabase SQL Editor 
-- DELETE FROM stocks
-- WHERE user_id = '99369696-8c65-43bb-96bc-5999275e8be1'
-- RETURNING *;

-- Function to get all options for the current user
CREATE OR REPLACE FUNCTION public.select_options()
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR,
    strategy_type TEXT,
    trade_direction VARCHAR,
    number_of_contracts INTEGER,
    option_type VARCHAR,
    strike_price NUMERIC,
    expiration_date TIMESTAMP,
    entry_price NUMERIC,
    exit_price NUMERIC,
    total_premium NUMERIC,
    commissions NUMERIC,
    implied_volatility NUMERIC,
    entry_date TIMESTAMP,
    exit_date TIMESTAMP,
    status TRADE_STATUS,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        id,
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
        status,
        created_at,
        updated_at
    FROM public.options
    WHERE user_id = auth.uid()
    ORDER BY entry_date DESC;
$$;

-- Function to get a specific option by ID for the current user
CREATE OR REPLACE FUNCTION public.get_option_by_id(p_option_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR,
    strategy_type TEXT,
    trade_direction VARCHAR,
    number_of_contracts INTEGER,
    option_type VARCHAR,
    strike_price NUMERIC,
    expiration_date TIMESTAMP,
    entry_price NUMERIC,
    exit_price NUMERIC,
    total_premium NUMERIC,
    commissions NUMERIC,
    implied_volatility NUMERIC,
    entry_date TIMESTAMP,
    exit_date TIMESTAMP,
    status TRADE_STATUS,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        id,
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
        status,
        created_at,
        updated_at
    FROM public.options
    WHERE id = p_option_id
    AND user_id = auth.uid();
$$;

-- Function to get all stocks for the current user
CREATE OR REPLACE FUNCTION public.select_stocks()
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR,
    trade_type TRADE_TYPE_ENUM,
    order_type ORDER_TYPE_ENUM,
    entry_price NUMERIC,
    exit_price NUMERIC,
    stop_loss NUMERIC,
    commissions NUMERIC,
    number_shares NUMERIC,
    take_profit NUMERIC,
    entry_date TIMESTAMP,
    exit_date TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        id,
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
        exit_date,
        created_at,
        updated_at
    FROM public.stocks
    WHERE user_id = auth.uid()
    ORDER BY entry_date DESC;
$$;

-- Function to get a specific stock by ID for the current user
CREATE OR REPLACE FUNCTION public.get_stock_by_id(p_stock_id INTEGER)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR,
    trade_type TRADE_TYPE_ENUM,
    order_type ORDER_TYPE_ENUM,
    entry_price NUMERIC,
    exit_price NUMERIC,
    stop_loss NUMERIC,
    commissions NUMERIC,
    number_shares NUMERIC,
    take_profit NUMERIC,
    entry_date TIMESTAMP,
    exit_date TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        id,
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
        exit_date,
        created_at,
        updated_at
    FROM public.stocks
    WHERE id = p_stock_id
    AND user_id = auth.uid();
$$;
