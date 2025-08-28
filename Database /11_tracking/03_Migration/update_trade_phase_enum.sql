-- Migration to update trade_phase enum to match frontend values
-- This updates the enum from ('planning', 'execution', 'reflection') 
-- to ('pre_entry', 'entry', 'management', 'exit', 'post_analysis')

BEGIN;

-- First, add the new enum values
ALTER TYPE trade_phase ADD VALUE IF NOT EXISTS 'pre_entry';
ALTER TYPE trade_phase ADD VALUE IF NOT EXISTS 'entry';
ALTER TYPE trade_phase ADD VALUE IF NOT EXISTS 'management';
ALTER TYPE trade_phase ADD VALUE IF NOT EXISTS 'exit';
ALTER TYPE trade_phase ADD VALUE IF NOT EXISTS 'post_analysis';

-- Update existing data to map old values to new ones
UPDATE public.trade_notes 
SET phase = CASE 
    WHEN phase = 'planning' THEN 'pre_entry'
    WHEN phase = 'execution' THEN 'entry'
    WHEN phase = 'reflection' THEN 'post_analysis'
    ELSE phase
END
WHERE phase IN ('planning', 'execution', 'reflection');

-- Create a new enum type with only the new values
CREATE TYPE trade_phase_new AS ENUM ('pre_entry', 'entry', 'management', 'exit', 'post_analysis');

-- Update the table to use the new enum type
ALTER TABLE public.trade_notes 
ALTER COLUMN phase TYPE trade_phase_new 
USING phase::text::trade_phase_new;

-- Drop the old enum type and rename the new one
DROP TYPE trade_phase;
ALTER TYPE trade_phase_new RENAME TO trade_phase;

COMMIT;
