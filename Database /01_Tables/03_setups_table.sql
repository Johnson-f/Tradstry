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
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at on setups
CREATE TRIGGER update_setups_modtime
BEFORE UPDATE ON public.setups
FOR EACH ROW EXECUTE FUNCTION update_modified_column();
