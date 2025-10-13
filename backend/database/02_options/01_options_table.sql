-- First, create the trade_status enum type if it doesn't exist
CREATE TYPE trade_status AS ENUM ('open', 'closed');

-- Ignore the user_id, it is not needed

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

-- Policies (ignore the policy)
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