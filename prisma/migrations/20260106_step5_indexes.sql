-- STEP 5: Create indexes
-- Run this AFTER all columns exist

CREATE INDEX IF NOT EXISTS idx_retail_verification_status 
  ON retail_prices(verification_status);

CREATE INDEX IF NOT EXISTS idx_retail_verified 
  ON retail_prices(verification_status, date DESC);

-- Verify indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'retail_prices'
  AND indexname LIKE 'idx_retail_%';
