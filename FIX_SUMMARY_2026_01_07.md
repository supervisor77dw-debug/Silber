# FIX SUMMARY - Dashboard & Retail Issues
**Date**: 2026-01-07  
**Deployment**: CQZhMaBrf (Production)  
**Commits**: d9e7350, 09488e8

## ✅ PROBLEM 1: Dashboard zeigt veraltetes Datum (2026-01-02 statt 2026-01-07)

### Root Cause
- **Symptom**: Dashboard UI zeigt "Daten vom 2026-01-02" obwohl DB Rohdaten bis 2026-01-07 hat
- **Root Cause**: `/api/refresh` berechnete daily_spreads NUR wenn ALLE Quellen Daten für TODAY hatten
- **Diagnose**: 
  ```sql
  -- DB hatte:
  metal_prices: latest_date = 2026-01-07 ✓
  sge_prices: latest_date = 2026-01-07 ✓
  fx_rates: latest_date = 2026-01-07 ✓
  daily_spreads: latest_date = 2026-01-02 ✗ (PROBLEM!)
  ```
- **Fehlerhafte Logik**:
  ```typescript
  // ALT (fehlerhaft):
  const latestComexPrice = await prisma.comexPrice.findFirst({
    where: { marketDate: today },  // ❌ Nur heute!
    orderBy: { marketDate: 'desc' }
  });
  // Wenn eine API heute failed → kein Spread berechnet
  ```

### Solution
**File**: `app/api/refresh/route.ts`

**Change**:
```typescript
// NEU (robust):
const latestComexPrice = await prisma.comexPrice.findFirst({
  orderBy: { marketDate: 'desc' }  // ✅ Neueste Daten egal welches Datum
});

// Verwende das NEUESTE Datum von allen 3 Quellen
const spreadDate = new Date(Math.max(
  latestComexPrice.marketDate.getTime(),
  latestSgePrice.date.getTime(),
  latestComexStock.date.getTime()
));
```

**Impact**:
- ✅ Spreads werden jetzt IMMER berechnet wenn DB-Daten vorhanden sind
- ✅ Dashboard zeigt neueste verfügbare Daten (nicht mehr hardcoded)
- ✅ Resilient gegen API-Ausfälle (DB-First-Architektur)

### Immediate Action Required
**Führen Sie in Supabase aus**: `CALCULATE_MISSING_SPREADS.sql`

Dieses Script:
1. Findet alle Dates mit vollständigen Rohdaten aber fehlendem Spread
2. Berechnet fehlende daily_spreads für 2026-01-03 bis 2026-01-07
3. Dashboard zeigt dann automatisch aktuelles Datum

```sql
-- Script erstellt Spreads für alle Tage wo Rohdaten vorhanden
INSERT INTO daily_spreads (...)
SELECT ...
FROM metal_prices mp
JOIN sge_prices sp ON mp.date = sp.date
JOIN fx_rates fx ON mp.date = fx.date
JOIN comex_stocks cs ON mp.date = cs.date
WHERE NOT EXISTS (SELECT 1 FROM daily_spreads ds WHERE ds.date = mp.date)
```

---

## ✅ PROBLEM 2: Retail Scraper nutzt kaputte URLs (404 Fehler)

### Root Cause
- **Symptom**: `verification_status='FAILED'`, `price_eur=0`
- **Root Cause**: Hardcoded URLs in scrapeDegussa/scrapeProAurum
  ```typescript
  // ALT (fragil):
  const url = 'https://www.degussa-goldhandel.de/silbermuenzen/maple-leaf-1-oz.html';
  // Wenn URL sich ändert → 404 → FAILED
  ```
- **Problem**: Keine Fallback-Mechanismen, keine Debug-Info

### Solution - Provider Config System

**New Files**:
1. `lib/retail-provider-config.ts` - Zentrale Konfiguration
2. `lib/retail-discovery.ts` - Robuste URL-Discovery
3. `lib/fetchers/retail.ts` - Refactored mit Discovery

**Architecture**:
```
Provider Config (retail-provider-config.ts)
  ↓
  baseUrl + products + discovery strategies
  ↓
Discovery Service (retail-discovery.ts)
  ↓
  Strategy 1: Direct URL (try hardcoded first)
  ↓ (if 404)
  Strategy 2: Site Search (use provider's search)
  ↓ (if fail)
  Strategy 3: Category Browse (match by keywords)
  ↓
Validate URL (HTTP HEAD + keyword check)
  ↓
Extract Price (multiple selectors + JSON-LD)
  ↓
Plausibility Check (spot * 0.95 < retail < spot * 20)
```

**Example Provider Config**:
```typescript
{
  name: 'degussa',
  baseUrl: 'https://www.degussa-goldhandel.de',
  products: [{
    product: '1oz Maple Leaf',
    directUrl: '/silbermuenzen/maple-leaf-1-oz',
    discoveryStrategy: ['direct-url', 'site-search', 'category-browse'],
    searchPath: '/search?q=maple+leaf+1+oz',
    categoryPath: '/silbermuenzen',
    matcher: {
      keywords: ['maple leaf', '1 oz', 'silber'],
      fineOz: 1.0
    }
  }],
  selectors: {
    price: [
      'meta[property="product:price:amount"]',
      '[itemprop="price"]',
      '.product-price-value',
      // ... + 5 more fallbacks
    ]
  }
}
```

