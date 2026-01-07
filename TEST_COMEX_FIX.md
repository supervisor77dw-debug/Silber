# TRIGGER REFRESH TO TEST COMEX FIX

Nach dem Deployment (60s warten), dann:

## Option 1: Via Dashboard
1. Öffne https://silber-ten.vercel.app
2. Klicke "Aktualisieren" Button
3. Warte 30-60s (COMEX Download + Parse dauert)
4. Prüfe Logs in Vercel Dashboard

## Option 2: Via curl (wenn Token vorhanden)
```bash
curl -X POST https://silber-ten.vercel.app/api/refresh \
  -H "Authorization: Bearer YOUR_REFRESH_TOKEN" \
  -v
```

## Option 3: Check Vercel Logs
1. Öffne https://vercel.com/supervisor77dw-debugs-projects/silber/logs
2. Suche nach:
   - "✓ Downloaded COMEX XLS" → SUCCESS
   - "✗ COMEX XLS download failed" → FAILED (zeigt status/URL)
   - "✓ Parsed COMEX stocks" → PARSING SUCCESS
   - "[Refresh] COMEX skip" → ERROR

## Expected Success Logs:
```
[API /refresh] POST_START
✓ Downloaded COMEX XLS (12345 bytes)
✓ Parsed COMEX stocks: Registered=50,123,456 oz, Eligible=200,456,789 oz
[DB WRITE] comex_stocks: 2026-01-07
[SPREAD_CALC_OK] spreadDate: 2026-01-07
[API /refresh] POST_COMPLETE: updated=['comex','fx','sge','comex_price','spread']
```

## Verify in Supabase:
```sql
-- Should now have data
SELECT count(*) as rows, max(date) as latest FROM comex_stocks;

-- Should show 2026-01-07 with REAL stock values
SELECT 
  date,
  "totalRegistered" as registered,
  "totalEligible" as eligible,
  "dataQuality"
FROM daily_spreads
WHERE date >= '2026-01-02'
ORDER BY date DESC;
```

## If Still FAILING:
Check error message in logs:
- 404 = COMEX URL changed (update DATA_SOURCES.COMEX_XLS)
- 403 = CME blocking automated downloads (need User-Agent fix)
- Timeout = increase axios timeout
- Parse error = XLS format changed (update parser)
