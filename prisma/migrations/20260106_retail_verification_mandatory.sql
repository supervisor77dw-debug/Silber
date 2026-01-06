-- Migration: Make retail_prices verification fields mandatory
-- Date: 2026-01-06
-- Purpose: Ensure NO retail prices without verifiable source

-- Step 1: Delete all existing dummy/mock data (no source_url)
DELETE FROM retail_prices WHERE source_url IS NULL;
DELETE FROM retail_prices WHERE source = 'mock-dev';
DELETE FROM retail_prices WHERE verification_status = 'UNVERIFIED' AND source_url IS NULL;

-- Step 2: Make source_url NOT NULL (prevents future unverified entries)
ALTER TABLE retail_prices
  ALTER COLUMN source_url SET NOT NULL;

-- Step 3: Ensure verification_status has proper default
ALTER TABLE retail_prices
  ALTER COLUMN verification_status SET DEFAULT 'UNVERIFIED';

-- Step 4: Ensure raw_excerpt exists for audit trail
-- (Already exists as nullable, but should be filled by scrapers)

-- Step 5: Add check constraint for valid verification statuses
ALTER TABLE retail_prices
  ADD CONSTRAINT valid_verification_status 
  CHECK (verification_status IN ('VERIFIED', 'UNVERIFIED', 'INVALID_PARSE', 'FAILED'));

-- Step 6: Create index for fast filtering of verified prices
CREATE INDEX IF NOT EXISTS idx_retail_verified 
  ON retail_prices(verification_status, date DESC) 
  WHERE verification_status = 'VERIFIED';

-- Verification query (should return 0 rows after migration)
-- SELECT COUNT(*) FROM retail_prices WHERE source_url IS NULL;
