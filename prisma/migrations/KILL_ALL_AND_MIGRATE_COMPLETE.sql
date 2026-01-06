-- ========================================
-- KILL ALL RETAIL_PRICES LOCKS + MIGRATE
-- ========================================
-- Kills ALL queries accessing retail_prices, then migrates
-- Safer than hardcoded PID (works even if PID changes)
-- ========================================

-- Kill all queries on retail_prices (except this one)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid != pg_backend_pid()
  AND pid IN (
    SELECT l.pid 
    FROM pg_locks l 
    WHERE l.relation = 'retail_prices'::regclass
  );

-- Wait for locks to clear
SELECT pg_sleep(2);

-- Run migration
ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS raw_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS price_usd DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS fx_rate DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fine_oz DOUBLE PRECISION DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS implied_usd_oz DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS premium_percent DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'scraper';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_retail_verification_status 
  ON retail_prices(verification_status);

CREATE INDEX IF NOT EXISTS idx_retail_verified 
  ON retail_prices(verification_status, date DESC);

-- Success message
SELECT 
  'Migration completed! All columns and indexes added.' as result,
  count(*) as columns_added
FROM information_schema.columns 
WHERE table_name = 'retail_prices' 
  AND column_name IN ('verification_status', 'raw_excerpt', 'price_usd', 
                      'currency', 'fx_rate', 'fine_oz', 'implied_usd_oz', 
                      'premium_percent', 'source');
