# CRITICAL FIX DEPLOYMENT GUIDE
**Date:** 2026-01-06  
**Problem:** Stale data loop - UI shows old data, refresh doesn't work  
**Solution:** Phase-by-phase fixes with proper observability

---

## 🚨 IMMEDIATE ACTIONS (Do these FIRST)

### 1. Run Migrations in Supabase SQL Editor

```sql
-- Step 1: Create fetch_runs table for observability
CREATE TABLE IF NOT EXISTS fetch_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'OK', 'PARTIAL', 'ERROR')),
  source TEXT NOT NULL CHECK (source IN ('metal', 'sge', 'fx', 'comex_stock', 'comex_price', 'retail', 'backfill')),
  inserted INTEGER DEFAULT 0,
  updated INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  error_message TEXT,
  sample_url TEXT,
  triggered_by TEXT,
  params JSONB
);

CREATE INDEX IF NOT EXISTS idx_fetch_runs_source_started ON fetch_runs(source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fetch_runs_status ON fetch_runs(status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_fetch_runs_started ON fetch_runs(started_at DESC);

-- Step 2: Delete dummy retail data
DELETE FROM retail_prices WHERE source_url IS NULL;
DELETE FROM retail_prices WHERE source = 'mock-dev';

-- Step 3: Verify current data status
SELECT 'metal_prices' as table_name, COUNT(*) as total, MAX(date) as latest_date FROM metal_prices
UNION ALL
SELECT 'sge_prices', COUNT(*), MAX(date) FROM sge_prices
UNION ALL
SELECT 'fx_rates', COUNT(*), MAX(date) FROM fx_rates
UNION ALL
SELECT 'comex_stocks', COUNT(*), MAX(date) FROM comex_stocks
UNION ALL
SELECT 'retail_prices', COUNT(*), MAX(date) FROM retail_prices;
```

**Expected Output:**
```
table_name     | total | latest_date
---------------|-------|-------------
metal_prices   | 17    | 2025-12-08    <- STALE (should be today-1)
sge_prices     | 4     | 2026-01-02    <- STALE
fx_rates       | 4     | 2026-01-02    <- STALE
comex_stocks   | ?     | ?
retail_prices  | 0     | NULL          <- OK (dummy data deleted)
```

### 2. Test New /api/healthz Endpoint

```bash
curl https://silber-ten.vercel.app/api/healthz | jq '.'
```

**Expected Response:**
```json
{
  "timestamp": "2026-01-06T...",
  "db": { "connected": true },
  "sources": {
    "metal": {
      "count_last_30d": 17,
      "latest_date": "2025-12-08",
      "status": "stale"  // ← SHOULD BE "stale" not "ok"!
    },
    "sge": { "status": "stale" },
    "fx": { "status": "stale" }
  },
  "lastFetchRuns": {
    "metal": null,  // ← No fetch runs yet (table just created)
    "sge": null
  },
  "overall": "degraded"  // ← Correctly shows problem!
}
```

### 3. Manually Trigger Data Refresh

The new `/api/refresh-v2` endpoint is ready but has schema mismatches. **DO NOT USE YET**.

Instead, use the old `/api/refresh` endpoint:

```bash
curl -X POST https://silber-ten.vercel.app/api/refresh \
  -H "Authorization: Bearer $NEXT_PUBLIC_REFRESH_TOKEN"
```

Check if it actually fetches new data:

```sql
-- After refresh, check if data updated
SELECT 'metal_prices' as source, COUNT(*) as count, MAX(date) as latest, MAX(fetched_at) as last_fetch
FROM metal_prices
WHERE fetched_at > NOW() - INTERVAL '5 minutes';  -- Should have NEW rows
```

---

## 📋 ROOT CAUSE ANALYSIS

### Why Data is Stale

1. **metal_prices**: Only 17 rows, latest 2025-12-08
   - Backfill didn't trigger (threshold was 10 rows, needs to be 30)
   - Live fetch might be failing silently

