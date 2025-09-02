-- ----------------------------------------------------------------------------
-- Function: upsert_stock_quote (Updated to match stock_quotes table structure)
-- ----------------------------------------------------------------------------

-- Tested 

CREATE OR REPLACE FUNCTION upsert_stock_quote(
    -- Required parameters (no defaults)
    p_symbol TEXT,
    p_quote_timestamp TIMESTAMP,
    p_data_provider TEXT,
    
    -- Exchange parameters (for automatic exchange handling)
    p_exchange_code TEXT DEFAULT NULL,
    p_exchange_name TEXT DEFAULT NULL,
    p_exchange_country TEXT DEFAULT NULL,
    p_exchange_timezone TEXT DEFAULT NULL,
    
    -- Optional quote parameters (matching table columns)
    p_price NUMERIC DEFAULT NULL,
    p_change_amount NUMERIC DEFAULT NULL,
    p_change_percent NUMERIC DEFAULT NULL,
    p_volume BIGINT DEFAULT NULL,
    p_open_price NUMERIC DEFAULT NULL,
    p_high_price NUMERIC DEFAULT NULL,
    p_low_price NUMERIC DEFAULT NULL,
    p_previous_close NUMERIC DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
    v_id BIGINT;
    v_exchange_id BIGINT;
BEGIN
    -- Step 1: Handle exchange upsert if exchange data is provided
    IF p_exchange_code IS NOT NULL THEN
        SELECT upsert_exchange(
            p_exchange_code,
            p_exchange_name,
            p_exchange_country,
            p_exchange_timezone
        ) INTO v_exchange_id;
    END IF;

    -- Step 2: Insert/update stock quote
    INSERT INTO stock_quotes (
        symbol, exchange_id, price, change_amount, change_percent, volume,
        open_price, high_price, low_price, previous_close,
        quote_timestamp, data_provider, created_at, updated_at
    )
    VALUES (
        p_symbol, v_exchange_id, p_price, p_change_amount, p_change_percent, p_volume,
        p_open_price, p_high_price, p_low_price, p_previous_close,
        p_quote_timestamp, p_data_provider, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
    ON CONFLICT (symbol, quote_timestamp, data_provider) DO UPDATE SET
        exchange_id = COALESCE(EXCLUDED.exchange_id, stock_quotes.exchange_id),
        price = COALESCE(EXCLUDED.price, stock_quotes.price),
        change_amount = COALESCE(EXCLUDED.change_amount, stock_quotes.change_amount),
        change_percent = COALESCE(EXCLUDED.change_percent, stock_quotes.change_percent),
        volume = COALESCE(EXCLUDED.volume, stock_quotes.volume),
        open_price = COALESCE(EXCLUDED.open_price, stock_quotes.open_price),
        high_price = COALESCE(EXCLUDED.high_price, stock_quotes.high_price),
        low_price = COALESCE(EXCLUDED.low_price, stock_quotes.low_price),
        previous_close = COALESCE(EXCLUDED.previous_close, stock_quotes.previous_close),
        updated_at = CURRENT_TIMESTAMP
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Add function comment
COMMENT ON FUNCTION upsert_stock_quote IS 'Upserts stock quote data with conflict resolution on symbol, quote_timestamp, and data_provider. Handles exchange upsert automatically.';

-- ----------------------------------------------------------------------------
-- Test script for Supabase SQL Editor 
-- ----------------------------------------------------------------------------
/*
-- Test insert: new stock quote with automatic exchange handling
SELECT upsert_stock_quote(
    p_symbol => 'AAPL',
    p_quote_timestamp => '2024-03-15 15:30:00'::TIMESTAMP,
    p_data_provider => 'polygon',
    
    -- Exchange information
    p_exchange_code => 'NASDAQ',
    p_exchange_name => 'NASDAQ Stock Market',
    p_exchange_country => 'USA',
    p_exchange_timezone => 'America/New_York',
    
    -- Stock quote data
    p_price => 175.50,
    p_change_amount => 2.75,
    p_change_percent => 1.59,
    p_volume => 45000000,
    p_open_price => 173.25,
    p_high_price => 176.80,
    p_low_price => 172.90,
    p_previous_close => 172.75
);

-- Test update: same stock with new price data
SELECT upsert_stock_quote(
    p_symbol => 'AAPL',
    p_quote_timestamp => '2024-03-15 16:00:00'::TIMESTAMP,
    p_data_provider => 'polygon',
    p_price => 176.25,
    p_change_amount => 3.50,
    p_change_percent => 2.02,
    p_volume => 47500000
);
*/