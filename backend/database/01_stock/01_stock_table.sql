-- Create custom enum types first - will enforce this from my backend 
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


-- Policies (ignore the policy)
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
-- ALTER TABLE public.stocks ADD COLUMN status character varying DEFAULT 'open';
