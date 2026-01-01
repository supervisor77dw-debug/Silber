# Schnellstart-Anleitung

## Erste Schritte (< 5 Minuten)

Die App ist bereits **einsatzbereit mit SQLite** für lokale Entwicklung!

### 1. Dependencies installieren (falls noch nicht geschehen)

```bash
npm install
```

### 2. Datenbank einrichten

```bash
npm run db:push
```

### 3. Testdaten einfügen

```bash
npm run db:seed
```

### 4. Entwicklungsserver starten

```bash
npm run dev
```

Öffnen Sie [http://localhost:3000](http://localhost:3000).

**Das war's! 🎉** Die App läuft jetzt mit Testdaten.

---

## Nächste Schritte

### Daten erkunden

Öffnen Sie Prisma Studio, um die Datenbank zu inspizieren:
```bash
npm run db:studio
```

### Echte Daten abrufen

**Einmalig (1 Tag):**
```bash
npm run cron:fetch
```

**Backfill (mehrere Tage):**
```bash
# Letzte 7 Tage (Standard)
npm run cron:backfill

# Letzte 30 Tage
npm run cron:backfill -- --days 30
```

**Manuelle Preise setzen (wenn APIs fehlen):**
```bash
# In .env:
COMEX_MANUAL_SPOT_USD_OZ="31.25"
SGE_MANUAL_PRICE_CNY_G="7.45"
```

---

## Für Produktions-Setup

### PostgreSQL verwenden (empfohlen für Produktion)

Erstellen Sie zuerst eine PostgreSQL-Datenbank:

**Option A: Supabase (kostenlos, empfohlen)**
1. Gehen Sie zu [supabase.com](https://supabase.com)
2. Erstellen Sie ein neues Projekt
3. Kopieren Sie die Connection String aus Settings → Database → Connection String (URI)

**Option B: Lokal (Docker)**
```bash
docker run --name postgres-silber -e POSTGRES_PASSWORD=mypassword -p 5432:5432 -d postgres
```

Dann bearbeiten Sie `.env` und `prisma/schema.prisma`:

**In `.env`:**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/silber_analyse"
```

**In `prisma/schema.prisma`:**
```prisma
datasource db {
  provider = "postgresql"  // Ändern Sie von "sqlite" zu "postgresql"
  url      = env("DATABASE_URL")
}
```

Dann:
```bash
npm run db:push
npm run db:seed
```

---

## Wichtige Hinweise

### COMEX XLS Parser (✓ FERTIG)

Der **robuste Parser** in [lib/fetchers/comex.ts](lib/fetchers/comex.ts) ist **produktionsbereit** mit:
- ✓ Automatische Sheet-Erkennung
- ✓ Flexible Header-Erkennung (nicht hardcoded)
- ✓ Validierung (1M-1B oz Bereich)
- ✓ Warehouse-Detail-Extraktion
- ✓ Fehlerbehandlung mit Error-Codes

**Test:**
```bash
npm run cron:fetch
```

Die XLS-Datei wird automatisch nach `raw-data/comex/` heruntergeladen.

### SGE Price (✓ FERTIG mit 3 Fallbacks)

Der Fetcher in [lib/fetchers/sge.ts](lib/fetchers/sge.ts) verwendet:
1. **Manual Override**: `SGE_MANUAL_PRICE_CNY_G` in .env
2. **Kitco Scraping**: Automatisches Web-Scraping (fallback)
3. **Metals-API**: Mit API-Key (optional)

**Empfehlung**: Setzen Sie `SGE_MANUAL_PRICE_CNY_G` für garantierte Daten.

### COMEX Spot Price (✓ FERTIG mit 4 Fallbacks)

Der Fetcher in [lib/fetchers/comex-price.ts](lib/fetchers/comex-price.ts) nutzt:
1. **Manual Override**: `COMEX_MANUAL_SPOT_USD_OZ` in .env
2. **Metals-API**: `METALS_API_KEY` (free tier: 50 req/month)
3. **Metals.dev**: Kostenlos, keine Auth
4. **Yahoo Finance**: SI=F (Silver Futures)

**Empfehlung**: Für zuverlässige Daten Manual Override oder Metals-API nutzen.

### Testdaten einfügen

Für Tests ohne echte API-Calls können Sie Dummy-Daten manuell einfügen:

```sql
-- FX Rate
INSERT INTO fx_rates (id, date, "usdCnyRate", source, "fetchedAt")
VALUES ('test1', '2026-01-01', 7.25, 'manual', NOW());

-- COMEX Price
INSERT INTO comex_prices (id, date, "priceUsdPerOz", contract, "fetchedAt")
VALUES ('test2', '2026-01-01', 32.50, 'Spot', NOW());

-- SGE Price
INSERT INTO sge_prices (id, date, "priceCnyPerGram", "priceUsdPerOz", "fetchedAt")
VALUES ('test3', '2026-01-01', 7.50, 32.80, NOW());

-- COMEX Stock
INSERT INTO comex_stocks (id, date, "totalRegistered", "totalEligible", "totalCombined", "registeredPercent", "isValidated")
VALUES ('test4', '2026-01-01', 50000000, 150000000, 200000000, 25.0, true);

-- Daily Spread
INSERT INTO daily_spreads (id, date, "sgeUsdPerOz", "comexUsdPerOz", "spreadUsdPerOz", "spreadPercent", registered, eligible, total, "registeredPercent")
VALUES ('test5', '2026-01-01', 32.80, 32.50, 0.30, 0.92, 50000000, 150000000, 200000000, 25.0);
```

## Deployment auf Vercel

1. **Repository auf GitHub pushen**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Vercel-Projekt erstellen**
   - Gehen Sie zu [vercel.com](https://vercel.com)
   - Importieren Sie Ihr GitHub Repository
   - Fügen Sie Umgebungsvariablen hinzu (DATABASE_URL, etc.)

3. **Datenbank vorbereiten**
   ```bash
   npx prisma db push
   ```

4. **Deploy**
   - Vercel deployed automatisch bei jedem Push
   - Cron Job wird automatisch aktiviert (siehe `vercel.json`)

## Nächste Schritte

1. **Parser testen**: Führen Sie `npm run cron:fetch` aus und prüfen Sie die Logs
2. **Daten validieren**: Öffnen Sie Prisma Studio (`npm run db:studio`) und prüfen Sie die Tabellen
3. **UI anpassen**: Passen Sie Farben, Texte, Charts nach Ihren Wünschen an
4. **Alerts implementieren**: Phase 2 - siehe README für Hinweise

## Hilfe & Troubleshooting

### Datenbankfehler
```bash
# Prisma Client neu generieren
npm run db:generate

# Schema synchronisieren
npm run db:push

# Migrations zurücksetzen (Vorsicht: löscht Daten!)
npx prisma migrate reset
```

### Build-Fehler
```bash
# Cache leeren
rm -rf .next
npm run dev
```

### Port bereits belegt
```bash
# Anderer Port verwenden
PORT=3001 npm run dev
```

Viel Erfolg! 🚀
