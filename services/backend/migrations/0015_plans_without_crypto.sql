-- Plans cover stocks and options only. A crypto plan made before this is
-- removed; its fractional size cannot be kept as whole shares.
DELETE FROM trade_plans WHERE asset_class = 'crypto';

ALTER TABLE trade_plans DROP CONSTRAINT trade_plans_asset_class_check;
ALTER TABLE trade_plans ADD CONSTRAINT trade_plans_asset_class_check CHECK (asset_class IN ('stock', 'option'));
