# Silver Market Monitor - Production Setup

**COMEX vs SGE Silver Spread Tracker with Physical Stress Index (PSI)**

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 20 LTS (see `.nvmrc`)
- Docker & Docker Compose
- Git

### 1. Clone & Install
```bash
git clone <your-repo>
cd Silber_Analyse
npm install
```

### 2. Start PostgreSQL
```bash
docker compose up -d
```

Database will be available at:
- **Host**: localhost:5432
- **User**: silber_user
- **Password**: silber_password
- **Database**: silber_analyse
- **Adminer UI**: http://localhost:8080

### 3. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your configuration (or use defaults for local dev).

### 4. Run Migrations
```bash
npx prisma migrate dev
npx prisma generate
```

### 5. Seed Test Data (Optional)
```bash
npm run db:seed
```

### 6. Start Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## 📦 Database Schema

### Core Tables
- **comex_stocks** - Daily COMEX warehouse inventories
- **sge_prices** - Shanghai Gold Exchange benchmark prices
- **fx_rates** - USD/CNY exchange rates
- **comex_prices** - COMEX spot price reference
- **daily_spreads** - Calculated spreads + PSI metrics
- **fetch_logs** - Data pipeline monitoring

### Warehouse Detail
- **comex_warehouses** - Per-warehouse breakdown (Brinks, Loomis, etc.)

### Alerting (Future)
- **alert_configs** - Alert rule definitions
- **alert_history** - Triggered alert log

---

## 🔄 Data Pipeline

### Daily Automated Fetch
Runs via **Vercel Cron** (production) or **GitHub Actions** (backup):
- **Schedule**: Daily at 08:00 UTC (09:00 Berlin)
- **Endpoint**: `POST /api/cron/fetch-data`
- **Protection**: Requires `Authorization: Bearer ${CRON_SECRET}` header

### Manual Fetch (Today)
```bash
npm run cron:fetch
```

### Backfill Historical Data
```bash
# Last 30 days
npm run cron:backfill -- --days 30

# Specific date range
npm run cron:backfill -- --from 2025-01-01 --to 2025-12-31

# Dry run (test without saving)
npm run cron:backfill -- --days 7 --dry-run
```

**Backfill Features**:
- ✅ Idempotent (upsert by market_date)
- ✅ Rate limiting with exponential backoff
- ✅ Retry logic (3-5 attempts)
- ✅ Partial success handling
- ✅ Comprehensive error logging
- ✅ Progress tracking (day x/y)
- ✅ Summary report at end

---

## 🔧 Development Commands

```bash
# Database
npm run db:generate      # Generate Prisma Client
npm run db:push          # Push schema changes (dev only)
npm run db:migrate       # Create migration
npm run db:studio        # Open Prisma Studio (GUI)
npm run db:seed          # Insert test data

# Development
npm run dev              # Start Next.js dev server
npm run build            # Production build
npm run start            # Start production server
npm run lint             # Run ESLint
npx tsc --noEmit         # Type checking

# Data Pipeline
npm run cron:fetch       # Fetch today's data
npm run cron:backfill    # Backfill historical data
```

---

## 🌐 Deployment (Vercel)

### 1. Prerequisites
- GitHub repository (private recommended)
- Vercel account
- PostgreSQL database (Supabase/Vercel Postgres/AWS RDS)

### 2. Environment Variables (Vercel)
Set in Vercel Dashboard → Settings → Environment Variables:

```env
# Database (Required)
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public&connection_limit=10"

# Cron Protection (Required)
CRON_SECRET="your-random-secret-key"

# Manual Price Overrides (Optional - for testing/fallback)
COMEX_MANUAL_SPOT_USD_OZ="31.25"
SGE_MANUAL_PRICE_CNY_G="7.45"

# API Keys (Optional - for automated data fetching)
METALS_API_KEY="your-metals-api-key"
ALPHA_VANTAGE_API_KEY="your-alpha-vantage-key"
```

### 3. Deploy
```bash
# Link to Vercel
vercel link

# Deploy
vercel --prod
```

### 4. Run Initial Migration
```bash
# From local machine (connected to production DB)
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

### 5. Backfill Historical Data
```bash
# Option A: Local script targeting production API
CRON_ENDPOINT="https://your-app.vercel.app/api/cron/fetch-data" \
CRON_SECRET="your-secret" \
npm run cron:backfill -- --days 90

