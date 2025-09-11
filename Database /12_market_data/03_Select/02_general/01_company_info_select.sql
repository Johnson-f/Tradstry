-- COMPANY_INFO SELECT FUNCTIONS
-- Functions to retrieve company information data

-- 1. GET COMPANY INFO BY SYMBOL
CREATE OR REPLACE FUNCTION get_company_info_by_symbol(
    p_symbol VARCHAR(20),
    p_data_provider VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    exchange_id INTEGER,
    name VARCHAR(255),
    company_name VARCHAR(255),
    exchange VARCHAR(50),
    sector VARCHAR(100),
    industry VARCHAR(100),
    about TEXT,
    employees INTEGER,
    logo VARCHAR(500),
    
    -- Real-time price data
    price DECIMAL(15,4),
    pre_market_price DECIMAL(15,4),
    after_hours_price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
    open DECIMAL(15,4),
    high DECIMAL(15,4),
    low DECIMAL(15,4),
    year_high DECIMAL(15,4),
    year_low DECIMAL(15,4),
    
    -- Volume and trading metrics
    volume BIGINT,
    avg_volume BIGINT,
    
    -- Financial ratios and metrics
    market_cap BIGINT,
    beta DECIMAL(8,4),
    pe_ratio DECIMAL(10,2),
    eps DECIMAL(10,4),
    
    -- Dividend information
    dividend DECIMAL(10,4),
    yield DECIMAL(7,4),
    ex_dividend DATE,
    last_dividend DECIMAL(10,4),
    
    -- Fund-specific metrics
    net_assets BIGINT,
    nav DECIMAL(15,4),
    expense_ratio DECIMAL(7,4),
    
    -- Corporate events
    earnings_date DATE,
    
    -- Performance returns
    five_day_return DECIMAL(8,4),
    one_month_return DECIMAL(8,4),
    three_month_return DECIMAL(8,4),
    six_month_return DECIMAL(8,4),
    ytd_return DECIMAL(8,4),
    year_return DECIMAL(8,4),
    five_year_return DECIMAL(8,4),
    ten_year_return DECIMAL(8,4),
    max_return DECIMAL(8,4),
    
    -- Metadata fields
    ipo_date DATE,
    currency VARCHAR(3),
    fiscal_year_end VARCHAR(10),
    data_provider VARCHAR(50),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) AS $$
BEGIN
    IF p_data_provider IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            ci.id, ci.symbol, ci.exchange_id, ci.name, ci.company_name,
            ci.exchange, ci.sector, ci.industry, ci.about, ci.employees, ci.logo,
            
            -- Real-time price data
            ci.price, ci.pre_market_price, ci.after_hours_price, ci.change, ci.percent_change,
            ci.open, ci.high, ci.low, ci.year_high, ci.year_low,
            
            -- Volume and trading metrics
            ci.volume, ci.avg_volume,
            
            -- Financial ratios and metrics
            ci.market_cap, ci.beta, ci.pe_ratio, ci.eps,
            
            -- Dividend information
            ci.dividend, ci.yield, ci.ex_dividend, ci.last_dividend,
            
            -- Fund-specific metrics
            ci.net_assets, ci.nav, ci.expense_ratio,
            
            -- Corporate events
            ci.earnings_date,
            
            -- Performance returns
            ci.five_day_return, ci.one_month_return, ci.three_month_return, ci.six_month_return,
            ci.ytd_return, ci.year_return, ci.five_year_return, ci.ten_year_return, ci.max_return,
            
            -- Metadata fields
            ci.ipo_date, ci.currency, ci.fiscal_year_end, ci.data_provider, ci.created_at, ci.updated_at
        FROM company_info ci
        WHERE ci.symbol = UPPER(p_symbol) 
        AND ci.data_provider = p_data_provider;
    ELSE
        RETURN QUERY
        SELECT 
            ci.id, ci.symbol, ci.exchange_id, ci.name, ci.company_name,
            ci.exchange, ci.sector, ci.industry, ci.about, ci.employees, ci.logo,
            
            -- Real-time price data
            ci.price, ci.pre_market_price, ci.after_hours_price, ci.change, ci.percent_change,
            ci.open, ci.high, ci.low, ci.year_high, ci.year_low,
            
            -- Volume and trading metrics
            ci.volume, ci.avg_volume,
            
            -- Financial ratios and metrics
            ci.market_cap, ci.beta, ci.pe_ratio, ci.eps,
            
            -- Dividend information
            ci.dividend, ci.yield, ci.ex_dividend, ci.last_dividend,
            
            -- Fund-specific metrics
            ci.net_assets, ci.nav, ci.expense_ratio,
            
            -- Corporate events
            ci.earnings_date,
            
            -- Performance returns
            ci.five_day_return, ci.one_month_return, ci.three_month_return, ci.six_month_return,
            ci.ytd_return, ci.year_return, ci.five_year_return, ci.ten_year_return, ci.max_return,
            
            -- Metadata fields
            ci.ipo_date, ci.currency, ci.fiscal_year_end, ci.data_provider, ci.created_at, ci.updated_at
        FROM company_info ci
        WHERE ci.symbol = UPPER(p_symbol)
        ORDER BY ci.updated_at DESC
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- 2. GET COMPANIES BY SECTOR AND/OR INDUSTRY

