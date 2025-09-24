-- Cash Flow Statement Table - GLOBAL SHARED DATA
-- This table stores cash flow statement data for companies, accessible to ALL users.
-- Data is sourced from market data providers and is shared across the platform.
-- This table uses a "wide" format, where each financial metric is a separate column.

CREATE TABLE IF NOT EXISTS cash_flow (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    frequency VARCHAR(10) NOT NULL, -- 'annual' or 'quarterly'
    fiscal_date DATE NOT NULL,

    -- Operating Cash Flow
    operating_cash_flow NUMERIC(25, 2),
    net_income_from_continuing_operations NUMERIC(25, 2),
    depreciation_and_amortization NUMERIC(25, 2),
    deferred_income_tax NUMERIC(25, 2),
    stock_based_compensation NUMERIC(25, 2),
    other_non_cash_items NUMERIC(25, 2),
    change_in_working_capital NUMERIC(25, 2),
    change_in_receivables NUMERIC(25, 2),
    change_in_inventory NUMERIC(25, 2),
    change_in_payables_and_accrued_expense NUMERIC(25, 2),
    change_in_other_current_assets NUMERIC(25, 2),
    change_in_other_current_liabilities NUMERIC(25, 2),
    change_in_other_working_capital NUMERIC(25, 2),

    -- Investing Cash Flow
    investing_cash_flow NUMERIC(25, 2),
    net_investment_purchase_and_sale NUMERIC(25, 2),
    purchase_of_investment NUMERIC(25, 2),
    sale_of_investment NUMERIC(25, 2),
    net_ppe_purchase_and_sale NUMERIC(25, 2),
    purchase_of_ppe NUMERIC(25, 2),
    net_business_purchase_and_sale NUMERIC(25, 2),
    purchase_of_business NUMERIC(25, 2),
    net_other_investing_changes NUMERIC(25, 2),
    capital_expenditure NUMERIC(25, 2),

    -- Financing Cash Flow
    financing_cash_flow NUMERIC(25, 2),
    net_issuance_payments_of_debt NUMERIC(25, 2),
    net_long_term_debt_issuance NUMERIC(25, 2),
    long_term_debt_issuance NUMERIC(25, 2),
    long_term_debt_payments NUMERIC(25, 2),
    net_short_term_debt_issuance NUMERIC(25, 2),
    short_term_debt_issuance NUMERIC(25, 2),
    short_term_debt_payments NUMERIC(25, 2),
    net_common_stock_issuance NUMERIC(25, 2),
    common_stock_issuance NUMERIC(25, 2),
    common_stock_payments NUMERIC(25, 2),
    cash_dividends_paid NUMERIC(25, 2),
    net_other_financing_charges NUMERIC(25, 2),
    issuance_of_capital_stock NUMERIC(25, 2),
    issuance_of_debt NUMERIC(25, 2),
    repayment_of_debt NUMERIC(25, 2),
    repurchase_of_capital_stock NUMERIC(25, 2),

    -- Summary
    end_cash_position NUMERIC(25, 2),
    changes_in_cash NUMERIC(25, 2),
    beginning_cash_position NUMERIC(25, 2),
    free_cash_flow NUMERIC(25, 2),

    -- Supplemental Data
    income_tax_paid_supplemental_data NUMERIC(25, 2),
    interest_paid_supplemental_data NUMERIC(25, 2),

    -- Metadata
    data_provider VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure one record per period per provider
    UNIQUE(symbol, frequency, fiscal_date, data_provider)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cash_flow_symbol_freq_date ON cash_flow (symbol, frequency, fiscal_date);
CREATE INDEX IF NOT EXISTS idx_cash_flow_provider ON cash_flow (data_provider);

-- Add table and column comments
COMMENT ON TABLE cash_flow IS '''Stores detailed cash flow statement financial data (both annual and quarterly) for companies from various data providers. This table uses a "wide" format where each financial metric is a separate column.''';

COMMENT ON COLUMN cash_flow.id IS '''Unique identifier for each record.''';
COMMENT ON COLUMN cash_flow.symbol IS '''Stock ticker symbol, references company_info(symbol).''';
COMMENT ON COLUMN cash_flow.frequency IS '''Frequency of the report: ''annual'' or ''quarterly''.''';
COMMENT ON COLUMN cash_flow.fiscal_date IS '''The end date of the fiscal period for the report.''';

-- Operating Cash Flow Comments
COMMENT ON COLUMN cash_flow.operating_cash_flow IS '''Cash flow from operating activities.''';
COMMENT ON COLUMN cash_flow.net_income_from_continuing_operations IS '''Net income from continuing operations.''';
COMMENT ON COLUMN cash_flow.depreciation_and_amortization IS '''Depreciation and amortization expense.''';
COMMENT ON COLUMN cash_flow.deferred_income_tax IS '''Deferred income tax expense or benefit.''';
COMMENT ON COLUMN cash_flow.stock_based_compensation IS '''Non-cash expense for stock-based compensation.''';
COMMENT ON COLUMN cash_flow.other_non_cash_items IS '''Other non-cash items included in net income.''';
COMMENT ON COLUMN cash_flow.change_in_working_capital IS '''Change in working capital.''';
COMMENT ON COLUMN cash_flow.change_in_receivables IS '''Change in accounts receivable.''';
COMMENT ON COLUMN cash_flow.change_in_inventory IS '''Change in inventory.''';
COMMENT ON COLUMN cash_flow.change_in_payables_and_accrued_expense IS '''Change in payables and accrued expenses.''';
COMMENT ON COLUMN cash_flow.change_in_other_current_assets IS '''Change in other current assets.''';
COMMENT ON COLUMN cash_flow.change_in_other_current_liabilities IS '''Change in other current liabilities.''';
COMMENT ON COLUMN cash_flow.change_in_other_working_capital IS '''Change in other working capital components.''';

-- Investing Cash Flow Comments
COMMENT ON COLUMN cash_flow.investing_cash_flow IS '''Cash flow from investing activities.''';
COMMENT ON COLUMN cash_flow.net_investment_purchase_and_sale IS '''Net cash from purchase and sale of investments.''';
COMMENT ON COLUMN cash_flow.purchase_of_investment IS '''Cash used to purchase investments.''';
COMMENT ON COLUMN cash_flow.sale_of_investment IS '''Cash received from sale of investments.''';
COMMENT ON COLUMN cash_flow.net_ppe_purchase_and_sale IS '''Net cash from purchase and sale of property, plant, and equipment.''';
COMMENT ON COLUMN cash_flow.purchase_of_ppe IS '''Cash used to purchase property, plant, and equipment.''';
COMMENT ON COLUMN cash_flow.net_business_purchase_and_sale IS '''Net cash from purchase and sale of businesses.''';
COMMENT ON COLUMN cash_flow.purchase_of_business IS '''Cash used to acquire businesses.''';
COMMENT ON COLUMN cash_flow.net_other_investing_changes IS '''Net cash from other investing activities.''';
COMMENT ON COLUMN cash_flow.capital_expenditure IS '''Expenditure on acquiring or maintaining fixed assets.''';

-- Financing Cash Flow Comments
COMMENT ON COLUMN cash_flow.financing_cash_flow IS '''Cash flow from financing activities.''';
COMMENT ON COLUMN cash_flow.net_issuance_payments_of_debt IS '''Net cash from issuance and payment of debt.''';
COMMENT ON COLUMN cash_flow.net_long_term_debt_issuance IS '''Net cash from issuance of long-term debt.''';
COMMENT ON COLUMN cash_flow.long_term_debt_issuance IS '''Cash received from issuing long-term debt.''';
COMMENT ON COLUMN cash_flow.long_term_debt_payments IS '''Cash paid to repay long-term debt.''';
COMMENT ON COLUMN cash_flow.net_short_term_debt_issuance IS '''Net cash from issuance of short-term debt.''';
COMMENT ON COLUMN cash_flow.short_term_debt_issuance IS '''Cash received from issuing short-term debt.''';
COMMENT ON COLUMN cash_flow.short_term_debt_payments IS '''Cash paid to repay short-term debt.''';
COMMENT ON COLUMN cash_flow.net_common_stock_issuance IS '''Net cash from issuance and repurchase of common stock.''';
COMMENT ON COLUMN cash_flow.common_stock_issuance IS '''Cash received from issuing common stock.''';
COMMENT ON COLUMN cash_flow.common_stock_payments IS '''Cash paid to repurchase common stock.''';
COMMENT ON COLUMN cash_flow.cash_dividends_paid IS '''Cash paid as dividends to shareholders.''';
COMMENT ON COLUMN cash_flow.net_other_financing_charges IS '''Net cash from other financing activities.''';
COMMENT ON COLUMN cash_flow.issuance_of_capital_stock IS '''Cash from issuance of capital stock.''';
COMMENT ON COLUMN cash_flow.issuance_of_debt IS '''Cash from issuance of debt.''';
COMMENT ON COLUMN cash_flow.repayment_of_debt IS '''Cash paid for repayment of debt.''';
COMMENT ON COLUMN cash_flow.repurchase_of_capital_stock IS '''Cash paid for repurchase of capital stock.''';

-- Summary Comments
COMMENT ON COLUMN cash_flow.end_cash_position IS '''Cash position at the end of the period.''';
COMMENT ON COLUMN cash_flow.changes_in_cash IS '''Net change in cash during the period.''';
COMMENT ON COLUMN cash_flow.beginning_cash_position IS '''Cash position at the beginning of the period.''';
COMMENT ON COLUMN cash_flow.free_cash_flow IS '''Operating Cash Flow - Capital Expenditure.''';

-- Supplemental Data Comments
COMMENT ON COLUMN cash_flow.income_tax_paid_supplemental_data IS '''Supplemental data on income tax paid.''';
COMMENT ON COLUMN cash_flow.interest_paid_supplemental_data IS '''Supplemental data on interest paid.''';

-- Metadata Comments
COMMENT ON COLUMN cash_flow.data_provider IS '''The source of the market data (e.g., ''fmp'', ''alpha_vantage'').''';
COMMENT ON COLUMN cash_flow.created_at IS '''Timestamp of when the record was first created.''';
COMMENT ON COLUMN cash_flow.updated_at IS '''Timestamp of when the record was last updated.''';

-- =====================================================
-- CASH FLOW TABLE SECURITY POLICY
-- READ-ONLY POLICY: Users can only view data, no modifications allowed.
-- =====================================================

-- Enable Row Level Security on the table
ALTER TABLE cash_flow ENABLE ROW LEVEL SECURITY;

-- Grant SELECT permission to all authenticated users
GRANT SELECT ON cash_flow TO PUBLIC;

-- Revoke modification permissions
REVOKE INSERT, UPDATE, DELETE ON cash_flow FROM PUBLIC;

-- Create policies to enforce read-only access for users
CREATE POLICY "cash_flow_select_policy" ON cash_flow
    FOR SELECT
    USING (true); -- Allow all users to read all rows

CREATE POLICY "cash_flow_insert_policy" ON cash_flow
    FOR INSERT
    WITH CHECK (false); -- Deny all insert operations

CREATE POLICY "cash_flow_update_policy" ON cash_flow
    FOR UPDATE
    USING (false)
    WITH CHECK (false); -- Deny all update operations

CREATE POLICY "cash_flow_delete_policy" ON cash_flow
    FOR DELETE
    USING (false); -- Deny all delete operations