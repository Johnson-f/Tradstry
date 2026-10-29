-- SnapTrade's standardised cash/margin flag. The account type itself is
-- derived from raw_type in code, so it has no column.
ALTER TABLE brokerage_accounts
    ADD COLUMN cash_or_margin text NOT NULL DEFAULT 'unknown'
        CHECK (cash_or_margin IN ('cash', 'margin', 'unknown'));
