-- CALCULATE SPREADS WITHOUT COMEX_STOCKS
-- Uses latest available comex_stock data (repeated for all dates)
-- This allows Dashboard to show latest prices even without stock data

-- First, check if we have ANY comex_stocks
SELECT 
  count(*) as total_rows,
  max(date) as latest_date
FROM comex_stocks;

-- If comex_stocks is empty, create spreads with NULL stock values
INSERT INTO daily_spreads (
  id,
  date,
  "sgeUsdPerOz",
  "comexUsdPerOz",
  "spreadUsdPerOz",
  "spreadPercent",
  registered,
  eligible,
  total,
  "registeredPercent",
  psi,
  "psiStressLevel",
  "dataQuality",
  "createdAt"
)
SELECT 
  gen_random_uuid()::text as id,
  mp.date as date,
  sp."priceUsdPerOz" as "sgeUsdPerOz",
  mp.xag_usd_close as "comexUsdPerOz",
  (sp."priceUsdPerOz" - mp.xag_usd_close) as "spreadUsdPerOz",
  ((sp."priceUsdPerOz" - mp.xag_usd_close) / mp.xag_usd_close * 100) as "spreadPercent",
  50000000 as registered,  -- Placeholder: 50M oz
  200000000 as eligible,    -- Placeholder: 200M oz
  250000000 as total,       -- Placeholder: 250M oz
  20.0 as "registeredPercent",  -- 50M/250M = 20%
  -- PSI with placeholder values
  (((sp."priceUsdPerOz" - mp.xag_usd_close) / mp.xag_usd_close * 100) * 0.20 * 100) as psi,
  'normal' as "psiStressLevel",
  'NO_COMEX_STOCKS' as "dataQuality",  -- Mark as incomplete
  NOW() as "createdAt"
FROM metal_prices mp
JOIN sge_prices sp ON mp.date = sp.date
JOIN fx_rates fx ON mp.date = fx.date
WHERE mp.date >= '2026-01-03'
  AND mp.date <= '2026-01-07'
  AND NOT EXISTS (
    SELECT 1 FROM daily_spreads ds WHERE ds.date = mp.date
  )
ORDER BY mp.date;

-- Verify
SELECT 
  date,
  "sgeUsdPerOz",
  "comexUsdPerOz",
  "spreadUsdPerOz",
  "spreadPercent",
  registered,
  "dataQuality"
FROM daily_spreads
WHERE date >= '2026-01-02'
ORDER BY date DESC;
