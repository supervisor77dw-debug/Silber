# Sofort-Fix für Deployment-Probleme

## Problem 1: Backfill → "Unauthorized: Falsches Token"

**Ursache**: CRON_SECRET ist nicht in Vercel konfiguriert oder falsch

**Lösung**:
1. Gehen Sie zu: https://vercel.com → Ihr Projekt → Settings → Environment Variables
2. Fügen Sie hinzu:
   ```
   Name: CRON_SECRET
   Value: <Ihr geheimer Token, z.B. generiert mit: openssl rand -base64 32>
   ```
3. Wichtig: "Production", "Preview" und "Development" alle ankreuzen
4. "Save" klicken
5. **Redeploy triggern**: Settings → Deployments → Latest → "..." → "Redeploy"

**Test nach Redeploy**:
```bash
# Ersetzen Sie YOUR_TOKEN mit dem CRON_SECRET aus Vercel
curl "https://silber-ten.vercel.app/api/admin/backfill?token=YOUR_TOKEN&from=2025-12-01&to=2025-12-31"
```

---

## Problem 2: Refresh → 405 Method Not Allowed

**Ursache**: Vercel hat alte Version deployed (ohne /api/refresh POST-Route)

**Prüfung**:
```bash
# Sollte 200 zurückgeben, nicht 405
curl -X POST https://silber-ten.vercel.app/api/refresh
```

**Wenn weiterhin 405**:

### Lösung A: Force Redeploy
1. Vercel Dashboard → Deployments
2. Neuester Deployment → "..." Menü → "Redeploy"
3. Warten 2-3 Minuten
4. Erneut testen

### Lösung B: Cache löschen
```bash
# Leeren Commit machen (force)
git commit --allow-empty -m "Force redeploy - clear Vercel cache"
git push
```

### Lösung C: Manuelle Migration in Supabase

Falls die Tabelle `metal_prices` fehlt:

1. Gehen Sie zu: https://supabase.com → Ihr Projekt → SQL Editor
2. Führen Sie aus:

```sql
-- Neue Tabelle für historische Preisdaten
CREATE TABLE IF NOT EXISTS "metal_prices" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "date" DATE NOT NULL,
    "xag_usd_close" DOUBLE PRECISION NOT NULL,
    "xag_usd_open" DOUBLE PRECISION,
    "xag_usd_high" DOUBLE PRECISION,
    "xag_usd_low" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'stooq',
    "source_url" TEXT,
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metal_prices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "metal_prices_date_key" ON "metal_prices"("date");
CREATE INDEX IF NOT EXISTS "metal_prices_date_idx" ON "metal_prices"("date");
```

3. Dann lokal:
```bash
npx prisma generate
```

---

## Debugging-Checkliste

### 1. Vercel Deployment Status
- [ ] Neuester Deployment ist "Ready" (nicht "Building" oder "Failed")
- [ ] Build Logs zeigen keine Fehler
- [ ] Routes sind listed: `/api/admin/backfill`, `/api/refresh`

### 2. Environment Variables in Vercel
- [ ] `DATABASE_URL` ist gesetzt (Transaction Pooler, Port 6543)
- [ ] `DIRECT_URL` ist gesetzt (Direct Connection, Port 5432)
- [ ] `CRON_SECRET` ist gesetzt
- [ ] `METALS_API_KEY` ist gesetzt
- [ ] Alle für "Production" aktiviert

### 3. Database Schema
- [ ] Tabelle `metal_prices` existiert in Supabase
- [ ] Alle anderen Tabellen existieren (`comex_stocks`, `sge_prices`, etc.)
- [ ] Prisma Client ist generiert (`npx prisma generate`)

### 4. Browser Cache
- [ ] Hard Reload: Strg + F5 (Windows) / Cmd + Shift + R (Mac)
- [ ] DevTools → Network Tab → "Disable cache" aktivieren
- [ ] Inkognito-Fenster testen

---

## Quick Test Suite

Nach Redeploy:

```bash
# 1. Health Check (zeigt DB-Status)
curl https://silber-ten.vercel.app/api/health-v2

# 2. Dashboard v2 (zeigt Daten-Status)
curl https://silber-ten.vercel.app/api/dashboard-v2

# 3. Refresh (POST!)
curl -X POST https://silber-ten.vercel.app/api/refresh -v

# 4. Backfill (mit Token)
curl "https://silber-ten.vercel.app/api/admin/backfill?token=YOUR_CRON_SECRET"

# 5. Status (zeigt Config)
curl https://silber-ten.vercel.app/api/status
```

---

## Erwartete Responses

### Health Check (sollte zeigen):
```json
{
  "status": "operational",
  "database": { "connected": true },
  "tables": {
    "metal_prices": { "exists": true, "count": 0 }
  }
}
```

### Refresh (sollte zeigen):
```json
{
  "success": true,
  "summary": { "successful": 4, ... },
  "attempts": [ ... ]
}
```

### Backfill mit falschem Token:
```json
{
  "error": "Unauthorized: Falsches Token"
}
```
→ Das ist OK! Bedeutet Route funktioniert.

### Backfill mit richtigem Token:
```json
{
  "success": true,
  "summary": {
    "inserted": 28,
    "updated": 3
  }
}
```

---

## Notfall-Lösung: Lokales Testing

Wenn Vercel Probleme macht:

```bash
# 1. Lokalen Dev Server starten
npm run dev

# 2. Im Browser öffnen
http://localhost:3000

# 3. Refresh-Button sollte funktionieren

# 4. Backfill lokal testen
curl "http://localhost:3000/api/admin/backfill?token=YOUR_LOCAL_CRON_SECRET&from=2025-12-01&to=2025-12-31"
```

Wenn lokal alles funktioniert, ist es ein Vercel-Deployment-Problem.

---

## Häufigste Ursachen

1. **Vercel cached alte Version**: Redeploy erzwingen
2. **ENV Variables fehlen**: In Vercel Settings prüfen
3. **Database Migration fehlt**: SQL in Supabase ausführen
4. **Browser cached alte Version**: Hard Reload (Strg+F5)
5. **Falscher CRON_SECRET**: In Vercel Settings nachsehen

---

**Nächster Schritt**: Bitte prüfen Sie zuerst die Vercel Environment Variables (CRON_SECRET) und triggern Sie ein Redeploy.
