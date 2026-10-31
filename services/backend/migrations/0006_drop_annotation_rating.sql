-- The 1–5 execution rating on journal entries is no longer part of Tradstry.
ALTER TABLE trade_annotations DROP COLUMN rating;
