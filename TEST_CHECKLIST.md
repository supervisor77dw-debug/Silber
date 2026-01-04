# Test Checklist - retail_prices Fix

**Build**: ded7951  
**Deployed**: Pending Vercel  

## 1. /api/health Test

```bash
curl https://silber-ten.vercel.app/api/health
```

**Expected Response**:
```json
{
  "build": "ded7951",
  "timestamp": "2026-01-04T...",
  "env": {
    "hasCronSecret": true,
    "nodeEnv": "production",
    "vercelEnv": "production"
  },
  "db": {
    "canConnect": true,
    "error": null
  },
  "counts": {
    "metal_prices": 123,
    "retail_prices": 0  // vor Refresh
  },
  "lastRetail": null  // vor Refresh
}
```

## 2. /api/refresh Test (Bearer Auth)

```bash
curl -X POST https://silber-ten.vercel.app/api/refresh \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Expected Console Logs** (Vercel Logs):
```
[REFRESH_START] 2026-01-04T...
[AUTH_OK]
[FETCH_RETAIL_START]
[FETCH_RETAIL_OK] 2 items
[DB_WRITE_OK] retail: 2
[REFRESH_DONE] { updated: [...], skipped: [...], wrote: { retail: 2, metal: 0 } }
```

**Expected Response**:
```json
{
  "ok": true,
  "date": "2026-01-04",
  "updated": ["comex", "fx", "sge", "retail", "spread"],
  "skipped": [],
  "errors": [],
  "sourceStatus": {
    "comex": "live",
    "fx": "live",
    "sge": "live",
    "retail": "live"
  },
  "wrote": {
    "retail": 2,
    "metal": 0
  },
  "build": "ded7951"
}
```

## 3. /api/health Test (Nach Refresh)

```bash
curl https://silber-ten.vercel.app/api/health
```

**Expected**:
```json
{
  "counts": {
    "metal_prices": 123,
    "retail_prices": 2  // ✅ > 0
  },
  "lastRetail": {
    "date": "2026-01-04",
    "provider": "ProAurum",
    "product": "1oz Philharmoniker",
    "priceEur": 35.8,
    "fetchedAt": "2026-01-04T..."
  }
}
```

## 4. Auth Test (Fehlschlag)

```bash
curl -X POST https://silber-ten.vercel.app/api/refresh
# (ohne Authorization Header)
```

**Expected**:
```json
{
  "ok": false,
  "error": "UNAUTHORIZED"
}
```

**Status**: 401

## 5. Dashboard UI Test

1. Öffne https://silber-ten.vercel.app
2. Klick "Aktualisieren" Button
3. **Expected**:
   - Toast notification: "Alle Datenquellen erfolgreich aktualisiert"
   - Dashboard lädt neu
   - Keine 401 Errors in Console

## Success Criteria (Messbar)

✅ `/api/health` zeigt `build: "ded7951"` (= deployed SHA)  
✅ `/api/health` zeigt `counts.retail_prices > 0` nach Refresh  
✅ `/api/health` zeigt `lastRetail` mit Degussa/ProAurum Daten  
✅ `/api/refresh` schreibt `wrote.retail: 2`  
✅ Console Logs zeigen `[DB_WRITE_OK] retail: 2`  
✅ Auth ohne Token gibt 401 zurück  

## Failure Cases

❌ `retail_prices = 0` nach Refresh → Check Console Logs für `[RETAIL_ERROR]`  
❌ `401 Unauthorized` im UI → `NEXT_PUBLIC_CRON_SECRET` fehlt in Vercel Env Vars  
❌ `build: "unknown"` → Git SHA nicht verfügbar (Vercel sollte `VERCEL_GIT_COMMIT_SHA` setzen)  

## Vercel Environment Variables

**Required**:
- `CRON_SECRET` (Server-side für Auth Check)
- `NEXT_PUBLIC_CRON_SECRET` (Client-side für Dashboard Fetch)

**Beide müssen identisch sein!**

```bash
# Vercel Dashboard → Settings → Environment Variables
CRON_SECRET = <dein-secret>
NEXT_PUBLIC_CRON_SECRET = <dein-secret>
```

**Nach Hinzufügen**: Redeploy triggern!
