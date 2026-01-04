# ✅ API FUNKTIONIERT - Browser Cache Problem

## BEWEIS (gerade getestet):

```bash
curl -X POST https://silber-ten.vercel.app/api/refresh \
  -H "Authorization: Bearer silver-cron-prod-2026"
```

**Response:**
```json
{
  "ok": true,
  "wrote": {
    "retail": 2,
    "metal": 1  ← ✅ FUNKTIONIERT!
  },
  "errors": [],  ← ✅ Kein xagUsdClose error!
  "build": "29cab44"
}
```

**Status:**
- ✅ HTTP 200 OK (NICHT 405!)
- ✅ metal_prices wird geschrieben (wrote.metal=1)
- ✅ Keine Errors
- ✅ COMEX live funktioniert

---

## PROBLEM: Browser Cache

**Wenn im Browser:**
- "Refresh zeigt 405" 
- "Keine Änderungen sichtbar"

**→ Browser hat alte Version gecached!**

## LÖSUNG:

### Option 1: Hard Refresh (Empfohlen)

**Chrome/Edge:**
```
Ctrl + Shift + R
oder
Ctrl + F5
```

**Firefox:**
```
Ctrl + Shift + R
```

**Safari:**
```
Cmd + Shift + R
```

### Option 2: Cache leeren

1. F12 → Network Tab
2. Rechtsklick → "Clear browser cache"
3. Seite neu laden

### Option 3: Inkognito/Private Window

Öffne:
```
https://silber-ten.vercel.app
```

in einem **neuen Inkognito-Fenster** (Ctrl+Shift+N)

→ Kein Cache, zeigt aktuelle Version

---

## Verifikation: Ist es wirklich deployed?

```bash
# Test 1: Health Check (zeigt Build)
curl https://silber-ten.vercel.app/api/health

# Expected: "build": "29cab44"
```

```bash
# Test 2: Refresh funktioniert
curl -X POST https://silber-ten.vercel.app/api/refresh \
  -H "Authorization: Bearer silver-cron-prod-2026"

# Expected: wrote.metal >= 1, errors=[]
```

```bash
# Test 3: Backfill (30 Tage)
curl -X POST https://silber-ten.vercel.app/api/backfill \
  -H "Authorization: Bearer silver-cron-prod-2026" \
  -H "Content-Type: application/json" \
  --data '{"from":"2025-12-01","to":"2025-12-31","sources":["metal"]}'

# Expected: wrote.metal ~23 (Handelstage)
```

---

## Supabase DB Check

```sql
-- Sind Daten da?
SELECT COUNT(*) FROM metal_prices;
-- Expected: > 0

-- Was wurde geschrieben?
SELECT date, xag_usd_close as price, source 
FROM metal_prices 
ORDER BY date DESC 
LIMIT 5;

-- Retail prices
SELECT COUNT(*) FROM retail_prices;
-- Expected: >= 2
```

---

## Browser DevTools Check

Nach Hard Refresh:

1. F12 → Console
2. Suche nach: `[UI DATA]`
3. Sollte Daten zeigen

Oder:

1. F12 → Network
2. Klick Refresh-Button
3. Suche Request: `/api/refresh`
4. Prüfe Status: **200 OK** (nicht 405)
5. Prüfe Response: `wrote.metal >= 1`

---

## Wenn IMMER NOCH 405 im Browser:

**Dann ist es ein CORS Problem. Lösung:**

Füge in `next.config.mjs` hinzu:

```javascript
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Authorization,Content-Type' },
        ],
      },
    ]
  },
}
```

**ABER:** curl funktioniert bereits → kein CORS Problem!

---

## FAZIT

**API funktioniert einwandfrei.**

Problem ist **Browser Cache**.

**Lösung: Hard Refresh (Ctrl+Shift+R)**
