-- ========================================
-- KILL LOCK + RUN MIGRATION (ONE SHOT)
-- ========================================
-- This kills PID 222014 and immediately runs migration
-- Execute this as ONE query in Supabase SQL Editor
-- ========================================

-- Kill the blocking query
SELECT pg_terminate_backend(222014);

-- Wait 1 second for lock release
SELECT pg_sleep(1);

-- Run migration immediately
ALTER TABLE retail_prices
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS raw_excerpt TEXT;

-- Success message
SELECT 'Migration completed! Columns added.' as result;
