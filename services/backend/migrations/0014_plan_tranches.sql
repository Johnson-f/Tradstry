-- A plan can split its risk across several entries, and round sizes up.
-- `entry` becomes the size-weighted average entry. Existing plans become one
-- entry taking all of the risk.
ALTER TABLE trade_plans
    ADD COLUMN tranches jsonb NOT NULL DEFAULT '[]',
    ADD COLUMN round_up boolean NOT NULL DEFAULT false;

UPDATE trade_plans SET tranches = jsonb_build_array(jsonb_build_object('percent', '100', 'entry', entry::text));

ALTER TABLE trade_plans ALTER COLUMN tranches DROP DEFAULT;

ALTER TABLE trade_plans ADD CONSTRAINT trade_plans_tranches_check
    CHECK (jsonb_typeof(tranches) = 'array' AND jsonb_array_length(tranches) BETWEEN 1 AND 10);
