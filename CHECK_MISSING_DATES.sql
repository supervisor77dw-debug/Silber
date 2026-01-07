-- CHECK WHY 2026-01-03 to 2026-01-07 NOT CALCULATED
-- Shows which tables have data for each date

SELECT 
  d.date,
  EXISTS(SELECT 1 FROM metal_prices mp WHERE mp.date = d.date) as has_metal,
  EXISTS(SELECT 1 FROM sge_prices sp WHERE sp.date = d.date) as has_sge,
  EXISTS(SELECT 1 FROM fx_rates fx WHERE fx.date = d.date) as has_fx,
  EXISTS(SELECT 1 FROM comex_stocks cs WHERE cs.date = d.date) as has_comex_stock,
  EXISTS(SELECT 1 FROM daily_spreads ds WHERE ds.date = d.date) as has_spread
FROM (
  SELECT generate_series(
    '2026-01-02'::date,
    '2026-01-07'::date,
    '1 day'::interval
  )::date as date
) d
ORDER BY d.date;

-- Show latest date for each table
SELECT 
  'metal_prices' as table_name,
  max(date) as latest_date
FROM metal_prices
UNION ALL
SELECT 
  'sge_prices',
  max(date)
FROM sge_prices
UNION ALL
SELECT 
  'fx_rates',
  max(date)
FROM fx_rates
UNION ALL
SELECT 
  'comex_stocks',
  max(date)
FROM comex_stocks
UNION ALL
SELECT 
  'daily_spreads',
  max(date)
FROM daily_spreads;
