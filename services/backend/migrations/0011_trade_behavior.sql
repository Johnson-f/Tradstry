-- How the trader felt and behaved on a trade. Every field is optional: null
-- means not recorded, which analytics keeps apart from "no".
ALTER TABLE trade_annotations
    ADD COLUMN conviction smallint CHECK (conviction BETWEEN 1 AND 5),
    ADD COLUMN market_regime text CHECK (market_regime IN ('trending', 'choppy', 'ranging', 'volatile')),
    ADD COLUMN planned_pre_market boolean,
    ADD COLUMN revenge_trade boolean,
    ADD COLUMN broke_thirty_minute_rule boolean,
    ADD COLUMN rule_adherence smallint CHECK (rule_adherence BETWEEN 1 AND 5);