CREATE OR REPLACE FUNCTION get_companies_by_sector_industry(
    p_sector VARCHAR(100) DEFAULT NULL,
    p_industry VARCHAR(100) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    name VARCHAR(255),
    company_name VARCHAR(255),
    exchange VARCHAR(50),
    sector VARCHAR(100),
    industry VARCHAR(100),
    market_cap BIGINT,
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
    volume BIGINT,
    pe_ratio DECIMAL(10,2),
    yield DECIMAL(7,4),
    ytd_return DECIMAL(8,4),
    year_return DECIMAL(8,4),
    data_provider VARCHAR(50),
    updated_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ci.id, ci.symbol, ci.name, ci.company_name, ci.exchange,
        ci.sector, ci.industry, ci.market_cap, ci.price, ci.change, ci.percent_change,
        ci.volume, ci.pe_ratio, ci.yield, ci.ytd_return, ci.year_return,
        ci.data_provider, ci.updated_at
    FROM company_info ci
    WHERE (p_sector IS NULL OR ci.sector = p_sector)
    AND (p_industry IS NULL OR ci.industry = p_industry)
    ORDER BY ci.market_cap DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;


-- 3. SEARCH COMPANIES BY NAME OR SYMBOL

CREATE OR REPLACE FUNCTION search_companies(
    p_search_term VARCHAR(255),
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id INTEGER,
    symbol VARCHAR(20),
    name VARCHAR(255),
    company_name VARCHAR(255),
    exchange VARCHAR(50),
    sector VARCHAR(100),
    industry VARCHAR(100),
    market_cap BIGINT,
    price DECIMAL(15,4),
    change DECIMAL(15,4),
    percent_change DECIMAL(8,4),
    pe_ratio DECIMAL(10,2),
    yield DECIMAL(7,4),
    data_provider VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ci.id, ci.symbol, ci.name, ci.company_name, ci.exchange,
        ci.sector, ci.industry, ci.market_cap, ci.price, ci.change, ci.percent_change,
        ci.pe_ratio, ci.yield, ci.data_provider
    FROM company_info ci
    WHERE 
        ci.symbol ILIKE '%' || UPPER(p_search_term) || '%'
        OR ci.name ILIKE '%' || p_search_term || '%'
        OR ci.company_name ILIKE '%' || p_search_term || '%'
    ORDER BY 
        CASE 
            WHEN ci.symbol = UPPER(p_search_term) THEN 1
            WHEN ci.symbol ILIKE UPPER(p_search_term) || '%' THEN 2
            WHEN ci.name ILIKE p_search_term || '%' THEN 3
            ELSE 4
        END,
        ci.market_cap DESC NULLS LAST
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;



-- USAGE EXAMPLES
/*
-- Get specific company by symbol
SELECT * FROM get_company_info_by_symbol('AAPL');

-- Search for companies
SELECT * FROM search_companies('Apple', 10);

-- Get basic company info
SELECT * FROM get_company_basic_info('MSFT');

-- Get all sectors and industries
SELECT * FROM get_sectors_and_industries();
*/
