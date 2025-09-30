-- Balance Sheet Table - GLOBAL SHARED DATA
-- This table stores balance sheet data for companies, accessible to ALL users.
-- Data is sourced from market data providers and is shared across the platform.
-- This table uses a "wide" format, where each financial metric is a separate column.

CREATE TABLE IF NOT EXISTS balance_sheet (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    frequency VARCHAR(10) NOT NULL, -- 'annual' or 'quarterly'
    fiscal_date DATE NOT NULL,

    -- Assets
    total_assets NUMERIC(25, 2),
    total_current_assets NUMERIC(25, 2),
    cash_cash_equivalents_and_short_term_investments NUMERIC(25, 2),
    cash_and_cash_equivalents NUMERIC(25, 2),
    cash NUMERIC(25, 2),
    cash_equivalents NUMERIC(25, 2),
    other_short_term_investments NUMERIC(25, 2),
    receivables NUMERIC(25, 2),
    accounts_receivable NUMERIC(25, 2),
    other_receivables NUMERIC(25, 2),
    inventory NUMERIC(25, 2),
    other_current_assets NUMERIC(25, 2),
    total_non_current_assets NUMERIC(25, 2),
    net_ppe NUMERIC(25, 2),
    gross_ppe NUMERIC(25, 2),
    properties NUMERIC(25, 2),
    land_and_improvements NUMERIC(25, 2),
    machinery_furniture_equipment NUMERIC(25, 2),
    other_properties NUMERIC(25, 2),
    leases NUMERIC(25, 2),
    accumulated_depreciation NUMERIC(25, 2),
    investments_and_advances NUMERIC(25, 2),
    investment_in_financial_assets NUMERIC(25, 2),
    available_for_sale_securities NUMERIC(25, 2),
    other_investments NUMERIC(25, 2),
    non_current_deferred_assets NUMERIC(25, 2),
    non_current_deferred_taxes_assets NUMERIC(25, 2),
    other_non_current_assets NUMERIC(25, 2),
    net_tangible_assets NUMERIC(25, 2),
    tangible_book_value NUMERIC(25, 2),

    -- Liabilities
    total_liabilities NUMERIC(25, 2),
    total_current_liabilities NUMERIC(25, 2),
    payables_and_accrued_expenses NUMERIC(25, 2),
    payables NUMERIC(25, 2),
    accounts_payable NUMERIC(25, 2),
    total_tax_payable NUMERIC(25, 2),
    income_tax_payable NUMERIC(25, 2),
    current_debt_and_capital_lease_obligation NUMERIC(25, 2),
    current_debt NUMERIC(25, 2),
    commercial_paper NUMERIC(25, 2),
    other_current_borrowings NUMERIC(25, 2),
    current_capital_lease_obligation NUMERIC(25, 2),
    current_deferred_liabilities NUMERIC(25, 2),
    current_deferred_revenue NUMERIC(25, 2),
    other_current_liabilities NUMERIC(25, 2),
    total_non_current_liabilities NUMERIC(25, 2),
    long_term_debt_and_capital_lease_obligation NUMERIC(25, 2),
    long_term_debt NUMERIC(25, 2),
    long_term_capital_lease_obligation NUMERIC(25, 2),
    trade_and_other_payables_non_current NUMERIC(25, 2),
    other_non_current_liabilities NUMERIC(25, 2),
    capital_lease_obligations NUMERIC(25, 2),
    total_debt NUMERIC(25, 2),
    net_debt NUMERIC(25, 2),

    -- Equity
    total_equity NUMERIC(25, 2),
    stockholders_equity NUMERIC(25, 2),
    capital_stock NUMERIC(25, 2),
    common_stock NUMERIC(25, 2),
    retained_earnings NUMERIC(25, 2),
    gains_losses_not_affecting_retained_earnings NUMERIC(25, 2),
    other_equity_adjustments NUMERIC(25, 2),
    common_stock_equity NUMERIC(25, 2),
    shares_issued BIGINT,
    ordinary_shares_number BIGINT,
    treasury_shares_number BIGINT,

    -- Other
    working_capital NUMERIC(25, 2),
    invested_capital NUMERIC(25, 2),
    total_capitalization NUMERIC(25, 2),

    -- Metadata
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per period per provider
    UNIQUE(symbol, frequency, fiscal_date, data_provider)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_balance_sheet_symbol_freq_date ON balance_sheet (symbol, frequency, fiscal_date);
CREATE INDEX IF NOT EXISTS idx_balance_sheet_provider ON balance_sheet (data_provider);

-- Add table and column comments
COMMENT ON TABLE balance_sheet IS 'Stores detailed balance sheet financial data (both annual and quarterly) for companies from various data providers. This table uses a "wide" format where each financial metric is a separate column.';

COMMENT ON COLUMN balance_sheet.id IS 'Unique identifier for each record.';
COMMENT ON COLUMN balance_sheet.symbol IS 'Stock ticker symbol, references company_info(symbol).';
COMMENT ON COLUMN balance_sheet.frequency IS 'Frequency of the report: ''annual'' or ''quarterly''.';
COMMENT ON COLUMN balance_sheet.fiscal_date IS 'The end date of the fiscal period for the report.';

-- Assets Comments
COMMENT ON COLUMN balance_sheet.total_assets IS 'Total value of all assets.';
COMMENT ON COLUMN balance_sheet.total_current_assets IS 'Total of all current assets.';
COMMENT ON COLUMN balance_sheet.cash_cash_equivalents_and_short_term_investments IS 'Sum of cash, cash equivalents, and short-term investments.';
COMMENT ON COLUMN balance_sheet.cash_and_cash_equivalents IS 'Sum of cash and cash equivalents.';
COMMENT ON COLUMN balance_sheet.cash IS 'Cash on hand.';
COMMENT ON COLUMN balance_sheet.cash_equivalents IS 'Highly liquid investments with short maturities.';
COMMENT ON COLUMN balance_sheet.other_short_term_investments IS 'Other investments with a maturity of less than one year.';
COMMENT ON COLUMN balance_sheet.receivables IS 'Total amount owed to the company.';
COMMENT ON COLUMN balance_sheet.accounts_receivable IS 'Money owed by customers for goods or services delivered.';
COMMENT ON COLUMN balance_sheet.other_receivables IS 'Other amounts owed to the company.';
COMMENT ON COLUMN balance_sheet.inventory IS 'Value of goods available for sale.';
COMMENT ON COLUMN balance_sheet.other_current_assets IS 'Other assets expected to be converted to cash within a year.';
COMMENT ON COLUMN balance_sheet.total_non_current_assets IS 'Total of all long-term assets.';
COMMENT ON COLUMN balance_sheet.net_ppe IS 'Net value of property, plant, and equipment.';
COMMENT ON COLUMN balance_sheet.gross_ppe IS 'Gross value of property, plant, and equipment before depreciation.';
COMMENT ON COLUMN balance_sheet.properties IS 'Value of properties held.';
COMMENT ON COLUMN balance_sheet.land_and_improvements IS 'Value of land and improvements.';
COMMENT ON COLUMN balance_sheet.machinery_furniture_equipment IS 'Value of machinery, furniture, and equipment.';
COMMENT ON COLUMN balance_sheet.other_properties IS 'Value of other properties.';
COMMENT ON COLUMN balance_sheet.leases IS 'Value of assets held under lease.';
COMMENT ON COLUMN balance_sheet.accumulated_depreciation IS 'Total depreciation expense recorded for assets.';
COMMENT ON COLUMN balance_sheet.investments_and_advances IS 'Total value of investments and advances made.';
COMMENT ON COLUMN balance_sheet.investment_in_financial_assets IS 'Investments in financial assets.';
COMMENT ON COLUMN balance_sheet.available_for_sale_securities IS 'Securities that are not classified as held-to-maturity or trading.';
COMMENT ON COLUMN balance_sheet.other_investments IS 'Other long-term investments.';
COMMENT ON COLUMN balance_sheet.non_current_deferred_assets IS 'Long-term deferred assets.';
COMMENT ON COLUMN balance_sheet.non_current_deferred_taxes_assets IS 'Long-term deferred tax assets.';
COMMENT ON COLUMN balance_sheet.other_non_current_assets IS 'Other long-term assets.';
COMMENT ON COLUMN balance_sheet.net_tangible_assets IS 'Total assets minus intangible assets and liabilities.';
COMMENT ON COLUMN balance_sheet.tangible_book_value IS 'Book value of the company excluding intangible assets.';

-- Liabilities Comments
COMMENT ON COLUMN balance_sheet.total_liabilities IS 'Total amount of all liabilities.';
COMMENT ON COLUMN balance_sheet.total_current_liabilities IS 'Total of all current liabilities.';
COMMENT ON COLUMN balance_sheet.payables_and_accrued_expenses IS 'Money owed to suppliers and other accrued expenses.';
COMMENT ON COLUMN balance_sheet.payables IS 'Total amount owed to suppliers.';
COMMENT ON COLUMN balance_sheet.accounts_payable IS 'Money owed to suppliers for goods or services.';
COMMENT ON COLUMN balance_sheet.total_tax_payable IS 'Total amount of taxes owed.';
COMMENT ON COLUMN balance_sheet.income_tax_payable IS 'Amount of income tax owed.';
COMMENT ON COLUMN balance_sheet.current_debt_and_capital_lease_obligation IS 'Short-term debt and capital lease obligations due within a year.';
COMMENT ON COLUMN balance_sheet.current_debt IS 'Short-term debt due within a year.';
COMMENT ON COLUMN balance_sheet.commercial_paper IS 'Short-term unsecured promissory notes issued by companies.';
COMMENT ON COLUMN balance_sheet.other_current_borrowings IS 'Other short-term borrowings.';
COMMENT ON COLUMN balance_sheet.current_capital_lease_obligation IS 'Portion of capital lease obligations due within a year.';
COMMENT ON COLUMN balance_sheet.current_deferred_liabilities IS 'Deferred liabilities due within a year.';
COMMENT ON COLUMN balance_sheet.current_deferred_revenue IS 'Revenue received but not yet earned, to be recognized within a year.';
COMMENT ON COLUMN balance_sheet.other_current_liabilities IS 'Other liabilities due within a year.';
COMMENT ON COLUMN balance_sheet.total_non_current_liabilities IS 'Total of all long-term liabilities.';
COMMENT ON COLUMN balance_sheet.long_term_debt_and_capital_lease_obligation IS 'Long-term debt and capital lease obligations.';
COMMENT ON COLUMN balance_sheet.long_term_debt IS 'Debt with a maturity of more than one year.';
COMMENT ON COLUMN balance_sheet.long_term_capital_lease_obligation IS 'Long-term portion of capital lease obligations.';
COMMENT ON COLUMN balance_sheet.trade_and_other_payables_non_current IS 'Non-current trade and other payables.';
COMMENT ON COLUMN balance_sheet.other_non_current_liabilities IS 'Other long-term liabilities.';
COMMENT ON COLUMN balance_sheet.capital_lease_obligations IS 'Total obligation under capital leases.';
COMMENT ON COLUMN balance_sheet.total_debt IS 'Sum of all short-term and long-term debt.';
COMMENT ON COLUMN balance_sheet.net_debt IS 'Total debt minus cash and cash equivalents.';

-- Equity Comments
COMMENT ON COLUMN balance_sheet.total_equity IS 'Total shareholders'' equity.';
COMMENT ON COLUMN balance_sheet.stockholders_equity IS 'Total equity belonging to stockholders.';
COMMENT ON COLUMN balance_sheet.capital_stock IS 'Value of common and preferred stock.';
COMMENT ON COLUMN balance_sheet.common_stock IS 'Value of common stock.';
COMMENT ON COLUMN balance_sheet.retained_earnings IS 'Cumulative net earnings retained by the company.';
COMMENT ON COLUMN balance_sheet.gains_losses_not_affecting_retained_earnings IS 'Gains and losses not affecting retained earnings (e.g., other comprehensive income).';
COMMENT ON COLUMN balance_sheet.other_equity_adjustments IS 'Other adjustments to equity.';
COMMENT ON COLUMN balance_sheet.common_stock_equity IS 'Equity attributable to common shareholders.';
COMMENT ON COLUMN balance_sheet.shares_issued IS 'Total number of shares issued.';
COMMENT ON COLUMN balance_sheet.ordinary_shares_number IS 'Number of ordinary shares.';
COMMENT ON COLUMN balance_sheet.treasury_shares_number IS 'Number of shares held in treasury.';

-- Other Comments
COMMENT ON COLUMN balance_sheet.working_capital IS 'Current Assets - Current Liabilities.';
COMMENT ON COLUMN balance_sheet.invested_capital IS 'Total capital invested in the company.';
COMMENT ON COLUMN balance_sheet.total_capitalization IS 'Total long-term debt, and equity.';

-- =====================================================
-- BALANCE SHEET TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed.
-- =====================================================

-- Enable Row Level Security on the table
ALTER TABLE balance_sheet ENABLE ROW LEVEL SECURITY;

-- Grant SELECT permission to all authenticated users
GRANT SELECT ON balance_sheet TO PUBLIC;

-- Revoke modification permissions
REVOKE INSERT, UPDATE, DELETE ON balance_sheet FROM PUBLIC;

-- Create policies to enforce read-only access for users
CREATE POLICY "balance_sheet_select_policy" ON balance_sheet
    FOR SELECT
    USING (true); -- Allow all users to read all rows

CREATE POLICY "balance_sheet_insert_policy" ON balance_sheet
    FOR INSERT
    WITH CHECK (false); -- Deny all insert operations

CREATE POLICY "balance_sheet_update_policy" ON balance_sheet
    FOR UPDATE
    USING (false)
    WITH CHECK (false); -- Deny all update operations

CREATE POLICY "balance_sheet_delete_policy" ON balance_sheet
    FOR DELETE
    USING (false); -- Deny all delete operations