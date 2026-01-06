-- ========================================
-- FIX: Clear table locks before migration
-- ========================================
-- Problem: ALTER TABLE times out because table is locked by active connections
-- Solution: Kill blocking queries, then run migration
-- ========================================

-- STEP 1: Check what's blocking the table
SELECT 
  pid,
  usename,
  state,
  wait_event_type,
  wait_event,
  query,
  query_start,
  state_change
FROM pg_stat_activity
WHERE 
  datname = current_database()
  AND state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start;

-- STEP 2: Check table locks
SELECT 
  l.pid,
  l.mode,
  l.granted,
  a.usename,
  a.query,
  a.query_start
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation = 'retail_prices'::regclass
ORDER BY l.granted, l.pid;

-- STEP 3: Kill blocking queries (ONLY if needed)
-- UNCOMMENT and run if you see long-running queries blocking the table:
-- SELECT pg_terminate_backend(pid) 
-- FROM pg_stat_activity 
-- WHERE datname = current_database()
--   AND pid != pg_backend_pid()
--   AND state != 'idle'
--   AND query_start < now() - interval '30 seconds';

-- STEP 4: Now run the actual migration
-- After killing blockers, immediately run:
-- ALTER TABLE retail_prices
--   ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED',
--   ADD COLUMN IF NOT EXISTS raw_excerpt TEXT;
