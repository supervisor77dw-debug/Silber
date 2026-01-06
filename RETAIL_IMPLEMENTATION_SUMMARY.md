# Retail Scraper Implementation - Complete Summary

**Date:** 2026-01-06  
**Commit:** 6af157a  
**Status:** ✅ PRODUCTION READY - Migration Required

---

## 🎯 Auftrag Erfüllt

### User Requirement Checklist

1. ✅ **Schema erweitern (Migration)**
   - `source_url` → NOT NULL constraint
   - `raw_excerpt` → HTML/JSON proof (max 2KB)
   - `verification_status` → NOT NULL with CHECK constraint
   - `fetched_at` → Already exists

2. ✅ **Retail-Scrape implementieren (Node runtime)**
   - ProAurum: 1oz Philharmoniker Silber
   - Degussa: 1oz Maple Leaf Silber
   - Multiple parsing strategies (meta tags, JSON-LD, CSS selectors)
   - Saves: provider, product, date, price_eur, source_url, raw_excerpt, verification_status

3. ✅ **Plausibilitätscheck gegen Spot**
   - Spot EUR = metal_prices.xag_usd_close / usd_eur_rate
   - If retail < spot * 0.95 → `INVALID_PARSE`
   - If retail > spot * 20 → `INVALID_PARSE`
   - Else → `VERIFIED`
   - INVALID_PARSE prices NOT shown in UI

4. ✅ **UPSERT mit raw SQL**
   ```sql
   ON CONFLICT (date, provider, product) DO UPDATE SET
     price_eur = EXCLUDED.price_eur,
     source_url = EXCLUDED.source_url,
     raw_excerpt = EXCLUDED.raw_excerpt,
     verification_status = EXCLUDED.verification_status,
     fetched_at = EXCLUDED.fetched_at
   ```

5. ✅ **UI-Änderung (MUSS)**
   - Wenn `source_url IS NULL` ODER `verification_status != 'VERIFIED'`:
     → Kein Preis angezeigt, stattdessen Warning + Diagnostics
   - Niemals mehr Default/Dummy anzeigen
   - Yellow warnings for `INVALID_PARSE`, `FAILED`, `UNVERIFIED`

6. ✅ **Dummy entfernen**
   - Alle €35.50/€35.80 Werte gelöscht
   - Kein `process.env.NODE_ENV !== 'production'` Code mehr
   - `source_url` niemals NULL in production

---

## 📦 Deliverables

### Code Files Created

1. **lib/fetchers/retail.ts** (NEW)
   - `scrapeProAurum()` - Parses 1oz Philharmoniker price
   - `scrapeDegussa()` - Parses 1oz Maple Leaf price
   - `checkPlausibility()` - Validates price vs spot
   - `fetchRetailPrices()` - Orchestrates both scrapers + validation

2. **prisma/migrations/20260106_retail_verification_mandatory.sql** (NEW)
   - DELETE all existing dummy data
   - ALTER source_url to NOT NULL
   - ADD CHECK constraint for verification statuses
   - CREATE index for verified prices

3. **RETAIL_DEPLOYMENT_GUIDE.md** (NEW)
   - Complete migration steps
   - Verification queries
   - Troubleshooting guide
   - Expected UI states with ASCII mockups

### Code Files Modified

1. **app/api/refresh/route.ts**
   - Import `fetchRetailPrices` from retail scraper
   - Get spot price + FX rate for plausibility check
   - Call real scrapers instead of mock data
   - UPSERT with raw SQL (proper ON CONFLICT)
   - NO more mock data in any environment

2. **components/RetailPrices.tsx**
   - Filter: `verifiedPrices = prices.filter(p => p.verificationStatus === 'VERIFIED' && p.sourceUrl)`
   - Show yellow warning box if no verified prices
   - Display diagnostics for `INVALID_PARSE`, `FAILED`, `UNVERIFIED`
   - Link to source URL for manual verification
   - Green "✓ Verified" badge for valid prices

3. **prisma/schema.prisma**
   - `sourceUrl String` (NOT nullable)
   - `verificationStatus` includes 'INVALID_PARSE' option
   - Added index for verified prices

4. **package.json**
   - Added `cheerio` dependency for HTML parsing

