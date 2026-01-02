-- CreateTable
CREATE TABLE "comex_stocks" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMPTZ NOT NULL,
    "totalRegistered" DOUBLE PRECISION NOT NULL,
    "totalEligible" DOUBLE PRECISION NOT NULL,
    "totalCombined" DOUBLE PRECISION NOT NULL,
    "deltaRegistered" DOUBLE PRECISION,
    "deltaEligible" DOUBLE PRECISION,
    "deltaCombined" DOUBLE PRECISION,
    "registeredPercent" DOUBLE PRECISION,
    "sourceUrl" TEXT,
    "rawHash" TEXT,
    "metaJson" TEXT,
    "rawDataPath" TEXT,
    "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "hasAnomalies" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "comex_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comex_warehouses" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "warehouseName" TEXT NOT NULL,
    "registered" DOUBLE PRECISION NOT NULL,
    "eligible" DOUBLE PRECISION NOT NULL,
    "deposits" DOUBLE PRECISION,
    "withdrawals" DOUBLE PRECISION,
    "adjustments" DOUBLE PRECISION,

    CONSTRAINT "comex_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sge_prices" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "priceCnyPerGram" DOUBLE PRECISION NOT NULL,
    "priceUsdPerOz" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'CNY/g',
    "sourceUrl" TEXT,
    "fxRateUsed" DOUBLE PRECISION,
    "metaJson" TEXT,
    "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isValidated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sge_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMPTZ NOT NULL,
    "usdCnyRate" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ECB',
    "metaJson" TEXT,
    "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comex_prices" (
    "id" TEXT NOT NULL,
    "marketDate" DATE NOT NULL,
    "priceUsdPerOz" DOUBLE PRECISION NOT NULL,
    "contract" TEXT NOT NULL DEFAULT 'Spot',
    "sourceName" TEXT,
    "sourceUrl" TEXT,
    "metaJson" TEXT,
    "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comex_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_spreads" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sgeUsdPerOz" DOUBLE PRECISION NOT NULL,
    "comexUsdPerOz" DOUBLE PRECISION NOT NULL,
    "spreadUsdPerOz" DOUBLE PRECISION NOT NULL,
    "spreadPercent" DOUBLE PRECISION NOT NULL,
    "registered" DOUBLE PRECISION NOT NULL,
    "eligible" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "registeredPercent" DOUBLE PRECISION,
    "dataQuality" TEXT NOT NULL DEFAULT 'OK',
    "notesJson" TEXT,
    "psi" DOUBLE PRECISION,
    "psiStressLevel" TEXT,
    "isExtreme" BOOLEAN NOT NULL DEFAULT false,
    "zScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_spreads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fetch_logs" (
    "id" TEXT NOT NULL,
    "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "errors" TEXT,
    "dataDate" DATE,

    CONSTRAINT "fetch_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comex_stocks_date_key" ON "comex_stocks"("date");

-- CreateIndex
CREATE INDEX "comex_stocks_date_idx" ON "comex_stocks"("date");

-- CreateIndex
CREATE UNIQUE INDEX "sge_prices_date_key" ON "sge_prices"("date");

-- CreateIndex
CREATE INDEX "sge_prices_date_idx" ON "sge_prices"("date");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_date_key" ON "fx_rates"("date");

-- CreateIndex
CREATE INDEX "fx_rates_date_idx" ON "fx_rates"("date");

-- CreateIndex
CREATE UNIQUE INDEX "comex_prices_marketDate_key" ON "comex_prices"("marketDate");

-- CreateIndex
CREATE INDEX "comex_prices_marketDate_idx" ON "comex_prices"("marketDate");

-- CreateIndex
CREATE UNIQUE INDEX "daily_spreads_date_key" ON "daily_spreads"("date");

-- CreateIndex
CREATE INDEX "daily_spreads_date_idx" ON "daily_spreads"("date");

-- CreateIndex
CREATE INDEX "fetch_logs_fetchedAt_idx" ON "fetch_logs"("fetchedAt");

-- AddForeignKey
ALTER TABLE "comex_warehouses" ADD CONSTRAINT "comex_warehouses_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "comex_stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