**Benefits**:
- ✅ **Resilient**: 3 Fallback-Strategien falls URL ändert
- ✅ **Debugging**: Speichert `discoveryStrategy` + `attemptedUrls`
- ✅ **Extensible**: Neuer Provider = Config hinzufügen, kein Code
- ✅ **Graceful Degradation**: Dashboard crasht nicht bei Retail-Failures

**Error Handling**:
```typescript
// Jedes Result hat:
{
  verificationStatus: 'VERIFIED' | 'INVALID_PARSE' | 'FAILED',
  errorMessage: "HTTP 404: Not Found",
  discoveryStrategy: "direct-url",
  attemptedUrls: [
    "https://www.degussa-goldhandel.de/silbermuenzen/maple-leaf-1-oz",
    "https://www.degussa-goldhandel.de/search?q=maple+leaf+1+oz"
  ],
  sourceUrl: "https://www.degussa-goldhandel.de/silbermuenzen/maple-leaf",
  rawExcerpt: "<meta property=...>" // For debugging
}
```

---

## 📋 ACCEPTANCE CRITERIA - VERIFICATION

### Problem 1 (Dashboard Date)
- [ ] Execute `CALCULATE_MISSING_SPREADS.sql` in Supabase
- [ ] Verify: `SELECT max(date) FROM daily_spreads` returns `2026-01-07`
- [ ] Open Dashboard: "Daten vom" shows `2026-01-07` (not `2026-01-02`)
- [ ] Charts show data points from last 7 days (not just one point)
- [ ] `/api/healthz` shows `sources.metal.latest_date = "2026-01-07"`

### Problem 2 (Retail Scraper)
- [ ] Trigger `/api/refresh` (Aktualisieren button)
- [ ] Check `/api/debug/snapshot` → `lastWrites.retail_prices`
- [ ] Verify at least 1 provider has `verificationStatus: "VERIFIED"`
- [ ] If FAILED: Check `errorMessage` + `attemptedUrls` for diagnosis
- [ ] RetailPrices component shows prices OR clear error message

---

## 🔧 NEXT STEPS

1. **IMMEDIATE** (User Action):
   ```sql
   -- Run in Supabase:
   \i CALCULATE_MISSING_SPREADS.sql
   ```

2. **VALIDATE**:
   - Dashboard zeigt 2026-01-07 ✓
   - Charts haben multiple data points ✓
   - Retail Prices zeigen verified data OR clear error ✓

3. **OPTIONAL IMPROVEMENTS**:
   - [ ] Add Vercel Cron für hourly auto-refresh
   - [ ] Fix provider URLs if discovery still fails (update config)
   - [ ] Add more retail providers to config
   - [ ] Monitor `attempted_urls` in logs to optimize discovery

---

## 📊 FILES CHANGED

### Commit d9e7350 (Spread Calculation Fix)
- `app/api/refresh/route.ts` - Changed spread calc to use latest data
- `CALCULATE_MISSING_SPREADS.sql` - Manual backfill script

### Commit 09488e8 (Retail Discovery System)
- `lib/retail-provider-config.ts` - **NEW**: Provider configs
- `lib/retail-discovery.ts` - **NEW**: URL discovery + price extraction
- `lib/fetchers/retail.ts` - Refactored to use discovery system

---

## 🐛 DEBUGGING GUIDE

### If Dashboard still shows old date:
1. Check: `SELECT max(date) FROM daily_spreads` in Supabase
2. If NULL: Run `CALCULATE_MISSING_SPREADS.sql`
3. Check browser console: Look for `[Dashboard] healthz loaded:`
4. Hard refresh: Ctrl+Shift+R (kills browser cache)

### If Retail still FAILED:
1. Check `/api/debug/snapshot` → look at `lastWrites.retail_prices`
2. See `attemptedUrls`: Which URLs were tried?
3. See `discoveryStrategy`: Which strategy was used?
4. See `errorMessage`: What went wrong?
5. Manual test: Open `attemptedUrls[0]` in browser
6. Fix: Update `lib/retail-provider-config.ts` with correct URLs

---

## 📝 TECHNICAL NOTES

- **DB-First Architecture**: Always read from DB, not live APIs directly
- **Forensic Logging**: All endpoints log DB connection + query metrics
- **No Hardcoded Dates**: UI reads `healthz.sources.*.latest_date`
- **Graceful Degradation**: retail failures don't break dashboard
- **Audit Trail**: Every scrape logs source_url + raw_excerpt + verification_status

---

**Deployment Status**: ⏳ Building (wait 60s then test)  
**Manual Action**: ⚠️ Run CALCULATE_MISSING_SPREADS.sql in Supabase  
**Auto Recovery**: ✅ Future refreshes will auto-calculate spreads