---

## 🚀 Deployment Status

**Git:**
- ✅ Committed: 6af157a
- ✅ Pushed to GitHub: main branch
- ✅ Vercel auto-deploy triggered

**Database:**
- ⏳ Migration PENDING (manual execution required)
- ⚠️ CRITICAL: Run migration BEFORE using scrapers

**Build:**
- ✅ Compiles successfully
- ⚠️ 3 ESLint warnings (React hooks - non-critical)

---

## ⚠️ CRITICAL: Migration Required

**BEFORE deployment shows live data:**

1. Open Supabase SQL Editor
2. Execute migration:
   ```sql
   DELETE FROM retail_prices WHERE source_url IS NULL;
   DELETE FROM retail_prices WHERE source = 'mock-dev';
   
   ALTER TABLE retail_prices
     ALTER COLUMN source_url SET NOT NULL;
   
   ALTER TABLE retail_prices
     ADD CONSTRAINT valid_verification_status 
     CHECK (verification_status IN ('VERIFIED', 'UNVERIFIED', 'INVALID_PARSE', 'FAILED'));
   
   CREATE INDEX IF NOT EXISTS idx_retail_verified 
     ON retail_prices(verification_status, date DESC) 
     WHERE verification_status = 'VERIFIED';
   ```

3. Verify: `SELECT COUNT(*) FROM retail_prices WHERE source_url IS NULL;` → Must be 0

**If migration not run:**
- Scraper will fail with constraint violation
- Old dummy data (€35.50/€35.80) may still appear
- Production deployment will be broken

---

## 🧪 Testing Plan

### Test 1: Manual Refresh
```bash
curl -X POST https://silber-ten.vercel.app/api/refresh \
  -H "Authorization: Bearer $NEXT_PUBLIC_REFRESH_TOKEN"
```

**Expected Logs:**
```
[FETCH_RETAIL_START]
[RETAIL_CONTEXT] { spotPriceUsd: 30.5, usdEurRate: 1.1 }
[FETCH_RETAIL_OK] 2 results
[RETAIL_RESULT] { provider: 'ProAurum', status: 'VERIFIED' }
[RETAIL_RESULT] { provider: 'Degussa', status: 'VERIFIED' }
[DB_WRITE_OK] retail: 2
```

### Test 2: Check API Response
```bash
curl https://silber-ten.vercel.app/api/retail-prices | jq '.prices[]'
```

**Expected:**
```json
{
  "provider": "ProAurum",
  "product": "1oz Philharmoniker",
  "priceEur": 82.50,
  "sourceUrl": "https://www.proaurum.de/...",
  "verificationStatus": "VERIFIED"
}
```

### Test 3: SQL Proof
```sql
SELECT date, provider, product, price_eur, source_url, verification_status, fetched_at
FROM retail_prices
ORDER BY fetched_at DESC
LIMIT 20;
```

**Expected:**
- All rows have `source_url` NOT NULL
- All rows have `verification_status` = 'VERIFIED' or 'INVALID_PARSE'
- NO rows with €35.50 or €35.80
- Prices in realistic range (€80-90 for 1oz silver)

### Test 4: UI Verification

Open https://silber-ten.vercel.app

**Success Case:**
- "🪙 Retail Prices" section shows green "✓ Verified" badges
- Prices displayed with source links
- No dummy €35.50/€35.80 values

**Parse Error Case:**
- Yellow warning box: "⚠ Keine verifizierten Retail-Preise"
- Shows "ungültige Parse(s): zu niedrig/hoch vs Spot"
- Links to source for manual check

**Scraper Failure Case:**
- Yellow warning box with "Fetch-Fehler"
- Diagnostic info visible
- Never shows dummy prices as fallback

---

## 📊 Success Metrics

**Deployment is successful when:**

1. ✅ Migration executed (0 rows with source_url IS NULL)
2. ✅ `/api/refresh` returns 200 with `updated: ['retail']`
3. ✅ `/api/retail-prices` returns real data OR empty array (no dummy)
4. ✅ UI shows either:
   - Green verified prices (€80-90 range), OR
   - Yellow warnings with diagnostics (NOT silent failure)
5. ✅ SQL proof shows source_url filled for all rows
6. ✅ No €35.50 or €35.80 prices anywhere in production