# Option B: One-time Vercel Function run
# Trigger via Vercel Dashboard or API
```

### 6. Verify Cron Job
- Go to Vercel Dashboard → Your Project → Cron Jobs
- Verify daily schedule is active
- Check logs after first run

---

## 📊 Data Sources

### COMEX Silver Stocks
- **Source**: CME Group Official Reports
- **URL**: https://www.cmegroup.com/delivery_reports/Silver_stocks.xls
- **Format**: XLS file with warehouse-level detail
- **Frequency**: Daily (business days)
- **Parser**: Robust with flexible header detection

### SGE Shanghai Benchmark
- **Source**: Shanghai Gold Exchange (官方)
- **URL**: https://www.sge.com.cn/sge/en/benchmark/silver
- **Fallback**: Kitco web scraping, metals-api.com
- **Manual Override**: `SGE_MANUAL_PRICE_CNY_G` env var
- **Unit**: CNY per gram → converted to USD/oz

### FX Rates (USD/CNY)
- **Primary**: exchangerate.host (free, no auth)
- **Fallback**: European Central Bank (ECB) XML feed
- **Retry**: 3 attempts with backoff

### COMEX Spot Price
- **Primary**: Manual override (`COMEX_MANUAL_SPOT_USD_OZ`)
- **API Options**: metals-api.com, metals.dev, Yahoo Finance (SI=F)
- **Recommended**: metals-api.com (50 req/month free tier)

---

## 🔍 Monitoring & Logging

### Fetch Logs
All data fetches are logged in `fetch_logs` table:
- **Status**: success / partial / failed
- **Error codes**: COMEX_DOWNLOAD_FAIL, SGE_PARSE_FAIL, etc.
- **Duration**: milliseconds
- **Date + Source**: indexed for queries

### Data Quality Dashboard
View in UI: `/` → Data Quality section
- Recent fetch status (last 7 days)
- Error messages
- Missing data gaps

### Prisma Studio (Local)
```bash
npm run db:studio
```
Browse/edit database directly at http://localhost:5555

---

## 🧪 Testing

### Unit Tests (TODO)
```bash
npm test
```

### E2E Tests (TODO)
```bash
npm run test:e2e
```

### Manual API Tests
```bash
# Fetch today's data
curl -X POST http://localhost:3000/api/cron/fetch-data \
  -H "Authorization: Bearer your-secret" \
  -H "Content-Type: application/json" \
  -d '{"date": "2025-01-15"}'

# Get dashboard data
curl http://localhost:3000/api/dashboard

# Get spreads
curl http://localhost:3000/api/spreads?days=30

# Export CSV
curl http://localhost:3000/api/export > data.csv
```

---

## 📁 Project Structure

```
Silber_Analyse/
├── .github/
│   └── workflows/
│       ├── ci.yml              # CI pipeline (Node 20)
│       └── daily-fetch.yml     # Backup cron
├── app/
│   ├── api/
│   │   ├── cron/fetch-data/    # Main data fetch endpoint
│   │   ├── dashboard/          # Dashboard data API
│   │   ├── spreads/            # Spread time-series API
│   │   └── export/             # CSV export API
│   ├── page.tsx                # Main dashboard page
│   └── layout.tsx
├── components/
│   ├── Dashboard.tsx           # Main UI
│   ├── MetricCard.tsx
│   ├── StockChart.tsx
│   ├── PriceChart.tsx
│   ├── SpreadChart.tsx
│   └── DataQuality.tsx
├── lib/
│   ├── fetchers/
│   │   ├── comex.ts            # COMEX XLS parser (robust)
│   │   ├── sge.ts              # SGE price fetcher (3 strategies)
│   │   ├── fx.ts               # FX rate fetcher (2 sources)
│   │   └── comex-price.ts      # COMEX spot price (4 fallbacks)
│   ├── calculations.ts         # PSI, z-score, regime detection
│   ├── validators.ts           # Zod schemas
│   ├── constants.ts            # OZ_TO_GRAMS, thresholds
│   └── db.ts                   # Prisma client
├── prisma/
│   ├── schema.prisma           # Database schema (PostgreSQL)
│   ├── migrations/             # Migration history
│   └── seed.ts                 # Test data seeder
├── scripts/
│   ├── fetch-data.ts           # Standalone fetch CLI
│   └── backfill.ts             # Historical data backfill
├── raw-data/
│   └── comex/                  # Downloaded XLS files (git-ignored)
├── docker-compose.yml          # Local Postgres + Adminer
├── .nvmrc                      # Node 20
├── vercel.json                 # Vercel Cron config
├── QUICKSTART.md               # 5-minute local setup guide
└── README.md                   # This file
```

---

## 🚨 Troubleshooting

### Database Connection Issues
```bash
# Check Docker is running
docker compose ps

# Restart Postgres
docker compose restart postgres

# View logs
docker compose logs postgres
```

### Migration Errors
```bash
# Reset database (⚠️ DATA LOSS)
npx prisma migrate reset

# Re-apply migrations
npx prisma migrate deploy
```

### Prisma Client Out of Sync
```bash
npx prisma generate
```

### Build Errors
```bash
# Clear Next.js cache
rm -rf .next
npm run dev
```

### Port Already in Use
```bash
# Kill process on port 3000
npx kill-port 3000

# Or use different port
PORT=3001 npm run dev
```

---

## 📝 License

Private - All Rights Reserved

---

## 🤝 Contributing

This is a private project. Contact repository owner for access.

---

## 📞 Support

See [QUICKSTART.md](./QUICKSTART.md) for quick local setup.

For issues, check GitHub Issues or contact the maintainer.
