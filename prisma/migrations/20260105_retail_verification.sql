-- Add verification tracking fields to retail_prices
ALTER TABLE retail_prices
ADD COLUMN IF NOT EXISTS raw_excerpt TEXT,
ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED';

-- Create index for filtering by verification status
CREATE INDEX IF NOT EXISTS idx_retail_prices_verification ON retail_prices(verification_status);

COMMENT ON COLUMN retail_prices.raw_excerpt IS 'HTML/JSON snippet containing the price (max 2KB) for audit';
COMMENT ON COLUMN retail_prices.verification_status IS 'VERIFIED, UNVERIFIED, or FAILED';
