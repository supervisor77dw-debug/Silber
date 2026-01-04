-- CreateTable metal_prices for historical backfill data
CREATE TABLE IF NOT EXISTS "metal_prices" (
    "id" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "metal_prices_date_key" ON "metal_prices"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "metal_prices_date_idx" ON "metal_prices"("date");
