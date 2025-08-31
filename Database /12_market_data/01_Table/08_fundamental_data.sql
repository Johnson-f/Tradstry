-- Fundamental Data Table - GLOBAL SHARED DATA
-- This table stores fundamental financial data accessible to ALL users
-- NO user ownership - data is shared across the entire platform
-- Stores financial ratios, margins, and fundamental metrics from providers

CREATE TABLE IF NOT EXISTS fundamental_data (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    exchange_id INTEGER REFERENCES exchanges(id),

    -- Valuation Ratios (shared globally)
    pe_ratio DECIMAL(10,2),  -- Price-to-Earnings
    pb_ratio DECIMAL(10,2),  -- Price-to-Book
    ps_ratio DECIMAL(10,2),  -- Price-to-Sales
    pegr_ratio DECIMAL(10,2), -- PEG Ratio
    dividend_yield DECIMAL(7,4), -- Annual dividend yield

    -- Profitability Ratios
    roe DECIMAL(7,4),  -- Return on Equity
    roa DECIMAL(7,4),  -- Return on Assets
    roic DECIMAL(7,4), -- Return on Invested Capital
    gross_margin DECIMAL(7,4),
    operating_margin DECIMAL(7,4),
    net_margin DECIMAL(7,4),
    ebitda_margin DECIMAL(7,4),

    -- Liquidity & Solvency Ratios
    current_ratio DECIMAL(10,2),
    quick_ratio DECIMAL(10,2),
    debt_to_equity DECIMAL(10,2),
    debt_to_assets DECIMAL(10,2),
    interest_coverage DECIMAL(10,2),

    -- Efficiency Ratios
    asset_turnover DECIMAL(10,2),
    inventory_turnover DECIMAL(10,2),
    receivables_turnover DECIMAL(10,2),
    payables_turnover DECIMAL(10,2),

    -- Growth Metrics
    revenue_growth DECIMAL(7,4),  -- Year-over-year revenue growth
    earnings_growth DECIMAL(7,4), -- Year-over-year earnings growth
    book_value_growth DECIMAL(7,4),
    dividend_growth DECIMAL(7,4),

    -- Per Share Metrics
    eps DECIMAL(10,2),  -- Earnings Per Share
    book_value_per_share DECIMAL(10,2),
    revenue_per_share DECIMAL(10,2),
    cash_flow_per_share DECIMAL(10,2),
    dividend_per_share DECIMAL(10,2),

    -- Market Data
    market_cap BIGINT,
    enterprise_value BIGINT,
    beta DECIMAL(7,4),  -- Beta coefficient
    shares_outstanding BIGINT,

    -- Period information
    fiscal_year INTEGER,
    fiscal_quarter INTEGER CHECK (fiscal_quarter BETWEEN 1 AND 4),
    period_end_date DATE,
    report_type VARCHAR(20),  -- 'annual', 'quarterly', 'ttm'

    -- Provider and audit info
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per symbol per period per provider
    UNIQUE(symbol, fiscal_year, fiscal_quarter, data_provider),

    -- Indexes for fundamental analysis queries
    INDEX idx_fundamental_data_symbol (symbol),
    INDEX idx_fundamental_data_pe_ratio (pe_ratio),
    INDEX idx_fundamental_data_roe (roe DESC),
    INDEX idx_fundamental_data_sector_symbol (sector, symbol),  -- If joined with company_info
    INDEX idx_fundamental_data_provider (data_provider),
    INDEX idx_fundamental_data_period (fiscal_year, fiscal_quarter),
    INDEX idx_fundamental_data_market_cap (market_cap DESC)
);

-- Add table comment
COMMENT ON TABLE fundamental_data IS 'Fundamental financial ratios and metrics from multiple market data providers';

