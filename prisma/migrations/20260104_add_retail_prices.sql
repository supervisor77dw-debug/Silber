-- Migration: Add retail_prices table for händler price comparison
-- Date: 2026-01-04

CREATE TABLE IF NOT EXISTS "retail_prices" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "date" DATE NOT NULL,
    
    "provider" TEXT NOT NULL,  -- "Degussa", "ProAurum", etc.
    "product" TEXT NOT NULL,    -- "1oz Maple Leaf", "1oz Philharmoniker", etc.
    
    "price_eur" DOUBLE PRECISION NOT NULL,
    "fine_oz" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    
    -- Calculated fields
    "implied_usd_oz" DOUBLE PRECISION,
    "premium_percent" DOUBLE PRECISION,
    
    -- Source tracking
    "source" TEXT NOT NULL DEFAULT 'manual',
    "source_url" TEXT,
    
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "retail_prices_pkey" PRIMARY KEY ("id")
);

-- Create index for date + provider queries
CREATE INDEX IF NOT EXISTS "retail_prices_date_provider_idx" ON "retail_prices"("date", "provider");

-- Comment
COMMENT ON TABLE "retail_prices" IS 'Retail/Händler prices for premium comparison vs spot';
