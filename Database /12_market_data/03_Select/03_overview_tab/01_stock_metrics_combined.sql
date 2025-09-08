-- =====================================================
-- STOCK QUOTES FUNCTION
-- Fetches stock quote data from stock_quotes table
-- =====================================================

CREATE OR REPLACE FUNCTION get_stock_quotes(
    p_symbol VARCHAR(20),
    p_quote_date DATE DEFAULT CURRENT_DATE,
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR(20),
    quote_date DATE,
    previous_close DECIMAL(15,4),
    open_price DECIMAL(15,4),
    high_price DECIMAL(15,4),
    low_price DECIMAL(15,4),
    current_price DECIMAL(15,4),
    volume BIGINT,
    price_change DECIMAL(15,4),
    price_change_percent DECIMAL(7,4),
    quote_timestamp TIMESTAMP,
    data_provider VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        UPPER(p_symbol)::VARCHAR(20) as symbol,
        p_quote_date as quote_date,
        sq.previous_close,
        sq.open_price,
        sq.high_price,
        sq.low_price,
        sq.price as current_price,
        sq.volume,
        sq.change_amount as price_change,
        sq.change_percent as price_change_percent,
        sq.quote_timestamp,
        sq.data_provider
    FROM stock_quotes sq
    WHERE sq.symbol = UPPER(p_symbol)
    AND DATE(sq.quote_timestamp) = p_quote_date
    AND (p_data_provider IS NULL OR sq.data_provider = p_data_provider)
    ORDER BY sq.quote_timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FUNDAMENTAL DATA FUNCTION
-- Fetches fundamental data from fundamental_data table
-- =====================================================

CREATE OR REPLACE FUNCTION get_fundamental_data(
    p_symbol VARCHAR(20),
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    symbol VARCHAR(20),
    pe_ratio DECIMAL(10,2),
    market_cap BIGINT,
    dividend_yield DECIMAL(7,4),
    eps DECIMAL(10,2),
    fundamental_period VARCHAR(50),
    fiscal_year INTEGER,
    fiscal_quarter INTEGER,
    report_type VARCHAR(20),
    period_end_date DATE,
    data_provider VARCHAR(50),
    updated_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        UPPER(p_symbol)::VARCHAR(20) as symbol,
        fd.pe_ratio,
        fd.market_cap,
        fd.dividend_yield,
        fd.eps,
        CASE 
            WHEN fd.report_type IS NOT NULL THEN
                fd.report_type || 
                CASE WHEN fd.fiscal_year IS NOT NULL THEN '_' || fd.fiscal_year::text ELSE '' END ||
                CASE WHEN fd.fiscal_quarter IS NOT NULL THEN '_Q' || fd.fiscal_quarter::text ELSE '' END
            ELSE 'N/A'
        END::VARCHAR(50) as fundamental_period,
        fd.fiscal_year,
        fd.fiscal_quarter,
        fd.report_type,
        fd.period_end_date,
        fd.data_provider,
        fd.updated_at
    FROM fundamental_data fd
    WHERE fd.symbol = UPPER(p_symbol)
    AND (p_data_provider IS NULL OR fd.data_provider = p_data_provider)
    ORDER BY fd.fiscal_year DESC, fd.fiscal_quarter DESC NULLS LAST, fd.updated_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- USAGE EXAMPLES
-- =====================================================

/*
-- Get stock quotes for Apple on a specific date
SELECT * FROM get_stock_quotes('AAPL', '2024-01-15');

-- Get current day stock quotes
SELECT * FROM get_stock_quotes('MSFT');

-- Get quotes from a specific provider
SELECT * FROM get_stock_quotes('GOOGL', CURRENT_DATE, 'alpha_vantage');

-- Get fundamental data for Apple
SELECT * FROM get_fundamental_data('AAPL');

-- Get fundamental data from a specific provider
SELECT * FROM get_fundamental_data('MSFT', 'fmp');

-- Combine both functions in a single query
SELECT 
    sq.*,
    fd.pe_ratio,
    fd.market_cap,
    fd.dividend_yield,
    fd.eps,
    fd.fundamental_period
FROM get_stock_quotes('AAPL', '2024-01-15') sq
FULL OUTER JOIN get_fundamental_data('AAPL') fd ON sq.symbol = fd.symbol;
*/