-- Add column comments
COMMENT ON COLUMN fundamental_data.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN fundamental_data.exchange_id IS 'Foreign key to exchanges table';
COMMENT ON COLUMN fundamental_data.pe_ratio IS 'Price-to-Earnings ratio';
COMMENT ON COLUMN fundamental_data.pb_ratio IS 'Price-to-Book ratio';
COMMENT ON COLUMN fundamental_data.ps_ratio IS 'Price-to-Sales ratio';
COMMENT ON COLUMN fundamental_data.pegr_ratio IS 'Price/Earnings-to-Growth ratio';
COMMENT ON COLUMN fundamental_data.dividend_yield IS 'Annual dividend yield as decimal (0.025 = 2.5%)';
COMMENT ON COLUMN fundamental_data.roe IS 'Return on Equity as decimal (0.15 = 15%)';
COMMENT ON COLUMN fundamental_data.roa IS 'Return on Assets as decimal';
COMMENT ON COLUMN fundamental_data.roic IS 'Return on Invested Capital as decimal';
COMMENT ON COLUMN fundamental_data.gross_margin IS 'Gross profit margin as decimal (0.35 = 35%)';
COMMENT ON COLUMN fundamental_data.operating_margin IS 'Operating profit margin as decimal';
COMMENT ON COLUMN fundamental_data.net_margin IS 'Net profit margin as decimal';
COMMENT ON COLUMN fundamental_data.ebitda_margin IS 'EBITDA margin as decimal';
COMMENT ON COLUMN fundamental_data.current_ratio IS 'Current ratio (current assets / current liabilities)';
COMMENT ON COLUMN fundamental_data.quick_ratio IS 'Quick ratio (liquid assets / current liabilities)';
COMMENT ON COLUMN fundamental_data.debt_to_equity IS 'Total debt to total equity ratio';
COMMENT ON COLUMN fundamental_data.debt_to_assets IS 'Total debt to total assets ratio';
COMMENT ON COLUMN fundamental_data.interest_coverage IS 'EBIT / interest expense ratio';
COMMENT ON COLUMN fundamental_data.asset_turnover IS 'Revenue / average total assets';
COMMENT ON COLUMN fundamental_data.inventory_turnover IS 'Cost of goods sold / average inventory';
COMMENT ON COLUMN fundamental_data.receivables_turnover IS 'Revenue / average receivables';
COMMENT ON COLUMN fundamental_data.payables_turnover IS 'Cost of goods sold / average payables';
COMMENT ON COLUMN fundamental_data.revenue_growth IS 'Year-over-year revenue growth rate as decimal';
COMMENT ON COLUMN fundamental_data.earnings_growth IS 'Year-over-year earnings growth rate as decimal';
COMMENT ON COLUMN fundamental_data.book_value_growth IS 'Year-over-year book value growth rate';
COMMENT ON COLUMN fundamental_data.dividend_growth IS 'Year-over-year dividend growth rate';
COMMENT ON COLUMN fundamental_data.eps IS 'Earnings Per Share';
COMMENT ON COLUMN fundamental_data.book_value_per_share IS 'Book value per share';
COMMENT ON COLUMN fundamental_data.revenue_per_share IS 'Revenue per share';
COMMENT ON COLUMN fundamental_data.cash_flow_per_share IS 'Operating cash flow per share';
COMMENT ON COLUMN fundamental_data.dividend_per_share IS 'Dividend per share';
COMMENT ON COLUMN fundamental_data.market_cap IS 'Market capitalization';
COMMENT ON COLUMN fundamental_data.enterprise_value IS 'Enterprise value (market cap + debt - cash)';
COMMENT ON COLUMN fundamental_data.beta IS 'Beta coefficient (volatility measure)';
COMMENT ON COLUMN fundamental_data.shares_outstanding IS 'Number of shares outstanding';
COMMENT ON COLUMN fundamental_data.fiscal_year IS 'Fiscal year for the data';
COMMENT ON COLUMN fundamental_data.fiscal_quarter IS 'Fiscal quarter (1-4) for the data';
COMMENT ON COLUMN fundamental_data.period_end_date IS 'End date of the reporting period';
COMMENT ON COLUMN fundamental_data.report_type IS 'Type of report (annual, quarterly, ttm)';
COMMENT ON COLUMN fundamental_data.data_provider IS 'Market data provider (fmp, alpha_vantage, finnhub, etc.)';

-- =====================================================
-- FUNDAMENTAL DATA TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed
-- =====================================================

-- Policy: Users can only SELECT (read) data from fundamental_data table
-- Policy: Users CANNOT INSERT, UPDATE, or DELETE from fundamental_data table
-- Policy: Only system/application processes can modify the data

-- 1. GRANT SELECT PERMISSION TO PUBLIC/ALL USERS
-- This allows all authenticated users to read the data
GRANT SELECT ON fundamental_data TO PUBLIC;

-- 2. REVOKE ALL MODIFICATION PERMISSIONS FROM PUBLIC
-- Explicitly revoke any insert/update/delete permissions
REVOKE INSERT ON fundamental_data FROM PUBLIC;
REVOKE UPDATE ON fundamental_data FROM PUBLIC;
REVOKE DELETE ON fundamental_data FROM PUBLIC;

-- 3. CREATE ROW LEVEL SECURITY POLICY (if using PostgreSQL with RLS)
-- Enable Row Level Security on the table
ALTER TABLE fundamental_data ENABLE ROW LEVEL SECURITY;

-- Create policy for SELECT operations (allow all authenticated users)
CREATE POLICY "fundamental_data_select_policy" ON fundamental_data
    FOR SELECT
    USING (true);  -- Allow all users to read all rows

-- Create policy for INSERT operations (deny all users)
CREATE POLICY "fundamental_data_insert_policy" ON fundamental_data
    FOR INSERT
    WITH CHECK (false);  -- Deny all insert operations

-- Create policy for UPDATE operations (deny all users)
CREATE POLICY "fundamental_data_update_policy" ON fundamental_data
    FOR UPDATE
    USING (false)  -- Deny all update operations
    WITH CHECK (false);

-- Create policy for DELETE operations (deny all users)
CREATE POLICY "fundamental_data_delete_policy" ON fundamental_data
    FOR DELETE
    USING (false);  -- Deny all delete operations

-- =====================================================
-- SECURITY PRINCIPLES FOR FUNDAMENTAL_DATA TABLE
-- =====================================================

/*
SECURITY PRINCIPLES:

1. READ-ONLY FOR USERS:
   - Users can SELECT data for fundamental analysis and display
   - Users cannot modify fundamental data integrity
   - Prevents accidental or malicious data corruption

2. SYSTEM-ONLY WRITES:
   - Only automated systems and data providers can INSERT/UPDATE
   - Maintains data accuracy and consistency
   - Supports automatic fundamental data updates

3. DATA INTEGRITY:
   - Fundamental data should be treated as immutable by users
   - Only trusted sources can update financial metrics
   - Supports regulatory compliance requirements

IMPLEMENTATION NOTES:

- This policy assumes you have user roles/authentication in place
- Adjust the PUBLIC grants based on your authentication system
- Test thoroughly to ensure legitimate system processes can still write data
- Consider creating a separate database role for data ingestion processes
*/