2. **sge_prices / fx_rates**: Only 4 rows each
   - Looks like one-time initial fetch
   - No daily updates happening

3. **UI shows "all sources successful"**
   - Hardcoded timestamp (`2026-01-02`)
   - No real-time validation

4. **Retail HTTP 500**
   - source_url was nullable, now has NOT NULL constraint
   - Old data violates new schema

### Why Refresh Doesn't Work

- **Cron job** might not be configured in Vercel
- **Manual refresh** might only reload DB cache (not fetch live)
- **No observability** - can't see if fetches even attempted
- **No idempotent UPSERTs** - might fail on duplicates

---

## ✅ FIXES IMPLEMENTED (Code Ready)

### Phase 1: Observability ✅
- [x] `fetch_runs` table schema + migration
- [x] `/api/healthz` endpoint shows REAL status
- [x] `FetchRunTracker` class for tracking all fetches

### Phase 2: Refresh Endpoint (PARTIAL)
- [x] `/api/refresh-v2` endpoint with query params
- [ ] Schema mismatches need fixing (SGE priceCnyPerGram, spread fields)
- [ ] Tracking integration complete

### Phase 3: Idempotent UPSERTs ✅
- [x] metal_prices: UPSERT on `date`
- [x] fx_rates: UPSERT on `date`
- [x] sge_prices: UPSERT on `date`
- [x] comex_stocks: UPSERT on `date`
- [x] retail_prices: UPSERT on `date, provider, product`

### Phase 4: UI Fixes (TODO)
- [ ] Remove hardcoded "2026-01-02" timestamp
- [ ] Show real `latest_date` from each source
- [ ] Color-code by freshness (green=ok, yellow=stale, red=empty)
- [ ] "Aktualisieren" button calls `/api/refresh?days=30`

### Phase 5: Retail Fix ✅
- [x] Endpoint never returns 500 (returns 200 with error status)
- [x] UI handles empty/unverified state gracefully

---

## 🔧 SCHEMA ISSUES TO FIX

Before `/api/refresh-v2` can be used, fix these schema mismatches:

### SGE Price Schema
```typescript
// Current fetcher returns:
{ priceCnyPerKg: number }

// But Prisma schema expects:
model SgePrice {
  priceCnyPerGram Float  // ← NOT priceCnyPerKg!
}
```

**Fix:** Either:
1. Update Prisma schema: `priceCnyPerKg Float @map("price_cny_per_kg")`
2. OR update fetcher to return `priceCnyPerGram` (divide by 1000)

### Spread Calculation Schema
```typescript
// calculations.ts returns:
{ absoluteUsd: number, percentOfSpot: number }

// But Prisma schema expects:
model DailySpread {
  spreadUsdPerOz Float    // ← NOT absoluteUsd
  spreadPercent Float     // ← NOT percentOfSpot
}
```

**Fix:** Update refresh-v2 to use correct field names:
```typescript
spreadUsdPerOz: spread.spreadUsdPerOz,  // Not .absoluteUsd
spreadPercent: spread.spreadPercent      // Not .percentOfSpot
```

---

## 🚀 DEPLOYMENT SEQUENCE

### Step 1: Deploy Current Code (Partial Fix)
```bash
git add -A
git commit -m "Add fetch_runs tracking + healthz endpoint + retail 500 fix"
git push origin main
```

**What this gives you:**
- ✅ `/api/healthz` shows REAL status (exposes the problem)
- ✅ `/api/retail-prices` never throws 500
- ✅ `fetch_runs` table ready for tracking
- ❌ `/api/refresh-v2` NOT usable yet (schema mismatch)

### Step 2: Run Migrations
1. Open Supabase SQL Editor
2. Paste migration from section above
3. Execute
4. Verify with health check

