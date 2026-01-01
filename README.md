# Silver Market Analysis - COMEX vs SGE Spread Tracker

Eine Next.js Web-Applikation zur täglichen Verfolgung der physischen Silberverfügbarkeit und Preis-Spreads zwischen COMEX (CME) und Shanghai Gold Exchange (SGE).

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Prisma](https://img.shields.io/badge/Prisma-5-2D3748)

## 📋 Übersicht

Diese Anwendung:
- Lädt täglich automatisch COMEX Warehouse Stocks (Registered/Eligible)
- Holt SGE Shanghai Silver Benchmark Preise
- Berechnet USD/CNY FX-Raten für genaue Umrechnung
- Visualisiert Preis-Spreads und physische Verfügbarkeit
- Erkennt Extremwerte und Regime-Wechsel
- Bietet CSV-Export für weitere Analysen

## 🚀 Features

### MVP Features (Implementiert)
- ✅ Täglicher automatischer Datenabruf
- ✅ COMEX Warehouse Stocks Tracking (Registered/Eligible/Total)
- ✅ SGE Price Integration (Vorbereitet)
- ✅ FX Rate Fetching (USD/CNY)
- ✅ Spread-Berechnung und -Visualisierung
- ✅ Interaktive Charts (Recharts)
- ✅ Dashboard mit Key Metrics
- ✅ CSV/Excel Export
- ✅ Data Quality Monitoring
- ✅ Anomalie-Erkennung (Z-Score)
- ✅ Warehouse-Details pro Depository

### Geplante Features (Phase 2)
- ⏳ COMEX Delivery Notices Integration
- ⏳ Alert System (E-Mail/Telegram)
- ⏳ Historische Trend-Analysen
- ⏳ Mobile App (PWA)

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL (via Prisma ORM)
- **Data Fetching**: Axios, SheetJS (XLSX parsing)
- **Scheduling**: Vercel Cron / GitHub Actions
- **Deployment**: Vercel (empfohlen)

## 📦 Installation

### Voraussetzungen

- Node.js 20+ und npm
- PostgreSQL-Datenbank (lokal oder Cloud wie Supabase, Neon, Railway)
- Git

### Lokale Einrichtung

1. **Repository klonen**
   ```bash
   git clone <your-repo-url>
   cd Silber_Analyse
   ```

2. **Dependencies installieren**
   ```bash
   npm install
   ```

3. **Umgebungsvariablen konfigurieren**
   ```bash
   cp .env.example .env
   ```
   
   Bearbeiten Sie `.env` und fügen Sie Ihre Werte ein:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/silber_analyse"
   COMEX_XLS_URL="https://www.cmegroup.com/delivery_reports/Silver_stocks.xls"
   FX_API_URL="https://api.exchangerate.host/latest"
   # Optional: API Keys für Preisdaten
   ```

4. **Datenbank einrichten**
   ```bash
   # Prisma Client generieren
   npm run db:generate
   
   # Datenbank-Schema pushen
   npm run db:push
   
   # Oder mit Migrationen
   npm run db:migrate
   ```

5. **Entwicklungsserver starten**
   ```bash
   npm run dev
   ```
   
   Öffnen Sie [http://localhost:3000](http://localhost:3000) im Browser.

## 📊 Datenquellen

### 1. COMEX Silver Stocks
- **Quelle**: [CME Group](https://www.cmegroup.com/delivery_reports/Silver_stocks.xls)
- **Format**: XLS
- **Inhalt**: Daily Warehouse Stocks (Registered, Eligible, per Depository)
- **Frequenz**: Täglich (Werktage)

### 2. SGE Shanghai Silver Benchmark
- **Quelle**: [Shanghai Gold Exchange](https://www.sge.com.cn)
- **Format**: API oder Web Scraping (zu implementieren)
- **Inhalt**: Daily Silver Benchmark Price (CNY/g)
- **Frequenz**: Täglich

### 3. FX Rates (USD/CNY)
- **Primär**: [ExchangeRate API](https://exchangerate.host)
- **Fallback**: [European Central Bank](https://www.ecb.europa.eu)
- **Frequenz**: Täglich

### 4. COMEX Spot Price (Optional)
- Zu implementieren via API (Alpha Vantage, Metals API, etc.)
- Alternativ: Manuelle Eingabe oder Kitco Scraping

## 🔄 Automatisierung

### Vercel Cron (Empfohlen für Vercel Deployment)

Die App ist für Vercel Cron vorkonfiguriert ([vercel.json](vercel.json)):
```json
{
  "crons": [{
    "path": "/api/cron/fetch-data",
    "schedule": "0 9 * * *"
  }]
}
```

Läuft täglich um 9:00 Uhr (Europe/Berlin).

### GitHub Actions (Alternative)

Workflow-Datei: [.github/workflows/daily-fetch.yml](.github/workflows/daily-fetch.yml)

Aktivierung:
1. Repository Secrets konfigurieren (`DATABASE_URL`, etc.)
2. Workflow wird täglich um 8:00 UTC ausgeführt
3. Manuelle Ausführung möglich via "Actions" Tab

### Manueller Aufruf

Lokal oder auf einem Server:
```bash
npm run cron:fetch
```

Oder via API:
```bash
curl -X POST http://localhost:3000/api/cron/fetch-data \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## 📖 API Endpoints

### `GET /api/dashboard`
Aktuelle Dashboard-Daten inkl. Latest Spread, Stocks, Trends.

### `GET /api/spreads?days=30`
Historische Spread-Daten für Charts.
- **Query**: `days` (7, 30, 90, 365), `startDate`, `endDate`

### `POST /api/cron/fetch-data`
Triggert manuellen Datenabruf.
- **Auth**: Optional `Authorization: Bearer <CRON_SECRET>`

### `GET /api/export?days=90`
Exportiert Daten als CSV.
- **Query**: `days` (Standard: 90)

## 🗄️ Datenbank-Schema

Siehe [prisma/schema.prisma](prisma/schema.prisma).

**Wichtige Tabellen:**
- `comex_stocks`: Tägliche COMEX Lagerbestände
- `comex_warehouses`: Warehouse-Details (Brinks, Loomis, etc.)
- `sge_prices`: SGE Benchmark-Preise
- `fx_rates`: USD/CNY Wechselkurse
- `daily_spreads`: Berechnete Spreads mit Anomalie-Flags
- `fetch_logs`: Monitoring für Datenabruf-Status

## 🎨 UI/UX

### Dashboard
- **Metric Cards**: Registered, Eligible, Total, Spread, Prices
- **Charts**:
  - COMEX Warehouse Stocks (Line Chart)
  - Price Comparison SGE vs COMEX (Line Chart)
  - Spread Visualisierung (Bar + Line Chart)
- **Warehouse Table**: Detaillierte Aufschlüsselung nach Depository
- **Data Quality Indicator**: Status des letzten Fetch
- **Export Button**: CSV-Download

### Zeitraumfilter
- 7 Tage, 30 Tage, 90 Tage, 365 Tage
- Custom Range (zukünftig)

## 🚀 Deployment

### Vercel (Empfohlen)

1. **Vercel-Projekt erstellen**
   ```bash
   npm i -g vercel
   vercel
   ```

2. **Umgebungsvariablen setzen**
   - `DATABASE_URL`
   - `COMEX_XLS_URL`
   - `FX_API_URL`
   - Optional: `CRON_SECRET`

3. **Datenbank vorbereiten**
   ```bash
   npx prisma db push
   ```

4. **Deploy**
   ```bash
   vercel --prod
   ```

5. **Cron aktivieren**
   Vercel erkennt automatisch `vercel.json` und aktiviert Cron Jobs.

### Alternative Deployment-Optionen

- **Docker**: Dockerfile kann erstellt werden
- **Railway**: PostgreSQL + Next.js Hosting
- **Fly.io**: Global deployment
- **Self-hosted**: VPS mit PM2 oder Systemd

## 🔧 Konfiguration

### Schwellenwerte für Alerts

In `.env`:
```env
ALERT_SPREAD_THRESHOLD="2.0"          # USD/oz
ALERT_REGISTERED_THRESHOLD="50000000" # oz
ALERT_WITHDRAWAL_THRESHOLD="5000000"  # oz
```

Implementierung in Phase 2 geplant.

### Timezone

```env
TZ="Europe/Berlin"
```

## 🧪 Development

### Prisma Studio
Datenbank-GUI für lokale Entwicklung:
```bash
npm run db:studio
```

### Manueller Test-Fetch
```bash
npm run cron:fetch
```

### Code-Struktur
```
Silber_Analyse/
├── app/
│   ├── api/              # Next.js API Routes
│   ├── globals.css       # Global Styles
│   ├── layout.tsx        # Root Layout
│   └── page.tsx          # Dashboard Page
├── components/           # React Components
│   ├── Dashboard.tsx
│   ├── MetricCard.tsx
│   ├── StockChart.tsx
│   ├── PriceChart.tsx
│   ├── SpreadChart.tsx
│   └── DataQuality.tsx
├── lib/
│   ├── db.ts             # Prisma Client
│   ├── constants.ts      # App Constants
│   ├── validators.ts     # Zod Schemas
│   ├── calculations.ts   # Spread/Trend Calculations
│   └── fetchers/         # Data Fetchers
│       ├── comex.ts
│       ├── sge.ts
│       ├── fx.ts
│       └── comex-price.ts
├── prisma/
│   └── schema.prisma     # Database Schema
├── scripts/
│   └── fetch-data.ts     # Standalone Fetch Script
├── .github/
│   └── workflows/
│       └── daily-fetch.yml # GitHub Actions Cron
├── vercel.json           # Vercel Cron Config
└── package.json
```

## 📝 Wichtige Hinweise

### COMEX XLS Parsing
Die CME-Datei hat ein spezifisches Format. Der aktuelle Parser ist **vereinfacht** und muss je nach tatsächlicher Dateistruktur angepasst werden.

**TODO**: Überprüfen und anpassen des Parsers in [lib/fetchers/comex.ts](lib/fetchers/comex.ts).

### SGE Price Integration
Die SGE-API ist **nicht öffentlich dokumentiert**. Optionen:
1. Web Scraping (Puppeteer/Cheerio)
2. Manuelle Eingabe über Admin-Panel (zu implementieren)
3. Alternative Quelle (Kitco, BullionVault)

**TODO**: SGE-Fetcher implementieren in [lib/fetchers/sge.ts](lib/fetchers/sge.ts).

### COMEX Spot Price
**TODO**: API-Integration in [lib/fetchers/comex-price.ts](lib/fetchers/comex-price.ts).

Empfohlene APIs:
- [Alpha Vantage](https://www.alphavantage.co/) (kostenlos mit Limits)
- [Metals API](https://metals-api.com/) (kostenpflichtig)
- [Yahoo Finance](https://finance.yahoo.com/) (via yfinance oder scraping)

## 🔒 Sicherheit

- **Cron Secret**: Setzen Sie `CRON_SECRET` in `.env` und verwenden Sie es in der Authorization-Header für `/api/cron/fetch-data`.
- **Database**: Verwenden Sie sichere Passwörter und SSL-Verbindungen.
- **API Keys**: Speichern Sie API Keys niemals im Code, nur in `.env`.

## 🐛 Troubleshooting

### "No data available"
- Führen Sie den ersten Datenabruf aus: `npm run cron:fetch`
- Überprüfen Sie `fetch_logs` Tabelle für Fehler

### XLS Download schlägt fehl
- CME-Server könnte down sein
- User-Agent Header könnte erforderlich sein (bereits implementiert)
- Firewall/Proxy-Probleme

### FX Rate Fehler
- Fallback zu ECB ist implementiert
- Manueller Wert kann in DB eingefügt werden

### Prisma Fehler
- `npx prisma generate` erneut ausführen
- `DATABASE_URL` überprüfen
- Datenbank muss erreichbar sein

## 📚 Weitere Ressourcen

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [CME Group Data](https://www.cmegroup.com/market-data.html)
- [SGE Website](https://www.sge.com.cn)

## 🤝 Beitragen

Dieses Projekt ist für persönliche Analysen gedacht. Forks und Verbesserungen sind willkommen!

## ⚖️ Disclaimer

**Wichtig**: Diese App dient nur zu Informationszwecken. 
- "Registered" Bestände ≠ Total physisch verfügbares Silber
- Keine Trading-Empfehlungen
- Keine Finanzberatung
- Datenquellen können Verzögerungen oder Fehler enthalten

Verwenden Sie die Daten auf eigene Verantwortung.

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) für Details.

---

**Entwickelt mit ❤️ für Silber-Markt-Transparenz**
