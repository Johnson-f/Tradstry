-- ALTER STATEMENT: Add logo column to earnings_calendar table
-- This adds a logo URL column to store company logos in the earnings calendar

ALTER TABLE earnings_calendar 
ADD COLUMN logo VARCHAR(500);

-- Add index for logo column for better query performance
CREATE INDEX IF NOT EXISTS idx_earnings_calendar_logo ON earnings_calendar (logo);

-- Add column comment
COMMENT ON COLUMN earnings_calendar.logo IS 'URL to company logo image';

-- Update existing records to populate logo from company_info table
UPDATE earnings_calendar 
SET logo = ci.logo
FROM company_info ci 
WHERE earnings_calendar.symbol = ci.symbol 
AND earnings_calendar.logo IS NULL 
AND ci.logo IS NOT NULL;