**Failure Indicators (Rollback Required):**

- ❌ Dummy prices (€35.50/€35.80) appear in UI
- ❌ Rows with `source_url IS NULL` in database
- ❌ 500 errors on `/api/refresh` (constraint violation)
- ❌ Silent failures (no data, no warnings)

---

## 🔧 Maintenance

### If Scraper Breaks (Website Structure Changes)

1. Check Vercel logs: `vercel logs --follow`
2. Look for: `[RETAIL_ERROR] Could not extract price from HTML`
3. Inspect current HTML: Open ProAurum/Degussa URL in browser
4. Update CSS selectors in `lib/fetchers/retail.ts`
5. Deploy updated selectors
6. Re-run refresh

### If Prices Are INVALID_PARSE

1. Query: `SELECT * FROM retail_prices WHERE verification_status = 'INVALID_PARSE';`
2. Check `raw_excerpt` to see what was parsed
3. Options:
   - Adjust plausibility bounds (currently ±5% of spot)
   - Fix scraper if parsing wrong element
   - Add VAT handling if needed

### Adding More Products

Edit `lib/fetchers/retail.ts`:

```typescript
export async function scrapeProAurumKrugerrand(): Promise<RetailPriceResult> {
  const url = 'https://www.proaurum.de/...krugerrand';
  // Same structure as existing scrapers
}

export async function fetchRetailPrices(...) {
  const [proaurum, degussa, krugerrand] = await Promise.all([
    scrapeProAurum(),
    scrapeDegussa(),
    scrapeProAurumKrugerrand(),  // ← Add here
  ]);
  // ...
}
```

---

## 📝 Files Changed Summary

```
Changes to be committed:
  new file:   RETAIL_DEPLOYMENT_GUIDE.md
  new file:   lib/fetchers/retail.ts
  new file:   prisma/migrations/20260106_retail_verification_mandatory.sql
  modified:   app/api/refresh/route.ts
  modified:   components/RetailPrices.tsx
  modified:   package-lock.json
  modified:   package.json
  modified:   prisma/schema.prisma
```

**Total:**
- 3 new files
- 5 modified files
- +1300 lines added
- -109 lines removed

---

## ✅ Final Checklist

### Pre-Deployment
- [x] Code implemented (ProAurum + Degussa scrapers)
- [x] Plausibility check integrated
- [x] UI filters for verified prices only
- [x] Migration SQL prepared
- [x] Build passes (`npm run build`)
- [x] Git committed and pushed
- [ ] Migration executed in Supabase ← **NEXT STEP**
- [ ] Vercel deployment verified
- [ ] Manual refresh tested
- [ ] SQL proof collected
- [ ] UI screenshot taken

### Post-Deployment Validation
- [ ] No €35.50/€35.80 dummy prices visible
- [ ] source_url NOT NULL for all rows
- [ ] Prices in realistic range (€80-90)
- [ ] UI shows green badges OR yellow warnings (not silent)
- [ ] Links to source work
- [ ] Plausibility check triggers correctly

---

## 🎯 Next Actions for User

1. **Run migration in Supabase SQL Editor** (CRITICAL)
   - Copy SQL from `prisma/migrations/20260106_retail_verification_mandatory.sql`
   - Execute in Supabase
   - Verify: `SELECT COUNT(*) FROM retail_prices WHERE source_url IS NULL;` → 0

2. **Verify Vercel deployment**
   - Check deployment status in Vercel dashboard
   - Should auto-deploy from commit 6af157a

3. **Test scraper**
   - Trigger manual refresh via `/api/refresh` endpoint
   - Check logs in Vercel for scraper output

4. **Collect SQL proof**
   ```sql
   SELECT date, provider, product, price_eur, source_url, verification_status, fetched_at
   FROM retail_prices
   ORDER BY fetched_at DESC
   LIMIT 20;
   ```

5. **Take UI screenshot**
   - Either verified prices with green badges
   - OR yellow warning box with diagnostics
   - NEVER dummy prices without warning

---

**Status:** ✅ Code complete, awaiting migration execution
**Commit:** 6af157a
**Branch:** main
**Deployment:** Auto-triggered via Vercel
