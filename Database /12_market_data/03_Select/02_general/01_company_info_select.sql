-- =====================================================
-- COMPANY_INFO SELECT FUNCTIONS
-- Functions to retrieve company information data
-- =====================================================

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
    market_cap BIGINT,
    employees INTEGER,
    revenue BIGINT,
    net_income BIGINT,
    pe_ratio DECIMAL(10,2),
    pb_ratio DECIMAL(10,2),
    dividend_yield DECIMAL(7,4),
    description TEXT,
    website VARCHAR(500),
    ceo VARCHAR(255),
    headquarters VARCHAR(255),
    founded VARCHAR(50),
    phone VARCHAR(50),
    email VARCHAR(255),
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
            ci.exchange, ci.sector, ci.industry, ci.market_cap, ci.employees,
            ci.revenue, ci.net_income, ci.pe_ratio, ci.pb_ratio, ci.dividend_yield,
            ci.description, ci.website, ci.ceo, ci.headquarters, ci.founded,
            ci.phone, ci.email, ci.ipo_date, ci.currency, ci.fiscal_year_end,
            ci.data_provider, ci.created_at, ci.updated_at
        FROM company_info ci
        WHERE ci.symbol = UPPER(p_symbol) 
        AND ci.data_provider = p_data_provider;
    ELSE
        RETURN QUERY
        SELECT 
            ci.id, ci.symbol, ci.exchange_id, ci.name, ci.company_name,
            ci.exchange, ci.sector, ci.industry, ci.market_cap, ci.employees,
            ci.revenue, ci.net_income, ci.pe_ratio, ci.pb_ratio, ci.dividend_yield,
            ci.description, ci.website, ci.ceo, ci.headquarters, ci.founded,
            ci.phone, ci.email, ci.ipo_date, ci.currency, ci.fiscal_year_end,
            ci.data_provider, ci.created_at, ci.updated_at
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
    pe_ratio DECIMAL(10,2),
    dividend_yield DECIMAL(7,4),
    data_provider VARCHAR(50),
    updated_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ci.id, ci.symbol, ci.name, ci.company_name, ci.exchange,
        ci.sector, ci.industry, ci.market_cap, ci.pe_ratio, 
        ci.dividend_yield, ci.data_provider, ci.updated_at
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
    data_provider VARCHAR(50)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ci.id, ci.symbol, ci.name, ci.company_name, ci.exchange,
        ci.sector, ci.industry, ci.market_cap, ci.data_provider
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
