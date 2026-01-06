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
        raw_excerpt as "rawExcerpt",
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
        fineOz: Number(p.fineOz || 1.0),
        impliedUsdOz: p.impliedUsdOz ? Number(p.impliedUsdOz) : null,
        premiumPercent: p.premiumPercent ? Number(p.premiumPercent) : null,
        source: p.source || 'scraper',
        sourceUrl: p.sourceUrl,
        verificationStatus: p.verificationStatus || 'UNVERIFIED',
        rawExcerpt: p.rawExcerpt,
        fetchedAt: p.fetchedAt.toISOString(),
      })),
    });
  } catch (error) {
    // NEVER return 500 - return 200 with error status instead
    console.error('[Retail Prices API Error]:', error);
    
    return jsonResponseNoCache({
      ok: false,
      count: 0,
      prices: [],
      status: 'unverified',
      error: error instanceof Error ? error.message : String(error),
      message: 'Retail prices unavailable - scraper may need updating',
    }, 200); // Status 200 to avoid UI breakage
  }
}
