-- CALCULATE MISSING SPREADS
-- Run this to manually calculate daily_spreads from existing raw data

-- First, see what dates have ALL required data but NO spread
WITH dates_with_all_data AS (
  SELECT DISTINCT
    mp.date as metal_date,
    sp.date as sge_date,
    fx.date as fx_date,
    cs.date as stock_date
  FROM metal_prices mp
  FULL OUTER JOIN sge_prices sp ON mp.date = sp.date
  FULL OUTER JOIN fx_rates fx ON mp.date = fx.date
  FULL OUTER JOIN comex_stocks cs ON mp.date = cs.date
  WHERE mp.date IS NOT NULL 
    AND sp.date IS NOT NULL 
    AND fx.date IS NOT NULL 
    AND cs.date IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM daily_spreads ds WHERE ds.date = mp.date
    )
  ORDER BY mp.date DESC
)
SELECT * FROM dates_with_all_data;

-- If you see dates above, run this INSERT to calculate spreads:
-- (This is a simplified version - production code has PSI calculation)

INSERT INTO daily_spreads (
  id,
  date,
  sge_usd_per_oz,
  comex_usd_per_oz,
  spread_usd_per_oz,
  spread_percent,
  registered,
  eligible,
  total,
  registered_percent,
  psi,
  psi_stress_level,
  data_quality,
  created_at,
  updated_at,
  fetched_at
)
SELECT 
  gen_random_uuid()::text as id,
  mp.date as date,
  sp.price_usd_per_oz as sge_usd_per_oz,
  mp.xag_usd_close as comex_usd_per_oz,
  (sp.price_usd_per_oz - mp.xag_usd_close) as spread_usd_per_oz,
  ((sp.price_usd_per_oz - mp.xag_usd_close) / mp.xag_usd_close * 100) as spread_percent,
  cs.total_registered as registered,
  cs.total_eligible as eligible,
  cs.total_combined as total,
  cs.registered_percent,
  -- Simple PSI: spread% * (registered/total) * 100
  (((sp.price_usd_per_oz - mp.xag_usd_close) / mp.xag_usd_close * 100) * (cs.total_registered::decimal / NULLIF(cs.total_combined, 0)) * 100) as psi,
  CASE 
    WHEN (((sp.price_usd_per_oz - mp.xag_usd_close) / mp.xag_usd_close * 100) * (cs.total_registered::decimal / NULLIF(cs.total_combined, 0)) * 100) > 50 THEN 'extreme'
    WHEN (((sp.price_usd_per_oz - mp.xag_usd_close) / mp.xag_usd_close * 100) * (cs.total_registered::decimal / NULLIF(cs.total_combined, 0)) * 100) > 20 THEN 'high'
    WHEN (((sp.price_usd_per_oz - mp.xag_usd_close) / mp.xag_usd_close * 100) * (cs.total_registered::decimal / NULLIF(cs.total_combined, 0)) * 100) > 10 THEN 'moderate'
    ELSE 'normal'
  END as psi_stress_level,
  'BACKFILLED' as data_quality,
  NOW() as created_at,
  NOW() as updated_at,
  NOW() as fetched_at
FROM metal_prices mp
JOIN sge_prices sp ON mp.date = sp.date
JOIN fx_rates fx ON mp.date = fx.date
JOIN comex_stocks cs ON mp.date = cs.date
WHERE NOT EXISTS (
  SELECT 1 FROM daily_spreads ds WHERE ds.date = mp.date
)
ORDER BY mp.date;

-- Verify results
SELECT 
  'daily_spreads' as table_name,
  count(*) as total_rows,
  min(date) as first_date,
  max(date) as last_date,
  count(DISTINCT date) as unique_dates
FROM daily_spreads;

-- Show latest spreads
SELECT 
  date,
  sge_usd_per_oz,
  comex_usd_per_oz,
  spread_usd_per_oz,
  spread_percent,
  registered,
  data_quality
FROM daily_spreads
ORDER BY date DESC
LIMIT 10;
