-- STEP 4: Add source tracking column
-- Run this AFTER step 3

ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'scraper';

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'retail_prices' 
  AND column_name = 'source';
