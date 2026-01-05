import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { jsonResponseNoCache } from '@/lib/headers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/retail-prices
 * 
 * Returns latest retail prices per provider/product
 * Uses DISTINCT ON to get only newest entry per combination
 */
export async function GET() {
  try {
    // Get latest retail prices - one per provider/product combo
    const latestPrices = await prisma.$queryRaw<any[]>`
      SELECT DISTINCT ON (provider, product)
        date,
        provider,
        product,
        price_eur as "priceEur",
        price_usd as "priceUsd",
        currency,
        fx_rate as "fxRate",
        fine_oz as "fineOz",
        implied_usd_oz as "impliedUsdOz",
        premium_percent as "premiumPercent",
        source,
        source_url as "sourceUrl",
        verification_status as "verificationStatus",
        fetched_at as "fetchedAt"
      FROM retail_prices
      ORDER BY provider, product, date DESC, fetched_at DESC
    `;

    return jsonResponseNoCache({
      ok: true,
      count: latestPrices.length,
      prices: latestPrices.map(p => ({
        date: p.date.toISOString().split('T')[0],
        provider: p.provider,
        product: p.product,
        priceEur: Number(p.priceEur),
        priceUsd: p.priceUsd ? Number(p.priceUsd) : null,
        currency: p.currency || 'EUR',
        fxRate: p.fxRate ? Number(p.fxRate) : null,
        fineOz: Number(p.fineOz),
        impliedUsdOz: p.impliedUsdOz ? Number(p.impliedUsdOz) : null,
        premiumPercent: p.premiumPercent ? Number(p.premiumPercent) : null,
        source: p.source,
        sourceUrl: p.sourceUrl,
        verificationStatus: p.verificationStatus,
        fetchedAt: p.fetchedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[Retail Prices API Error]:', error);
    return jsonResponseNoCache(
      { 
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      500
    );
  }
}
