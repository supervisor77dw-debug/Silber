# Lokaler Test der neuen Features

## 1. Development Server starten

```bash
npm run dev
```

Öffnen Sie: http://localhost:3000

## 2. Refresh Button testen

- Klicken Sie auf "Aktualisieren" (rechts oben)
- Erwartung: Toast-Benachrichtigung erscheint
- Check: Network Tab → POST /api/refresh

## 3. Backfill testen (lokal)

**Wichtig**: Benötigt CRON_SECRET in .env

```bash
# .env Datei prüfen
cat .env | Select-String CRON_SECRET

# Backfill aufrufen
curl "http://localhost:3000/api/admin/backfill?token=YOUR_CRON_SECRET&from=2025-12-01&to=2025-12-31"
```

## 4. Vercel Deployment Status prüfen

https://vercel.com/YOUR-TEAM/silber-ten/deployments

Suchen Sie nach dem neuesten Deployment (sollte "Building" oder "Ready" sein)

## 5. Nach Deployment: Produktions-Test

```bash
# Health Check (sollte neue Tabelle metal_prices zeigen)
curl https://silber-ten.vercel.app/api/health-v2

# Refresh Test
curl -X POST https://silber-ten.vercel.app/api/refresh

# Backfill Test (mit CRON_SECRET)
curl "https://silber-ten.vercel.app/api/admin/backfill?token=YOUR_CRON_SECRET&from=2025-12-01&to=2025-12-31"
```

## Troubleshooting

### Weiterhin 404/405?

1. **Vercel Deployment Status**:
   - Gehen Sie zu Vercel Dashboard
   - Prüfen Sie ob Deployment "Ready" ist
   - Checken Sie Build Logs auf Fehler

2. **Cache leeren**:
   - Browser: Strg+F5 (Hard Reload)
   - Vercel: Settings → "Clear Cache"

3. **Environment Variables**:
   - Vercel Dashboard → Settings → Environment Variables
   - Prüfen Sie ob DATABASE_URL und CRON_SECRET gesetzt sind

### Database Migration fehlt?

Die neue Tabelle `metal_prices` muss in Supabase existieren:

```sql
-- Supabase SQL Editor
CREATE TABLE IF NOT EXISTS metal_prices (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date DATE UNIQUE NOT NULL,
  xag_usd_close FLOAT NOT NULL,
  xag_usd_open FLOAT,
  xag_usd_high FLOAT,
  xag_usd_low FLOAT,
  volume FLOAT,
  source TEXT DEFAULT 'stooq',
  source_url TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metal_prices_date ON metal_prices(date);
```

Dann:
```bash
npx prisma generate
```

## Erwartete Timeline

- **Jetzt**: Deployment wurde getriggert
- **+2 Min**: Build läuft
- **+3 Min**: Deployment "Ready"
- **+4 Min**: Neue Routen verfügbar

Aktueller Stand: 
- Commit: 19e09e9 "Trigger Vercel deployment for new routes"
- Pushed: ✅
- Deployment Status: Prüfen Sie Vercel Dashboard