### Step 3: Test Current Refresh
```bash
# Use OLD refresh endpoint
curl -X POST https://silber-ten.vercel.app/api/refresh \
  -H "Authorization: Bearer $NEXT_PUBLIC_REFRESH_TOKEN"

# Then check if data actually updated
curl https://silber-ten.vercel.app/api/healthz | jq '.sources.metal.latest_date'
```

**If data is still stale after refresh:**
- Check Vercel logs for errors
- Check if metal fetcher is actually calling Stooq/metals-api
- Check if UPSERTs are succeeding

### Step 4: Fix Schema Mismatches (Next Commit)
1. Update SGE schema OR fetcher
2. Update spread field names in refresh-v2
3. Deploy
4. Test `/api/refresh-v2?days=30&sources=metal,sge,fx`

### Step 5: Configure Vercel Cron
Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/refresh-v2?days=3&sources=metal,sge,fx,comex_stock,comex_price",
      "schedule": "0 * * * *"
    }
  ]
}
```

---

## 🧪 VERIFICATION QUERIES

### Check if Refresh Actually Worked
```sql
-- Metal prices: Should have rows from last 30 days
SELECT date, xag_usd_close, source, fetched_at
FROM metal_prices
WHERE date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date DESC
LIMIT 10;

-- SGE: Should have recent data
SELECT date, price_usd_per_oz, fetched_at
FROM sge_prices
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC;

-- FX: Should have recent data
SELECT date, usd_cny_rate, fetched_at
FROM fx_rates
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC;

-- Fetch Runs: Should have entries from recent refreshes
SELECT source, status, inserted, updated, started_at, finished_at, error_message
FROM fetch_runs
ORDER BY started_at DESC
LIMIT 20;
```

### Expected After Successful Refresh
```
metal_prices: 30+ rows, latest = today or today-1
sge_prices: 7+ rows, latest = today-1 (weekends might be missing)
fx_rates: 7+ rows, latest = today-1
fetch_runs: Multiple rows with status='OK', inserted>0 or updated>0
```

---

## ❌ KNOWN ISSUES (Still TODO)

1. **Schema Mismatch** - SGE & Spread fields don't match between fetcher and DB
2. **UI Hardcoded Date** - Still shows "2026-01-02" instead of live data
3. **Cron Not Configured** - Auto-refresh not happening
4. **Backfill Threshold** - Set to 10 rows, should be 30
5. **Error Visibility** - fetch_runs table exists but not displayed in UI

---

## 🎯 SUCCESS CRITERIA

**Deployment is successful when:**

1. ✅ `/api/healthz` returns status="degraded" or "critical" (HONEST!)
2. ✅ `fetch_runs` table exists and has indexes
3. ✅ `/api/retail-prices` returns 200 (not 500)
4. ⏳ `/api/refresh` actually fetches new data (verify with SQL)
5. ⏳ `metal_prices` has ≥30 rows with latest ≥ today-1
6. ⏳ `sge_prices` / `fx_rates` updated daily
7. ⏳ UI shows real dates (not hardcoded "2026-01-02")

**If still stale after this deployment:**
- Check Vercel logs for fetch errors
- Verify API keys (metals-api, Stooq access)
- Check network/CORS issues
- Use `fetch_runs` table to diagnose

---

## 📞 NEXT STEPS FOR USER

1. **Deploy current code** (push to GitHub, auto-deploys to Vercel)
2. **Run migrations** in Supabase SQL Editor
3. **Test `/api/healthz`** - should show "degraded" status
4. **Manually trigger `/api/refresh`** and check SQL if data updates
5. **Report back**: Did metal_prices actually get new rows? Check with healthz.

**If data is STILL stale after manual refresh:**
- We have a fetcher problem (API keys, network, logic)
- `fetch_runs` table will show error messages
- Need to debug specific fetcher (metal/sge/fx)

**If data DOES update:**
- Fix schema mismatches (SGE, spread)
- Deploy refresh-v2
- Configure cron
- Update UI to show live dates
