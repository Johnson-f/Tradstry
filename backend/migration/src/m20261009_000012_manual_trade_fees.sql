-- Manual trades can carry their fees. Their money is the price move less fees, and
-- the outcome follows that money, as it does for broker trades. A NULL fee means
-- the fees were never entered, which reports treat as unknown, not zero.

CREATE OR REPLACE FUNCTION journal_protect_entry_revision() RETURNS trigger LANGUAGE plpgsql AS $entry_revision$
DECLARE material_changed boolean;
BEGIN
    IF TG_OP='UPDATE' THEN
        material_changed=ROW(NEW.open_date,NEW.close_date,NEW.entry_price,NEW.exit_price,NEW.position_size,NEW.symbol,NEW.trade_type,NEW.total_pl,NEW.contract_multiplier,NEW.lifecycle_state,NEW.remaining_quantity,NEW.realized_net,NEW.fees_paid,NEW.episode_id,NEW.retired_at)
            IS DISTINCT FROM ROW(OLD.open_date,OLD.close_date,OLD.entry_price,OLD.exit_price,OLD.position_size,OLD.symbol,OLD.trade_type,OLD.total_pl,OLD.contract_multiplier,OLD.lifecycle_state,OLD.remaining_quantity,OLD.realized_net,OLD.fees_paid,OLD.episode_id,OLD.retired_at);
        IF OLD.source_kind='broker' AND material_changed AND current_setting('tradstry.journal_writer',true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'JOURNAL_V2_REQUIRED: broker results must be changed through the journal owner';
        END IF;
        IF material_changed THEN NEW.materialized_revision=greatest(NEW.materialized_revision,OLD.materialized_revision+1); END IF;
        IF (to_jsonb(NEW)-'updated_at'-'record_version') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at'-'record_version') THEN
            NEW.record_version=greatest(NEW.record_version,OLD.record_version+1);
        END IF;
    END IF;
    IF NEW.source_kind='manual' AND NEW.close_date IS NOT NULL AND NEW.total_pl IS NOT NULL THEN
        NEW.realized_net=NEW.position_size::text::numeric*NEW.entry_price::text::numeric*NEW.total_pl::text::numeric/100*NEW.contract_multiplier::text::numeric-coalesce(NEW.fees_paid,0);
        NEW.remaining_quantity=0;
        NEW.outcome=CASE WHEN NEW.realized_net>0 THEN 'profit' WHEN NEW.realized_net<0 THEN 'loss' ELSE 'breakeven' END;
    END IF;
    RETURN NEW;
END $entry_revision$;

-- Only fees typed by hand are checked; a broker can report a rebate.
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entry_fees_check;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entry_fees_check CHECK (source_kind <> 'manual' OR fees_paid IS NULL OR fees_paid >= 0);
