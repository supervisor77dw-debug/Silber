-- CHECK ACTUAL DATA STATUS
-- Run this in Supabase to see what's really in the DB

-- 1. Metal Prices Overview
SELECT 
  'metal_prices' as table_name,
  count(*) as total_rows,
  min(date) as first_date,
  max(date) as last_date,
  max(fetched_at) as last_fetch,
  count(DISTINCT date) as unique_dates
FROM metal_prices;

-- 2. Recent Metal Prices (last 10 rows)
SELECT 
  date,
  xag_usd_close as price,
  source,
  fetched_at
FROM metal_prices
ORDER BY date DESC
LIMIT 10;

-- 3. SGE Prices Overview
SELECT 
  'sge_prices' as table_name,
  count(*) as total_rows,
  min(date) as first_date,
  max(date) as last_date,
  count(DISTINCT date) as unique_dates
FROM sge_prices;

-- 4. FX Rates Overview
SELECT 
  'fx_rates' as table_name,
  count(*) as total_rows,
  min(date) as first_date,
  max(date) as last_date
FROM fx_rates;

-- 5. COMEX Stocks Overview
SELECT 
  'comex_stocks' as table_name,
  count(*) as total_rows,
  min(date) as first_date,
  max(date) as last_date
FROM comex_stocks;

-- 6. Daily Spreads Overview (calculated data)
SELECT 
  'daily_spreads' as table_name,
  count(*) as total_rows,
  min(date) as first_date,
  max(date) as last_date
FROM daily_spreads;

-- 7. Check if we have TODAY's data
SELECT 
  CURRENT_DATE as today,
  EXISTS(SELECT 1 FROM metal_prices WHERE date = CURRENT_DATE) as has_metal_today,
  EXISTS(SELECT 1 FROM sge_prices WHERE date = CURRENT_DATE) as has_sge_today,
  EXISTS(SELECT 1 FROM fx_rates WHERE date = CURRENT_DATE) as has_fx_today,
  EXISTS(SELECT 1 FROM daily_spreads WHERE date = CURRENT_DATE) as has_spread_today;
