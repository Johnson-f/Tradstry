-- Migration to update trade_phase enum to match frontend values
-- This replaces the enum entirely with new values

BEGIN;

-- Step 1: Create a new enum type with the desired values
CREATE TYPE trade_phase_new AS ENUM ('pre_entry', 'entry', 'management', 'exit', 'post_analysis');

-- Step 2: Add a temporary column with the new enum type
ALTER TABLE public.trade_notes 
ADD COLUMN phase_new trade_phase_new;

-- Step 3: Migrate data from old column to new column with mapping
UPDATE public.trade_notes 
SET phase_new = CASE 
    WHEN phase::text = 'planning' THEN 'pre_entry'::trade_phase_new
    WHEN phase::text = 'execution' THEN 'entry'::trade_phase_new
    WHEN phase::text = 'reflection' THEN 'post_analysis'::trade_phase_new
    ELSE NULL
END
WHERE phase IS NOT NULL;

-- Step 4: Drop the old column
ALTER TABLE public.trade_notes DROP COLUMN phase;

-- Step 5: Rename the new column to the original name
ALTER TABLE public.trade_notes RENAME COLUMN phase_new TO phase;

-- Step 6: Drop the old enum type
DROP TYPE trade_phase CASCADE;

-- Step 7: Rename the new enum type to the original name
ALTER TYPE trade_phase_new RENAME TO trade_phase;

COMMIT;